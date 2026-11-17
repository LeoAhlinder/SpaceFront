import type { GridId } from "../ids";
import { Terrain } from "./terrain";
import type { TileGrid } from "./tileGrid";

/** The Corona's three bands, from the Sun outward (GAMEPLAY_PLAN.md §5). */
export const Band = {
  Inner: 0,
  Middle: 1,
  Outer: 2,
} as const;

export type Band = (typeof Band)[keyof typeof Band];

/** Band names as used in BALANCE (indexed by Band). */
export const BAND_KEYS = ["inner", "middle", "outer"] as const;

/**
 * A ring-shaped surface: `rings` × `sectors` tiles around a center (the
 * Corona). Ring 0 is the innermost. Tile index = ring × sectors + sector.
 * Sectors wrap around (the last sector borders the first); rings don't.
 * Neighbors are the four edge-adjacent tiles: inward, counter-clockwise
 * (sector − 1), clockwise (sector + 1), outward.
 */
export class PolarGrid implements TileGrid {
  readonly id: GridId;
  readonly rings: number;
  readonly sectors: number;
  /** Rings in the inner band; the next `middleRings` are the middle band, the rest outer. */
  readonly innerRings: number;
  readonly middleRings: number;
  readonly size: number;
  readonly owner: Uint16Array;
  readonly terrain: Uint8Array;
  readonly maxNeighbors = 4;

  constructor(id: GridId, rings: number, sectors: number, innerRings: number, middleRings: number) {
    if (!Number.isInteger(rings) || rings < 1 || rings > 0xffff) {
      throw new RangeError(`PolarGrid rings must be an integer 1–65535, got ${rings}`);
    }
    if (!Number.isInteger(sectors) || sectors < 3 || sectors > 0xffff) {
      throw new RangeError(`PolarGrid sectors must be an integer 3–65535, got ${sectors}`);
    }
    if (innerRings < 0 || middleRings < 0 || innerRings + middleRings > rings) {
      throw new RangeError("PolarGrid bands don't fit in its rings");
    }
    this.id = id;
    this.rings = rings;
    this.sectors = sectors;
    this.innerRings = innerRings;
    this.middleRings = middleRings;
    this.size = rings * sectors;
    this.owner = new Uint16Array(this.size);
    // The Corona is uniform: every tile costs the same to take.
    this.terrain = new Uint8Array(this.size).fill(Terrain.Plains);
  }

  ring(tile: number): number {
    return Math.floor(tile / this.sectors);
  }

  sector(tile: number): number {
    return tile % this.sectors;
  }

  /** Tile index at (ring, sector); sectors wrap, rings outside the grid give -1. */
  index(ring: number, sector: number): number {
    if (ring < 0 || ring >= this.rings) return -1;
    const s = ((sector % this.sectors) + this.sectors) % this.sectors;
    return ring * this.sectors + s;
  }

  /** Which band a tile lies in. */
  band(tile: number): Band {
    const ring = this.ring(tile);
    if (ring < this.innerRings) return Band.Inner;
    if (ring < this.innerRings + this.middleRings) return Band.Middle;
    return Band.Outer;
  }

  isUsable(tile: number): boolean {
    return Number.isInteger(tile) && tile >= 0 && tile < this.size;
  }

  /** Steps between two tiles: ring difference plus the shorter way around. */
  distance(a: number, b: number): number {
    const s = this.sectors;
    const ds = Math.abs((a % s) - (b % s));
    return Math.abs(Math.floor(a / s) - Math.floor(b / s)) + Math.min(ds, s - ds);
  }

  neighbors(tile: number, out: Int32Array): number {
    const s = this.sectors;
    const sector = tile % s;
    const base = tile - sector;
    let n = 0;
    // Fixed order: inward, counter-clockwise, clockwise, outward.
    if (tile >= s) out[n++] = tile - s;
    out[n++] = base + (sector === 0 ? s - 1 : sector - 1);
    out[n++] = base + (sector === s - 1 ? 0 : sector + 1);
    if (tile + s < this.size) out[n++] = tile + s;
    return n;
  }
}
