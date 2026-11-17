import type { TileGrid } from "../grid/tileGrid";
import type { FactionId } from "../ids";
import { NEUTRAL } from "../ids";
import type { World } from "./world";

/**
 * Changes a tile's owner and keeps tile counts right. The only function that
 * writes `grid.owner` during play. Eliminates a faction that loses its last tile.
 */
export function setOwner(world: World, grid: TileGrid, tile: number, newOwner: FactionId): void {
  const oldOwner = grid.owner[tile]!;
  if (oldOwner === newOwner) return;
  grid.owner[tile] = newOwner;
  if (newOwner !== NEUTRAL) world.factions[newOwner]!.tileCount += 1;
  if (oldOwner !== NEUTRAL) {
    const loser = world.factions[oldOwner]!;
    loser.tileCount -= 1;
    if (loser.tileCount === 0 && loser.hasSpawned) eliminate(world, oldOwner as FactionId);
  }
}

/**
 * Removes a faction from play. Its running attacks are dropped (and their
 * troops lost) by the attack system on its next pass.
 */
export function eliminate(world: World, id: FactionId): void {
  const faction = world.factions[id]!;
  faction.alive = false;
  faction.troops = 0;
  faction.workers = 0;
}
