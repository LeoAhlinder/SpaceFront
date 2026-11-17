import type { GridId } from "../ids";
import { Terrain } from "./terrain";
import type { TileGrid } from "./tileGrid";

/**
 * A round body (planet, moon, asteroid): a square grid of side 2·radius with
 * the tiles outside the circle marked as Space and never usable.
 *
 * Tile index = y × side + x, with (0, 0) at the top-left. Neighbors are the
 * four edge-adjacent tiles (up, left, right, down), skipping space.
 */
export class DiscGrid implements TileGrid {
  readonly id: GridId;
  readonly radius: number;
  readonly side: number;
  readonly size: number;
  readonly owner: Uint16Array;
  readonly terrain: Uint8Array;
  readonly maxNeighbors = 4;
  /** Number of usable (non-space) tiles. */
  readonly usableCount: number;

  constructor(id: GridId, radius: number) {
    if (!Number.isInteger(radius) || radius < 1) {
      throw new RangeError(`DiscGrid radius must be a positive integer, got ${radius}`);
    }
    this.id = id;
    this.radius = radius;
    this.side = radius * 2;
    this.size = this.side * this.side;
    this.owner = new Uint16Array(this.size);
    this.terrain = new Uint8Array(this.size);

    // A tile is inside if its center lies within the circle. Doubling all
    // coordinates keeps this integer-only: centers sit at odd coordinates.
    const r2 = 4 * radius * radius;
    let usable = 0;
    for (let y = 0; y < this.side; y++) {
      const dy = 2 * y + 1 - this.side;
      for (let x = 0; x < this.side; x++) {
        const dx = 2 * x + 1 - this.side;
        const inside = dx * dx + dy * dy <= r2;
        this.terrain[y * this.side + x] = inside ? Terrain.Plains : Terrain.Space;
        if (inside) usable++;
      }
    }
    this.usableCount = usable;
  }

  x(tile: number): number {
    return tile % this.side;
  }

  y(tile: number): number {
    return Math.floor(tile / this.side);
  }

  /** Tile index at (x, y), or -1 if outside the square. */
  index(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.side || y >= this.side) return -1;
    return y * this.side + x;
  }

  isUsable(tile: number): boolean {
    return tile >= 0 && tile < this.size && this.terrain[tile] !== Terrain.Space;
  }

  neighbors(tile: number, out: Int32Array): number {
    const side = this.side;
    const x = tile % side;
    let n = 0;
    // Fixed order: up, left, right, down.
    if (tile >= side && this.terrain[tile - side] !== Terrain.Space) out[n++] = tile - side;
    if (x > 0 && this.terrain[tile - 1] !== Terrain.Space) out[n++] = tile - 1;
    if (x < side - 1 && this.terrain[tile + 1] !== Terrain.Space) out[n++] = tile + 1;
    if (tile + side < this.size && this.terrain[tile + side] !== Terrain.Space) {
      out[n++] = tile + side;
    }
    return n;
  }
}
