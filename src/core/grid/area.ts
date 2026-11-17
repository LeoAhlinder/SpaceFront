import { PolarGrid } from "./polarGrid";
import { RectGrid } from "./rectGrid";
import type { TileGrid } from "./tileGrid";

/**
 * Writes every usable tile within `radius` steps of `center` (the grid's own
 * distance: Manhattan on maps, rings + sectors in the Corona) into `out` and
 * returns how many. A fixed order (row by row, or ring by ring), so callers
 * stay deterministic. `out` is cleared first; reuse it to avoid allocation.
 */
export function tilesWithin(grid: TileGrid, center: number, radius: number, out: number[]): number {
  out.length = 0;
  if (grid instanceof RectGrid) {
    const cx = grid.x(center);
    const cy = grid.y(center);
    for (let dy = -radius; dy <= radius; dy++) {
      const reach = radius - Math.abs(dy);
      for (let dx = -reach; dx <= reach; dx++) {
        const tile = grid.index(cx + dx, cy + dy);
        if (tile >= 0 && grid.isUsable(tile)) out.push(tile);
      }
    }
  } else if (grid instanceof PolarGrid) {
    const ring = grid.ring(center);
    const sector = grid.sector(center);
    // Never wrap past half the ring, so no tile is listed twice.
    const maxReach = Math.floor((grid.sectors - 1) / 2);
    for (let dr = -radius; dr <= radius; dr++) {
      const reach = Math.min(maxReach, radius - Math.abs(dr));
      for (let ds = -reach; ds <= reach; ds++) {
        const tile = grid.index(ring + dr, sector + ds);
        if (tile >= 0) out.push(tile);
      }
    }
  }
  return out.length;
}
