import type { GameEvent } from "../world/diplomacy";
import { refGrid, refTile } from "../world/tileRef";
import type {
  CombatEffect,
  Fallout,
  Ship,
  ShipKind,
  Structure,
  StructureKind,
  World,
} from "../world/world";
import { coronaTiles, gridOf } from "../world/world";

/**
 * Numbers per faction in TickDelta.stats: id, alive (0/1), troops, workers,
 * land tiles (bodies only, as the win condition counts them), solars,
 * Corona troops, Corona tiles, traitor until (tick, 0 = never).
 */
export const FACTION_STATS_STRIDE = 9;

/** A structure's current state, sent whenever it is built, finished or captured. */
export interface StructureView {
  readonly id: number;
  readonly kind: StructureKind;
  readonly owner: number;
  readonly grid: number;
  readonly tile: number;
  readonly buildTicksLeft: number;
  /** Launch Silos: the tick they are loaded again. */
  readonly readyTick: number;
  /** Destroyed by a weapon or a Warship: gone from the map. */
  readonly destroyed: boolean;
}

/** Numbers per Warship in TickDelta.warships: id, owner, x, y, hit points, guarded grid (-1). */
export const WARSHIP_STRIDE = 6;

/** A launched ship and its whole route, so the client can animate it on its own. */
export interface ShipView {
  readonly id: number;
  readonly kind: ShipKind;
  readonly owner: number;
  readonly troops: number;
  readonly fromGrid: number;
  readonly fromTile: number;
  readonly toGrid: number;
  readonly toTile: number;
  readonly launchTick: number;
  readonly arriveTick: number;
  /** Space route as x, y pairs (empty for a hop within one map). */
  readonly waypoints: readonly number[];
}

/**
 * What changed since the last drain: everything the client needs to update
 * its view. Tile and stat data are typed arrays so the worker can transfer
 * them cheaply.
 */
export interface TickDelta {
  /** The world tick after the changes (number of ticks completed). */
  readonly tick: number;
  /** Owner changes as (grid, tile, owner) triples, in the order they happened. */
  readonly tiles: Uint32Array;
  /** FACTION_STATS_STRIDE numbers per faction (excluding neutral), in id order. */
  readonly stats: Float64Array;
  /** Structures that were built, finished or captured. */
  readonly structures: readonly StructureView[];
  readonly shipsLaunched: readonly ShipView[];
  /** Ids of ships that arrived (and are gone). */
  readonly shipsLanded: readonly number[];
  /** Winning faction id, or -1 while the match runs. */
  readonly winner: number;
  /** Diplomacy and weapon events since the last drain (requests, alliances, warnings…). */
  readonly events: readonly GameEvent[];
  /** Every Warship now, WARSHIP_STRIDE numbers each (they move every tick). */
  readonly warships: Int32Array;
  /** Shots, blasts and weapon impacts to draw. */
  readonly effects: readonly CombatEffect[];
  /** The full diplomacy picture, sent only when something diplomatic happened. */
  readonly diplomacy: DiplomacySnapshot | null;
}

/** Alliances and embargoes as flat id pairs. */
export interface DiplomacySnapshot {
  /** Allied pairs: a, b, a, b, … */
  readonly alliances: readonly number[];
  /** Embargoes from → to: from, to, from, to, … */
  readonly embargoes: readonly number[];
}

/** The current alliances and embargoes (for the host's init message and deltas). */
export function diplomacySnapshot(world: World): DiplomacySnapshot {
  const split = (keys: Iterable<number>) =>
    [...keys].sort((a, b) => a - b).flatMap((k) => [Math.floor(k / 0x10000), k % 0x10000]);
  return {
    alliances: split(world.diplomacy.alliances),
    embargoes: split(world.diplomacy.embargoes),
  };
}

function structureView(s: Structure): StructureView {
  return {
    id: s.id,
    kind: s.kind,
    owner: s.owner,
    grid: s.grid,
    tile: s.tile,
    buildTicksLeft: s.buildTicksLeft,
    readyTick: s.readyTick,
    destroyed: s.destroyed,
  };
}

