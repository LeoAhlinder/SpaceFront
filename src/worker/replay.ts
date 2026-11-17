import type { TerrainMap } from "../core";
import { hashWorld, queueCommand, runTick } from "../core";
import type { ReplayCommand, ReplayLog } from "../shared/messages";
import type { Match } from "./match";
import { buildMatch } from "./match";

/** Replay file format version (bump when the file layout changes, not the game). */
export const REPLAY_FORMAT_VERSION = 1;

/** The replay of a match so far: its setup and the player's commands. */
export function replayOf(match: Match, commands: readonly ReplayCommand[]): ReplayLog {
  return {
    format: "spacefront-replay",
    version: REPLAY_FORMAT_VERSION,
    setup: match.setup,
    commands,
    endTick: match.world.tick,
    endHash: hashWorld(match.world),
  };
}

export function encodeReplay(log: ReplayLog): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(log));
}

/** Parses and checks a replay file (validation at the edge: files can be anything). */
export function decodeReplay(bytes: Uint8Array): ReplayLog {
  let log: unknown;
  try {
    log = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Not a SpaceFront replay");
  }
  const r = log as Partial<ReplayLog> | null;
  if (r?.format !== "spacefront-replay") throw new Error("Not a SpaceFront replay");
  if (r.version !== REPLAY_FORMAT_VERSION) {
    throw new Error(`Replay format ${String(r.version)} isn't supported`);
  }
  const commands: unknown = r.commands;
  const ticksOk =
    Array.isArray(commands) &&
    (commands as ReplayCommand[]).every(
      (c, i, all) => Number.isInteger(c.tick) && (i === 0 || c.tick >= all[i - 1]!.tick),
    );
  if (!r.setup || !ticksOk || !Number.isInteger(r.endTick) || typeof r.endHash !== "number") {
    throw new Error("Replay is damaged");
  }
  return r as ReplayLog;
}

/**
 * Plays a replay in a match: queues the recorded commands for their ticks.
 * `next` is the index of the first command not queued yet; returns the new one.
 */
export function queueReplayCommands(match: Match, log: ReplayLog, next: number): number {
  const tick = match.world.tick;
  let i = next;
  while (i < log.commands.length && log.commands[i]!.tick <= tick) {
    const c = log.commands[i++]!;
    if (c.tick === tick) queueCommand(match.world, c.command, tick);
  }
  return i;
}

/**
 * Runs a whole replay as fast as possible and returns the final hash (and
 * one every `every` ticks). Used by tests and to check a replay's sync.
 */
export function runReplay(
  log: ReplayLog,
  maps: ReadonlyMap<string, TerrainMap>,
  every = 50,
): { finalHash: number; hashes: number[]; match: Match } {
  const match = buildMatch(log.setup, maps);
  const hashes: number[] = [];
  let next = 0;
  while (match.world.tick < log.endTick) {
    next = queueReplayCommands(match, log, next);
    runTick(match.world);
    if (match.world.tick % every === 0) hashes.push(hashWorld(match.world));
  }
  return { finalHash: hashWorld(match.world), hashes, match };
}
