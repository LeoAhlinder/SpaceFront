import type { TileGrid } from "../grid/tileGrid";
import type { FactionId } from "../ids";
import { NEUTRAL } from "../ids";
import { refGrid, refTile, tileRef } from "./tileRef";
import type { World } from "./world";

/**
 * Changes a tile's owner and keeps tile counts right. The only function that
 * writes `grid.owner` during play. Eliminates a faction that loses its last tile.
 */
export function setOwner(world: World, grid: TileGrid, tile: number, newOwner: FactionId): void {
  const oldOwner = grid.owner[tile]!;
  if (oldOwner === newOwner) return;
  grid.owner[tile] = newOwner;
  world.log?.tiles.push(tileRef(grid.id, tile));
  // Structures change hands with their tile.
  const structure = world.structureAt[grid.id]![tile]!;
  if (structure >= 0) {
    world.structures[structure]!.owner = newOwner;
    world.log?.structures.push(structure);
  }
  const slots = world.tileSlots[grid.id]!;
  if (oldOwner !== NEUTRAL) {
    // Swap-remove the tile from the loser's list.
    const loser = world.factions[oldOwner]!;
    const slot = slots[tile]!;
    const last = loser.tiles.pop()!;
    if (slot < loser.tiles.length) {
      loser.tiles[slot] = last;
      world.tileSlots[refGrid(last)]![refTile(last)] = slot;
    }
    slots[tile] = -1;
    loser.tileCount -= 1;
  }
  if (newOwner !== NEUTRAL) {
    const winner = world.factions[newOwner]!;
    slots[tile] = winner.tiles.length;
    winner.tiles.push(tileRef(grid.id, tile));
    winner.tileCount += 1;
  }
  if (oldOwner !== NEUTRAL) {
    const loser = world.factions[oldOwner]!;
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
