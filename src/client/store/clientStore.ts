import { signal } from "@preact/signals";
import type { FactionKind, TickDelta } from "../../core";
import type { MatchInit, WorkerMessage } from "../../shared/messages";
import { factionColor } from "../render/colors";

/** Must match core's FACTION_STATS_STRIDE (client can't import core values). */
const STATS_STRIDE = 5;
const LEADERBOARD_SIZE = 10;

export type Phase = "menu" | "loading" | "playing" | "ended";

export interface FactionView {
  readonly id: number;
  readonly name: string;
  readonly kind: FactionKind;
  readonly color: number;
  alive: boolean;
  troops: number;
  workers: number;
  tileCount: number;
}

/**
 * UI state as signals: Preact components re-render when these change.
 * The renderer reads `view` instead (big arrays, updated in place).
 */
export const ui = {
  phase: signal<Phase>("menu"),
  tick: signal(0),
  spawnPhaseTicks: signal(0),
  player: signal<FactionView | null>(null),
  leaderboard: signal<readonly FactionView[]>([]),
  winner: signal<FactionView | null>(null),
  error: signal<string | null>(null),
  /** Percent of troops sent per attack click (client-side setting). */
  attackRatioPct: signal(30),
  /** Percent of population kept as troops (sent to the sim as setRatio). */
  troopRatioPct: signal(60),
};

/** Map state for the renderer: owners per grid and the tiles that need redrawing. */
export const view = {
  init: null as MatchInit | null,
  owners: [] as Uint16Array[],
  /** Per grid: tiles whose owner changed since the renderer last drew. */
  dirty: [] as number[][],
  factions: new Map<number, FactionView>(),
};

export function applyWorkerMessage(message: WorkerMessage): void {
  switch (message.type) {
    case "init":
      applyInit(message.init);
      break;
    case "tick":
      applyDelta(message.delta);
      break;
    case "error":
      ui.error.value = message.message;
      break;
  }
}

function applyInit(init: MatchInit): void {
  view.init = init;
  view.owners = init.grids.map((g) => g.owner);
  view.dirty = init.grids.map(() => []);
  view.factions = new Map(
    init.factions.map((f) => [
      f.id,
      { ...f, color: factionColor(f.id, f.kind), alive: true, troops: 0, workers: 0, tileCount: 0 },
    ]),
  );
  ui.spawnPhaseTicks.value = init.spawnPhaseTicks;
  ui.tick.value = 0;
  ui.winner.value = null;
  ui.phase.value = "playing";
  publishFactions();
}

function applyDelta(delta: TickDelta): void {
  const { tiles, stats } = delta;
  for (let i = 0; i < tiles.length; i += 3) {
    const grid = tiles[i]!;
    const tile = tiles[i + 1]!;
    view.owners[grid]![tile] = tiles[i + 2]!;
    view.dirty[grid]!.push(tile);
  }
  for (let o = 0; o < stats.length; o += STATS_STRIDE) {
    const f = view.factions.get(stats[o]!);
    if (!f) continue;
    f.alive = stats[o + 1] === 1;
    f.troops = stats[o + 2]!;
    f.workers = stats[o + 3]!;
    f.tileCount = stats[o + 4]!;
  }
  ui.tick.value = delta.tick;
  if (delta.winner >= 0) {
    ui.winner.value = view.factions.get(delta.winner) ?? null;
    ui.phase.value = "ended";
  }
  publishFactions();
}

/** Pushes fresh copies into the signals so components re-render. */
function publishFactions(): void {
  const all = [...view.factions.values()];
  const player = all.find((f) => f.kind === "player");
  ui.player.value = player ? { ...player } : null;
  ui.leaderboard.value = all
    .filter((f) => f.alive && f.tileCount > 0)
    .sort((a, b) => b.tileCount - a.tileCount || a.id - b.id)
    .slice(0, LEADERBOARD_SIZE)
    .map((f) => ({ ...f }));
}

/** A faction's share of all ownable land (the win condition counts this). */
export function landShare(f: FactionView): number {
  const total = view.init?.ownableTiles ?? 0;
  return total === 0 ? 0 : f.tileCount / total;
}
