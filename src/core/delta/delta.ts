import { refGrid, refTile } from "../world/tileRef";
import type { World } from "../world/world";

/** Numbers per faction in TickDelta.stats: id, alive (0/1), troops, workers, tileCount. */
export const FACTION_STATS_STRIDE = 5;

/**
 * What changed since the last drain: everything the client needs to update
 * its view. Built from typed arrays so the worker can transfer it cheaply.
 */
export interface TickDelta {
  /** The world tick after the changes (number of ticks completed). */
  readonly tick: number;
  /** Owner changes as (grid, tile, owner) triples, in the order they happened. */
  readonly tiles: Uint32Array;
  /** FACTION_STATS_STRIDE numbers per faction (excluding neutral), in id order. */
  readonly stats: Float64Array;
  /** Winning faction id, or -1 while the match runs. */
  readonly winner: number;
}

/** Starts recording tile changes, so drainDelta can report them. */
export function trackChanges(world: World): void {
  world.changes ??= [];
}

/** Collects and clears everything that changed since the last call. */
export function drainDelta(world: World): TickDelta {
  const changes = world.changes ?? [];
  const tiles = new Uint32Array(changes.length * 3);
  for (let i = 0; i < changes.length; i++) {
    const ref = changes[i]!;
    const grid = refGrid(ref);
    const tile = refTile(ref);
    tiles[i * 3] = grid;
    tiles[i * 3 + 1] = tile;
    tiles[i * 3 + 2] = world.grids[grid]!.owner[tile]!;
  }
  if (world.changes) world.changes.length = 0;

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
  return { tick: world.tick, tiles, stats, winner: world.winner ?? -1 };
}
