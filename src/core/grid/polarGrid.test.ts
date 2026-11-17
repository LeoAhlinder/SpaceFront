import { describe, expect, it } from "vitest";
import { gridId } from "../ids";
import { Band, PolarGrid } from "./polarGrid";
import { Terrain } from "./terrain";

const grid = () => new PolarGrid(gridId(3), 6, 16, 2, 2);

describe("PolarGrid", () => {
  it("has rings × sectors tiles, all usable and uniform", () => {
    const g = grid();
    expect(g.size).toBe(96);
    expect(g.terrain.every((t) => t === Terrain.Plains)).toBe(true);
    expect(g.isUsable(0)).toBe(true);
    expect(g.isUsable(95)).toBe(true);
    expect(g.isUsable(-1)).toBe(false);
    expect(g.isUsable(96)).toBe(false);
  });

  it("converts between index and (ring, sector), wrapping sectors", () => {
    const g = grid();
    const tile = g.index(2, 5);
    expect(tile).toBe(2 * 16 + 5);
    expect(g.ring(tile)).toBe(2);
    expect(g.sector(tile)).toBe(5);
    expect(g.index(1, 16)).toBe(g.index(1, 0));
    expect(g.index(1, -1)).toBe(g.index(1, 15));
    expect(g.index(-1, 0)).toBe(-1);
    expect(g.index(6, 0)).toBe(-1);
  });

  it("puts rings into three bands from the inside out", () => {
    const g = grid();
    expect([0, 1, 2, 3, 4, 5].map((r) => g.band(g.index(r, 7)))).toEqual([
      Band.Inner,
      Band.Inner,
      Band.Middle,
      Band.Middle,
      Band.Outer,
      Band.Outer,
    ]);
  });

  it("returns 4 neighbors in fixed order: inward, ccw, cw, outward", () => {
    const g = grid();
    const out = new Int32Array(g.maxNeighbors);
    expect(g.neighbors(g.index(3, 7), out)).toBe(4);
    expect([...out]).toEqual([g.index(2, 7), g.index(3, 6), g.index(3, 8), g.index(4, 7)]);
  });

  it("wraps sectors around: the last sector borders the first", () => {
    const g = grid();
    const out = new Int32Array(g.maxNeighbors);
    expect(g.neighbors(g.index(3, 0), out)).toBe(4);
    expect([...out]).toEqual([g.index(2, 0), g.index(3, 15), g.index(3, 1), g.index(4, 0)]);
    expect(g.neighbors(g.index(3, 15), out)).toBe(4);
    expect([...out]).toEqual([g.index(2, 15), g.index(3, 14), g.index(3, 0), g.index(4, 15)]);
  });

  it("has no neighbors beyond the innermost and outermost rings", () => {
    const g = grid();
    const out = new Int32Array(g.maxNeighbors);
    expect(g.neighbors(g.index(0, 0), out)).toBe(3);
    expect([...out.subarray(0, 3)]).toEqual([g.index(0, 15), g.index(0, 1), g.index(1, 0)]);
    expect(g.neighbors(g.index(5, 15), out)).toBe(3);
    expect([...out.subarray(0, 3)]).toEqual([g.index(4, 15), g.index(5, 14), g.index(5, 0)]);
  });

  it("neighbors are symmetric everywhere", () => {
    const g = grid();
    const out = new Int32Array(4);
    const back = new Int32Array(4);
    for (let t = 0; t < g.size; t++) {
      const n = g.neighbors(t, out);
      for (let i = 0; i < n; i++) {
        const m = g.neighbors(out[i]!, back);
        expect([...back.subarray(0, m)]).toContain(t);
        expect(g.distance(t, out[i]!)).toBe(1);
      }
    }
  });

  it("measures distance the short way around", () => {
    const g = grid();
    expect(g.distance(g.index(0, 1), g.index(0, 15))).toBe(2);
    expect(g.distance(g.index(0, 0), g.index(5, 8))).toBe(13);
    expect(g.distance(g.index(2, 3), g.index(2, 3))).toBe(0);
  });

  it("rejects bands that don't fit", () => {
    expect(() => new PolarGrid(gridId(0), 4, 16, 3, 2)).toThrow(RangeError);
    expect(() => new PolarGrid(gridId(0), 4, 2, 1, 1)).toThrow(RangeError);
  });
});
