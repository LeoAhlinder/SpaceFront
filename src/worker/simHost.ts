import type { TerrainMap } from "../core";
import {
  drainDelta,
  hashWorld,
  loadTerrainMap,
  loadWorld,
  queueCommand,
  runTick,
  saveWorld,
  TICK_MS,
  trackChanges,
} from "../core";
import type {
  ClientMessage,
  MatchSetup,
  ReplayCommand,
  ReplayLog,
  WorkerMessage,
} from "../shared/messages";
import { log } from "../shared/log";
import { gunzip, gzip } from "./compress";
import type { Match } from "./match";
import { buildMatch, MAP_IDS, matchInit, matchSummary } from "./match";
import { decodeReplay, encodeReplay, queueReplayCommands, replayOf } from "./replay";

export { botHomes } from "./match";

/** What the host needs from its environment (the worker, or a test). */
export interface HostEnv {
  post(message: WorkerMessage, transfer?: Transferable[]): void;
  /** Loads a file from the site root, e.g. "maps/earth/terrain.bin". */
  loadFile(path: string): Promise<Uint8Array>;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/** The header the host stores in every save, next to the world. */
interface SaveHeader {
  readonly kind: "spacefront-save";
  readonly playerId: number;
  readonly setup: MatchSetup;
  /** The player's commands so far, so the match's replay survives saving and loading. */
  readonly commands: readonly ReplayCommand[];
}

/** Fastest replay speed (times normal). */
const MAX_SPEED = 16;

/**
 * Owns the World in single-player: builds the match, runs ticks on a fixed
 * timer, applies the player's commands (recording them for the replay) and
 * posts a delta after every tick. Also saves, loads and plays replays. In
 * multiplayer (M6) commands will come from the server instead.
 */
export class SimHost {
  private match: Match | null = null;
  /** Every command the player gave this match, with its tick: the replay log. */
  private commands: ReplayCommand[] = [];
  /** While watching a replay: the log and the next command to queue. */
  private replay: { readonly log: ReplayLog; next: number } | null = null;
  private maps: Map<string, TerrainMap> | null = null;
  private paused = false;
  private speed = 1;
  private timer: unknown = null;

  constructor(private readonly env: HostEnv) {}

  handle(message: ClientMessage): void {
    switch (message.type) {
      case "start":
        this.run(() => this.start(message.setup), "Match failed to start");
        break;
      case "load":
        this.run(() => this.load(message.data), "Save could not be loaded");
        break;
      case "watchReplay":
        this.run(() => this.watch(message.data), "Replay could not be played");
        break;
      case "save":
        this.run(() => this.save(message.requestId), "Game could not be saved");
        break;
      case "getReplay":
        this.postReplay(message.requestId);
        break;
      case "pause":
        this.paused = message.paused;
        break;
      case "setSpeed":
        this.speed = Math.max(1, Math.min(MAX_SPEED, Math.round(message.speed)));
        if (this.timer !== null) this.startTimer();
        break;
      case "command": {
        // In single-player the client may only command its own faction, and not during replays.
        const match = this.match;
        if (!match || this.replay || message.command.faction !== match.playerId) break;
        queueCommand(match.world, message.command);
        this.commands.push({ tick: match.world.tick, command: message.command });
        break;
      }
    }
  }

  /** The running match's state hash (tests compare runs with it). */
  hash(): number {
    return this.match ? hashWorld(this.match.world) : 0;
  }

  /** Runs one tick and posts its delta. Public for tests. */
  step(): void {
    const match = this.match;
    if (!match || this.paused) return;
    const world = match.world;
    if (this.replay)
      this.replay.next = queueReplayCommands(match, this.replay.log, this.replay.next);
    const ctx = runTick(world);
    for (const r of ctx.rejected) {
      if (r.command.faction === match.playerId) log.debug("Command rejected:", r.reason, r.command);
    }
    const delta = drainDelta(world);
    this.env.post({ type: "tick", delta }, [delta.tiles.buffer, delta.stats.buffer]);
    if (this.replay && world.tick >= this.replay.log.endTick) {
      this.env.post({ type: "replayEnded", inSync: hashWorld(world) === this.replay.log.endHash });
      this.stop();
    } else if (world.winner !== null && !this.replay) {
      this.stop();
    }
  }

  /** Runs an async job; a failure becomes an error message for the client. */
  private run(job: () => Promise<void>, what: string): void {
    job().catch((error: unknown) => {
      log.error(what, error);
      this.env.post({ type: "error", message: `${what}: ${errorText(error)}` });
    });
  }

  private async start(setup: MatchSetup): Promise<void> {
    this.stop();
    this.begin(buildMatch(setup, await this.loadMaps()), [], null);
  }

  private async load(data: Uint8Array): Promise<void> {
    this.stop();
    const { world, header } = loadWorld<SaveHeader>(await gunzip(data));
    if (header.kind !== "spacefront-save" || !world.factions[header.playerId]) {
      throw new Error("Save is damaged");
    }
    this.begin(
      { world, playerId: header.playerId, setup: header.setup },
      [...header.commands],
      null,
    );
  }

  private async watch(data: Uint8Array): Promise<void> {
    this.stop();
    const replay = decodeReplay(data);
    this.begin(buildMatch(replay.setup, await this.loadMaps()), [], replay);
  }

  /** Makes a match the running one, tells the client, and starts the clock. */
  private begin(match: Match, commands: ReplayCommand[], replay: ReplayLog | null): void {
    trackChanges(match.world);
    this.match = match;
    this.commands = commands;
    this.replay = replay && { log: replay, next: 0 };
    this.paused = false;
    this.speed = 1;
    this.env.post({ type: "init", init: matchInit(match, replay !== null) });
    this.startTimer();
  }

  private async save(requestId: number): Promise<void> {
    const match = this.match;
    if (!match || this.replay) throw new Error("No match to save");
    const header: SaveHeader = {
      kind: "spacefront-save",
      playerId: match.playerId,
      setup: match.setup,
      commands: this.commands,
    };
    const summary = matchSummary(match);
    // Taken synchronously, so it is one tick's state even while the clock runs.
    const raw = saveWorld(match.world, header);
    const data = await gzip(raw);
    this.env.post({ type: "saveData", requestId, data, summary }, [data.buffer]);
  }

  private postReplay(requestId: number): void {
    const match = this.match;
    if (!match || this.replay) return;
    const data = encodeReplay(replayOf(match, this.commands));
    this.env.post({ type: "replayData", requestId, data, summary: matchSummary(match) }, [
      data.buffer,
    ]);
  }

  /** Every landable body's map, loaded once. */
  private async loadMaps(): Promise<Map<string, TerrainMap>> {
    if (this.maps) return this.maps;
    const maps = await Promise.all(MAP_IDS.map((id) => this.loadMap(id)));
    this.maps = new Map(maps.map((m) => [m.id, m]));
    return this.maps;
  }

  private async loadMap(id: string): Promise<TerrainMap> {
    const [terrain, info] = await Promise.all([
      this.env.loadFile(`maps/${id}/terrain.bin`),
      this.env.loadFile(`maps/${id}/regions.json`),
    ]);
    return loadTerrainMap(terrain, JSON.parse(new TextDecoder().decode(info)));
  }

  private startTimer(): void {
    if (this.timer !== null) this.env.clearInterval(this.timer);
    this.timer = this.env.setInterval(() => this.step(), TICK_MS / this.speed);
  }

  private stop(): void {
    if (this.timer !== null) this.env.clearInterval(this.timer);
    this.timer = null;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
