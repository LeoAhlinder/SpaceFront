import type { GridId } from "../ids";

/**
 * A tile anywhere in the world packed into one number: grid × 2^24 + tile.
 * Grids hold far fewer than 2^24 (16.7 million) tiles, so this never collides.
 */
export type TileRef = number;

const STRIDE = 0x100_0000;

export function tileRef(grid: GridId, tile: number): TileRef {
  return grid * STRIDE + tile;
}

export function refGrid(ref: TileRef): GridId {
  return Math.floor(ref / STRIDE) as GridId;
}

export function refTile(ref: TileRef): number {
  return ref % STRIDE;
}
