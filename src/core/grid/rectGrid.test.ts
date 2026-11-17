import { describe, expect, it } from "vitest";
import { gridId } from "../ids";
import { RectGrid } from "./rectGrid";
import { Terrain } from "./terrain";

describe("RectGrid", () => {
  it("has width × height tiles, all usable plains by default", () => {
    const grid = new RectGrid(gridId(0), 30, 20);
    expect(grid.size).toBe(600);
    expect(grid.terrain.every((t) => t === Terrain.Plains)).toBe(true);
    expect(grid.isUsable(0)).toBe(true);
    expect(grid.isUsable(599)).toBe(true);
    expect(grid.isUsable(-1)).toBe(false);
    expect(grid.isUsable(600)).toBe(false);
  });

  it("converts between index and coordinates", () => {
    const grid = new RectGrid(gridId(0), 30, 20);
    const tile = grid.index(7, 5);
    expect(tile).toBe(5 * 30 + 7);
    expect(grid.x(tile)).toBe(7);
    expect(grid.y(tile)).toBe(5);
    expect(grid.index(-1, 0)).toBe(-1);
    expect(grid.index(30, 0)).toBe(-1);
    expect(grid.index(0, 20)).toBe(-1);
    expect(grid.distance(grid.index(1, 1), grid.index(4, 5))).toBe(7);
  });

  it("returns the 4 edge neighbors in fixed order, fewer at edges and corners", () => {
    const grid = new RectGrid(gridId(0), 10, 8);
    const out = new Int32Array(grid.maxNeighbors);
    expect(grid.neighbors(grid.index(4, 4), out)).toBe(4);
    expect([...out]).toEqual([
      grid.index(4, 3),
      grid.index(3, 4),
      grid.index(5, 4),
      grid.index(4, 5),
    ]);
    expect(grid.neighbors(grid.index(0, 0), out)).toBe(2);
    expect(grid.neighbors(grid.index(9, 4), out)).toBe(3);
  });

  it("does not wrap around the left/right edges", () => {
    const grid = new RectGrid(gridId(0), 10, 8);
    const out = new Int32Array(grid.maxNeighbors);
    const n = grid.neighbors(grid.index(9, 3), out);
    expect([...out.subarray(0, n)]).not.toContain(grid.index(0, 4));
    expect([...out.subarray(0, n)]).not.toContain(grid.index(0, 3));
  });

  it("neighbors are mutual", () => {
    const grid = new RectGrid(gridId(0), 12, 9);
    const out = new Int32Array(4);
    const back = new Int32Array(4);
    for (let tile = 0; tile < grid.size; tile++) {
      const n = grid.neighbors(tile, out);
      for (let i = 0; i < n; i++) {
        const m = grid.neighbors(out[i]!, back);
        expect([...back.subarray(0, m)]).toContain(tile);
      }
    }
  });

  it("applies map terrain of the right size only", () => {
    const grid = new RectGrid(gridId(0), 4, 3);
    const terrain = new Uint8Array(12).fill(Terrain.Ocean);
    grid.applyTerrain(terrain);
    expect(grid.terrain).toEqual(terrain);
    expect(() => grid.applyTerrain(new Uint8Array(11))).toThrow(RangeError);
  });

  it("rejects invalid sizes", () => {
    expect(() => new RectGrid(gridId(0), 0, 5)).toThrow(RangeError);
    expect(() => new RectGrid(gridId(0), 5, 2.5)).toThrow(RangeError);
  });
});