function shipView(s: Ship): ShipView {
  return {
    id: s.id,
    kind: s.kind,
    owner: s.owner,
    troops: s.troops,
    fromGrid: s.fromGrid,
    fromTile: s.fromTile,
    toGrid: s.toGrid,
    toTile: s.toTile,
    launchTick: s.launchTick,
    arriveTick: s.arriveTick,
    waypoints: s.waypoints.flatMap((p) => [p.x, p.y]),
  };
}

/** Everything on the map right now, for a client joining a match in progress (a loaded save). */
export interface WorldSnapshot {
  readonly structures: readonly StructureView[];
  readonly ships: readonly ShipView[];
  readonly fallout: readonly Fallout[];
}

/** The structures standing, ships in flight and fallout of a world, as the client draws them. */
export function snapshotViews(world: World): WorldSnapshot {
  return {
    structures: world.structures.filter((s) => !s.destroyed).map(structureView),
    ships: world.ships.map(shipView),
    fallout: world.fallout.map((f) => ({ ...f })),
  };
}

/** Starts recording changes, so drainDelta can report them. */
export function trackChanges(world: World): void {
  world.log ??= {
    tiles: [],
    structures: [],
    shipsLaunched: [],
    shipsLanded: [],
    events: [],
    effects: [],
  };
}

/** Collects and clears everything that changed since the last call. */
export function drainDelta(world: World): TickDelta {
  const log = world.log;
  const changes = log?.tiles ?? [];
  const tiles = new Uint32Array(changes.length * 3);
  for (let i = 0; i < changes.length; i++) {
    const ref = changes[i]!;
    const grid = refGrid(ref);
    const tile = refTile(ref);
    tiles[i * 3] = grid;
    tiles[i * 3 + 1] = tile;
    tiles[i * 3 + 2] = gridOf(world, grid)!.owner[tile]!;
  }

  const factions = world.factions.length - 1;
  const stats = new Float64Array(factions * FACTION_STATS_STRIDE);
  for (let i = 0; i < factions; i++) {
    const f = world.factions[i + 1]!;
    const o = i * FACTION_STATS_STRIDE;
    stats[o] = f.id;
    stats[o + 1] = f.alive ? 1 : 0;
    stats[o + 2] = f.troops;
    stats[o + 3] = f.workers;
    const corona = coronaTiles(world, f);
    stats[o + 4] = f.tileCount - corona;
    stats[o + 5] = f.solars;
    stats[o + 6] = f.coronaTroops;
    stats[o + 7] = corona;
    stats[o + 8] = f.traitorUntil;
  }

  const structures = [...new Set(log?.structures ?? [])].map((id) =>
    structureView(world.structures[id]!),
  );
  const launched = new Set(log?.shipsLaunched ?? []);
  const shipsLaunched = world.ships.filter((s) => launched.has(s.id)).map(shipView);
  const shipsLanded = [...(log?.shipsLanded ?? [])];
  const events = [...(log?.events ?? [])];
  const effects = [...(log?.effects ?? [])];
  const warships = new Int32Array(world.warships.length * WARSHIP_STRIDE);
  world.warships.forEach((w, i) =>
    warships.set([w.id, w.owner, w.x, w.y, w.hp, w.guardGrid], i * WARSHIP_STRIDE),
  );

  if (log) {
    log.tiles.length = 0;
    log.structures.length = 0;
    log.shipsLaunched.length = 0;
    log.shipsLanded.length = 0;
    log.events.length = 0;
    log.effects.length = 0;
  }
  return {
    tick: world.tick,
    tiles,
    stats,
    structures,
    shipsLaunched,
    shipsLanded,
    winner: world.winner ?? -1,
    events,
    warships,
    effects,
    diplomacy: events.length > 0 ? diplomacySnapshot(world) : null,
  };
}
