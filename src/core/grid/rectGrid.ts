import type { GridId } from "../ids";
import { Terrain } from "./terrain";
import type { TileGrid } from "./tileGrid";

/**
 * A flat rectangular map (every planet and moon is one). No wrap-around at
 * the edges. Tile index = y × width + x, with (0, 0) at the top-left.
 * Neighbors are the four edge-adjacent tiles (up, left, right, down).
 */
export class RectGrid implements TileGrid {
  readonly id: GridId;
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly owner: Uint16Array;
  readonly terrain: Uint8Array;
  readonly maxNeighbors = 4;

  constructor(id: GridId, width: number, height: number) {
    for (const [name, v] of [
      ["width", width],
      ["height", height],
    ] as const) {
      if (!Number.isInteger(v) || v < 1 || v > 0xffff) {
        throw new RangeError(`RectGrid ${name} must be an integer 1–65535, got ${v}`);
      }
    }
    this.id = id;
    this.width = width;
    this.height = height;
    this.size = width * height;
    this.owner = new Uint16Array(this.size);
    this.terrain = new Uint8Array(this.size).fill(Terrain.Plains);
  }

  /** Replaces the terrain with map data of the same size. */
  applyTerrain(terrain: Uint8Array): void {
    if (terrain.length !== this.size) throw new RangeError("terrain size doesn't match grid");
    this.terrain.set(terrain);
  }

  x(tile: number): number {
    return tile % this.width;
  }

  y(tile: number): number {
    return Math.floor(tile / this.width);
  }

  /** Tile index at (x, y), or -1 if outside the map. */
  index(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
    return y * this.width + x;
  }

  isUsable(tile: number): boolean {
    return tile >= 0 && tile < this.size && this.terrain[tile] !== Terrain.Space;
  }

  /** Manhattan distance, which matches the 4-neighbor step count on open ground. */
  distance(a: number, b: number): number {
    const w = this.width;
    return Math.abs((a % w) - (b % w)) + Math.abs(Math.floor(a / w) - Math.floor(b / w));
  }

  neighbors(tile: number, out: Int32Array): number {
    const w = this.width;
    const x = tile % w;
    let n = 0;
    // Fixed order: up, left, right, down. Space tiles (unused padding) are skipped.
    if (tile >= w && this.terrain[tile - w] !== Terrain.Space) out[n++] = tile - w;
    if (x > 0 && this.terrain[tile - 1] !== Terrain.Space) out[n++] = tile - 1;
    if (x < w - 1 && this.terrain[tile + 1] !== Terrain.Space) out[n++] = tile + 1;
    if (tile + w < this.size && this.terrain[tile + w] !== Terrain.Space) out[n++] = tile + w;
    return n;
  }
}
