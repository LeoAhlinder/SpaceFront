import type { GridId } from "../ids";

/**
 * A territory surface. Planets use DiscGrid, the Corona will use PolarGrid (M2.5).
 * Systems only use this interface, so they work on any surface shape.
 *
 * Tiles are plain integer indexes in [0, size). Per-tile data lives in typed
 * arrays indexed by tile.
 */
export interface TileGrid {
  readonly id: GridId;
  /** Number of tile slots (including slots that are never usable, like space). */
  readonly size: number;
  /** Owner faction id per tile. 0 = neutral. */
  readonly owner: Uint16Array;
  /** Terrain per tile (see Terrain). */
  readonly terrain: Uint8Array;
  /** Most neighbors any tile can have; size `out` arrays for neighbors() with it. */
  readonly maxNeighbors: number;

  /**
   * Writes the usable neighbors of `tile` into `out` and returns how many there
   * are. Never allocates. Neighbor order is fixed, so iteration is deterministic.
   */
  neighbors(tile: number, out: Int32Array): number;

  /** True if the tile is part of the surface (not a padding/space slot). */
  isUsable(tile: number): boolean;
}
