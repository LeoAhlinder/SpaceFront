import { refGrid, refTile } from "../world/tileRef";
import type { ShipKind, StructureKind, World } from "../world/world";

/** Numbers per faction in TickDelta.stats: id, alive (0/1), troops, workers, tileCount. */
export const FACTION_STATS_STRIDE = 5;

/** A structure's current state, sent whenever it is built, finished or captured. */
export interface StructureView {
  readonly id: number;
  readonly kind: StructureKind;
  readonly owner: number;
  readonly grid: number;
  readonly tile: number;
  readonly buildTicksLeft: number;
}

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
}

/** Starts recording changes, so drainDelta can report them. */
export function trackChanges(world: World): void {
  world.log ??= { tiles: [], structures: [], shipsLaunched: [], shipsLanded: [] };
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
    tiles[i * 3 + 2] = world.grids[grid]!.owner[tile]!;
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
    stats[o + 4] = f.tileCount;
  }

  const structures = [...new Set(log?.structures ?? [])].map((id) => {
    const s = world.structures[id]!;
    return {
      id: s.id,
      kind: s.kind,
      owner: s.owner,
      grid: s.grid,
      tile: s.tile,
      buildTicksLeft: s.buildTicksLeft,
    };
  });
  const launched = new Set(log?.shipsLaunched ?? []);
  const shipsLaunched = world.ships
    .filter((s) => launched.has(s.id))
    .map((s) => ({
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
    }));
  const shipsLanded = [...(log?.shipsLanded ?? [])];

  if (log) {
    log.tiles.length = 0;
    log.structures.length = 0;
    log.shipsLaunched.length = 0;
    log.shipsLanded.length = 0;
  }
  return {
    tick: world.tick,
    tiles,
    stats,
    structures,
    shipsLaunched,
    shipsLanded,
    winner: world.winner ?? -1,
  };
}
