import { signal } from "@preact/signals";
import type { FactionKind, ShipView, StructureView, TickDelta } from "../../core";
import { bodyById } from "../../data/bodies";
import type { MatchInit, WorkerMessage } from "../../shared/messages";
import { factionColor } from "../render/colors";

/** Must match core's FACTION_STATS_STRIDE (client can't import core values). */
const STATS_STRIDE = 6;
const LEADERBOARD_SIZE = 10;
/** Alerts disappear after this many ticks. */
const ALERT_TICKS = 120;
/** Terrain values that can be owned (Plains, Highlands, Mountains, Ice). */
const OWNABLE_MIN = 2;

export type Phase = "menu" | "loading" | "playing" | "ended";
export type ViewState =
  { readonly kind: "system" } | { readonly kind: "planet"; readonly grid: number };
/** What a click on a map does besides spawning/attacking: build something, or launch. */
export type Mode = "none" | "spaceport" | "habitat" | "launch";

export interface FactionView {
  readonly id: number;
  readonly name: string;
  readonly kind: FactionKind;
  readonly color: number;
  alive: boolean;
  troops: number;
  workers: number;
  tileCount: number;
  solars: number;
}

export interface Alert {
  readonly id: number;
  readonly text: string;
  readonly grid: number;
  readonly untilTick: number;
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
  /** Which view is shown: the solar system or one world's map. */
  view: signal<ViewState>({ kind: "system" }),
  /** What a click on a map does besides spawning/attacking. */
  mode: signal<Mode>("none"),
  /** The player's finished Spaceports (can launch). */
  readyPorts: signal(0),
  alerts: signal<readonly Alert[]>([]),
  /** Percent of troops sent per attack or launch (client-side setting). */
  attackRatioPct: signal(30),
  /** Percent of population kept as troops (sent to the sim as setRatio). */
  troopRatioPct: signal(60),
};

/** Map state for the renderer: owners, structures and ships, updated in place. */
export const view = {
  init: null as MatchInit | null,
  owners: [] as Uint16Array[],
  /** Per grid: tiles whose owner changed since the renderer last drew. */
  dirty: [] as number[][],
  factions: new Map<number, FactionView>(),
  /** Per grid: tile count per owner (for the system view's icon colors). */
  ownerCounts: [] as Map<number, number>[],
  /** Per grid: ownable tiles. */
  ownable: [] as number[],
  structures: new Map<number, StructureView>(),
  ships: new Map<number, ShipView>(),
  /** When the last tick arrived (performance.now()), for smooth motion between ticks. */
  lastTickAt: 0,
};

let nextAlertId = 1;

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
  view.ownerCounts = init.grids.map(() => new Map<number, number>());
  view.ownable = init.grids.map((g) => g.terrain.filter((t) => t >= OWNABLE_MIN).length);
  view.structures = new Map();
  view.ships = new Map();
  view.factions = new Map(
    init.factions.map((f) => [
      f.id,
      {
        ...f,
        color: factionColor(f.id, f.kind),
        alive: true,
        troops: 0,
        workers: 0,
        tileCount: 0,
        solars: 0,
      },
    ]),
  );
  ui.spawnPhaseTicks.value = init.spawnPhaseTicks;
  ui.tick.value = 0;
  ui.winner.value = null;
  ui.alerts.value = [];
  ui.mode.value = "none";
  ui.readyPorts.value = 0;
  const earth = init.grids.findIndex((g) => g.bodyId === "earth");
  ui.view.value = { kind: "planet", grid: Math.max(0, earth) };
  ui.phase.value = "playing";
  view.lastTickAt = performance.now();
  publishFactions();
}

function applyDelta(delta: TickDelta): void {
  const { tiles, stats } = delta;
  for (let i = 0; i < tiles.length; i += 3) {
    const grid = tiles[i]!;
    const tile = tiles[i + 1]!;
    const owner = tiles[i + 2]!;
    const counts = view.ownerCounts[grid]!;
    const old = view.owners[grid]![tile]!;
    if (old !== 0) counts.set(old, (counts.get(old) ?? 1) - 1);
    if (owner !== 0) counts.set(owner, (counts.get(owner) ?? 0) + 1);
    view.owners[grid]![tile] = owner;
    view.dirty[grid]!.push(tile);
  }
  for (let o = 0; o < stats.length; o += STATS_STRIDE) {
    const f = view.factions.get(stats[o]!);
    if (!f) continue;
    f.alive = stats[o + 1] === 1;
    f.troops = stats[o + 2]!;
    f.workers = stats[o + 3]!;
    f.tileCount = stats[o + 4]!;
    f.solars = stats[o + 5]!;
  }
  for (const s of delta.structures) view.structures.set(s.id, s);
  if (delta.structures.length > 0) {
    const me = view.init?.playerId;
    ui.readyPorts.value = [...view.structures.values()].filter(
      (s) => s.owner === me && s.kind === "spaceport" && s.buildTicksLeft === 0,
    ).length;
  }
  for (const ship of delta.shipsLaunched) {
    view.ships.set(ship.id, ship);
    alertForLaunch(ship, delta.tick);
  }
  for (const id of delta.shipsLanded) view.ships.delete(id);

  ui.tick.value = delta.tick;
  view.lastTickAt = performance.now();
  if (ui.alerts.value.some((a) => a.untilTick <= delta.tick)) {
    ui.alerts.value = ui.alerts.value.filter((a) => a.untilTick > delta.tick);
  }
  if (delta.winner >= 0) {
    ui.winner.value = view.factions.get(delta.winner) ?? null;
    ui.phase.value = "ended";
  }
  publishFactions();
}

/** Warns the player about enemy landers heading for a world where they hold land. */
function alertForLaunch(ship: ShipView, tick: number): void {
  const me = view.init?.playerId;
  if (me === undefined || ship.owner === me || ship.kind !== "troopLander") return;
  if ((view.ownerCounts[ship.toGrid]?.get(me) ?? 0) === 0) return;
  const enemy = view.factions.get(ship.owner)?.name ?? "Enemy";
  const world = worldName(ship.toGrid);
  pushAlert(`${enemy}'s lander is heading to ${world}`, ship.toGrid, tick);
}

export function pushAlert(text: string, grid: number, tick: number): void {
  const alert = { id: nextAlertId++, text, grid, untilTick: tick + ALERT_TICKS };
  ui.alerts.value = [...ui.alerts.value.slice(-3), alert];
}

export function dismissAlert(id: number): void {
  ui.alerts.value = ui.alerts.value.filter((a) => a.id !== id);
}

/** Display name of the world a grid belongs to. */
export function worldName(grid: number): string {
  const bodyId = view.init?.grids[grid]?.bodyId;
  return bodyId ? bodyById(bodyId).name : `World ${grid}`;
}

/** Structures of a kind the player owns (finished or not); build costs rise with this. */
export function ownedCount(kind: string): number {
  const me = view.init?.playerId;
  let n = 0;
  for (const s of view.structures.values()) if (s.owner === me && s.kind === kind) n++;
  return n;
}

/** The faction owning most of a grid's land, and its share of it (0–1). */
export function mainOwner(grid: number): { owner: number; share: number } | null {
  const counts = view.ownerCounts[grid];
  if (!counts) return null;
  let owner = 0;
  let best = 0;
  for (const [id, n] of counts) {
    if (n > best || (n === best && id < owner)) {
      owner = id;
      best = n;
    }
  }
  return best === 0 ? null : { owner, share: best / Math.max(1, view.ownable[grid] ?? 1) };
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
