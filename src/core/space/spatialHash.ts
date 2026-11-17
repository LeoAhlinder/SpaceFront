/**
 * A grid of buckets over space (ARCHITECTURE.md §4.6), so combat finds the
 * things near a point without comparing every pair. Holds plain numbers
 * (indexes into the caller's own lists). Rebuilt by its owner whenever
 * positions change; it is a lookup helper, not game state.
 */
export class SpatialHash {
  private readonly buckets = new Map<number, number[]>();

  /** `cellSize` should be at least the largest query radius (queries look at 3×3 cells). */
  constructor(private readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    // Space spans about ±12,000 units, far inside ±2^15 cells.
    return (cx + 0x8000) * 0x10000 + (cy + 0x8000);
  }

  insert(item: number, x: number, y: number): void {
    const key = this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    const bucket = this.buckets.get(key);
    if (bucket) bucket.push(item);
    else this.buckets.set(key, [item]);
  }

  /**
   * Writes the items in the 3×3 cells around (x, y) into `out` (cleared
   * first), in a fixed order: cells row by row, items in insertion order.
   * Callers check the exact distance themselves.
   */
  near(x: number, y: number, out: number[]): number[] {
    out.length = 0;
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = this.buckets.get(this.key(cx + dx, cy + dy));
        if (bucket) for (const item of bucket) out.push(item);
      }
    }
    return out;
  }
}
