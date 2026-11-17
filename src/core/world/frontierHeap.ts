/**
 * Min-heap of (priority, tile) pairs used as an attack's frontier.
 * Ties are broken by tile index, so pop order is fully deterministic.
 * Entries may go stale (the tile changed hands); the attack system re-checks
 * each tile when it is popped.
 */
export class FrontierHeap {
  readonly priorities: number[] = [];
  readonly tiles: number[] = [];

  get size(): number {
    return this.tiles.length;
  }

  push(priority: number, tile: number): void {
    const p = this.priorities;
    const t = this.tiles;
    let i = t.length;
    p.push(priority);
    t.push(tile);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!less(priority, tile, p[parent]!, t[parent]!)) break;
      p[i] = p[parent]!;
      t[i] = t[parent]!;
      i = parent;
    }
    p[i] = priority;
    t[i] = tile;
  }

  /** Removes and returns the tile with the lowest priority, or -1 if empty. */
  pop(): number {
    const p = this.priorities;
    const t = this.tiles;
    if (t.length === 0) return -1;
    const top = t[0]!;
    const lastP = p.pop()!;
    const lastT = t.pop()!;
    const n = t.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && less(p[r]!, t[r]!, p[l]!, t[l]!) ? r : l;
        if (!less(p[c]!, t[c]!, lastP, lastT)) break;
        p[i] = p[c]!;
        t[i] = t[c]!;
        i = c;
      }
      p[i] = lastP;
      t[i] = lastT;
    }
    return top;
  }
}

function less(pa: number, ta: number, pb: number, tb: number): boolean {
  return pa < pb || (pa === pb && ta < tb);
}
