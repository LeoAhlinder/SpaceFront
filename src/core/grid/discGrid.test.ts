import { describe, expect, it } from "vitest";
import { gridId } from "../ids";
import { DiscGrid } from "./discGrid";
import { Terrain } from "./terrain";

describe("DiscGrid", () => {
  it("has a square of side 2r with a round usable area close to πr²", () => {
    const grid = new DiscGrid(gridId(0), 50);
    expect(grid.side).toBe(100);
    expect(grid.size).toBe(10_000);
    const ideal = Math.PI * 50 * 50;
    expect(Math.abs(grid.usableCount - ideal) / ideal).toBeLessThan(0.01);
  });

  it("marks corners as space and the center as usable", () => {
    const grid = new DiscGrid(gridId(0), 10);
    expect(grid.isUsable(grid.index(0, 0))).toBe(false);
    expect(grid.terrain[grid.index(19, 19)]).toBe(Terrain.Space);
    expect(grid.isUsable(grid.index(10, 10))).toBe(true);
    expect(grid.isUsable(-1)).toBe(false);
    expect(grid.isUsable(grid.size)).toBe(false);
  });

  it("is symmetric left/right and top/bottom", () => {
    const grid = new DiscGrid(gridId(0), 13);
    for (let y = 0; y < grid.side; y++) {
      for (let x = 0; x < grid.side; x++) {
        const usable = grid.isUsable(grid.index(x, y));
        expect(grid.isUsable(grid.index(grid.side - 1 - x, y))).toBe(usable);
        expect(grid.isUsable(grid.index(x, grid.side - 1 - y))).toBe(usable);
      }
    }
  });

  it("converts between index and coordinates", () => {
    const grid = new DiscGrid(gridId(0), 8);
    const tile = grid.index(3, 5);
    expect(grid.x(tile)).toBe(3);
    expect(grid.y(tile)).toBe(5);
    expect(grid.index(-1, 0)).toBe(-1);
    expect(grid.index(0, 16)).toBe(-1);
  });

  it("returns the 4 edge neighbors in fixed order for an interior tile", () => {
    const grid = new DiscGrid(gridId(0), 8);
    const out = new Int32Array(grid.maxNeighbors);
    const tile = grid.index(8, 8);
    expect(grid.neighbors(tile, out)).toBe(4);
    expect([...out]).toEqual([
      grid.index(8, 7),
      grid.index(7, 8),
      grid.index(9, 8),
      grid.index(8, 9),
    ]);
  });

  it("never returns space or out-of-bounds neighbors, and neighbors are mutual", () => {
    const grid = new DiscGrid(gridId(0), 12);
    const out = new Int32Array(grid.maxNeighbors);
    const back = new Int32Array(grid.maxNeighbors);
    for (let tile = 0; tile < grid.size; tile++) {
      if (!grid.isUsable(tile)) continue;
      const n = grid.neighbors(tile, out);
      for (let i = 0; i < n; i++) {
        const other = out[i]!;
        expect(grid.isUsable(other)).toBe(true);
        const m = grid.neighbors(other, back);
        expect([...back.subarray(0, m)]).toContain(tile);
      }
    }
  });

  it("does not wrap neighbors across the left/right edges", () => {
    // Radius 1 → a 2×2 grid where every tile is usable.
    const grid = new DiscGrid(gridId(0), 1);
    expect(grid.usableCount).toBe(4);
    const out = new Int32Array(grid.maxNeighbors);
    const n = grid.neighbors(grid.index(1, 0), out);
    expect([...out.subarray(0, n)].sort()).toEqual([grid.index(0, 0), grid.index(1, 1)].sort());
  });

  it("rejects invalid radii", () => {
    expect(() => new DiscGrid(gridId(0), 0)).toThrow(RangeError);
    expect(() => new DiscGrid(gridId(0), 2.5)).toThrow(RangeError);
  });
});
