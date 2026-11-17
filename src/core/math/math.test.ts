import { describe, expect, it } from "vitest";
import { FX_ONE, fx, fxDiv, fxFloor, fxMul, fxRatio, fxRound, fxSqrt } from "./fixed";
import { Rng } from "./rng";
import { ANGLE_FULL, ANGLE_QUARTER, fxCos, fxSin } from "./trig";

describe("Rng", () => {
  it("gives the same sequence for the same seed and stream", () => {
    const a = Rng.fromSeed(1234);
    const b = Rng.fromSeed(1234);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it("gives different sequences for different seeds and streams", () => {
    const first = (rng: Rng) => [rng.nextU32(), rng.nextU32(), rng.nextU32()];
    expect(first(Rng.fromSeed(1))).not.toEqual(first(Rng.fromSeed(2)));
    expect(first(Rng.fromSeed(1, 0))).not.toEqual(first(Rng.fromSeed(1, 1)));
  });

  it("matches a pinned sequence (catches accidental algorithm changes)", () => {
    const rng = Rng.fromSeed(42);
    const values = [rng.nextU32(), rng.nextU32(), rng.nextU32(), rng.nextU32()];
    expect(values).toMatchInlineSnapshot(`
      [
        3308293827,
        1579791675,
        2929259487,
        2559673145,
      ]
    `);
  });

  it("restores exactly from saved state", () => {
    const rng = Rng.fromSeed(7);
    rng.nextU32();
    const copy = Rng.fromState(rng.state);
    for (let i = 0; i < 100; i++) expect(copy.nextU32()).toBe(rng.nextU32());
  });

  it("nextInt stays in range and covers it roughly evenly", () => {
    const rng = Rng.fromSeed(99);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) counts[rng.nextInt(6)]!++;
    for (const c of counts) expect(c).toBeGreaterThan(9_000);
    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(1.5)).toThrow(RangeError);
  });

  it("nextRange is inclusive on both ends", () => {
    const rng = Rng.fromSeed(5);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.nextRange(-2, 2));
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
  });
});

describe("fixed-point", () => {
  it("converts to and from integers", () => {
    expect(fx(3)).toBe(3 * FX_ONE);
    expect(fxFloor(fx(3) + 1)).toBe(3);
    expect(fxFloor(-1)).toBe(-1);
    expect(fxRound(fxRatio(5, 2))).toBe(3);
    expect(fxRound(fxRatio(-5, 2))).toBe(-2);
  });

  it("multiplies and divides exactly, matching a BigInt reference", () => {
    const rng = Rng.fromSeed(3);
    const range = 2 ** 37;
    for (let i = 0; i < 2_000; i++) {
      const a = rng.nextInt(2 ** 31) * (rng.chance(1, 2) ? 1 : -1) * 8;
      const b = (rng.nextInt(2 ** 31) + 1) * (rng.chance(1, 2) ? 1 : -1);
      expect(Math.abs(a)).toBeLessThan(range);
      expect(fxMul(a, b)).toBe(bigFloorDiv(BigInt(a) * BigInt(b), 65536n));
      expect(fxDiv(a, b)).toBe(bigFloorDiv(BigInt(a) * 65536n, BigInt(b)));
    }
    expect(fxMul(fx(3), fxRatio(1, 2))).toBe(fxRatio(3, 2));
    expect(() => fxDiv(1, 0)).toThrow(RangeError);
  });

  it("takes exact square roots", () => {
    expect(fxSqrt(fx(16))).toBe(fx(4));
    expect(fxSqrt(fx(2))).toBe(92681); // floor(√2 × 65536)
    const rng = Rng.fromSeed(11);
    for (let i = 0; i < 2_000; i++) {
      const a = rng.nextInt(2 ** 32) * 16;
      const r = BigInt(fxSqrt(a));
      const n = BigInt(a) * 65536n;
      expect(r * r <= n && (r + 1n) * (r + 1n) > n).toBe(true);
    }
  });
});

describe("trig", () => {
  it("hits exact values at the quarter turns", () => {
    expect(fxSin(0)).toBe(0);
    expect(fxSin(ANGLE_QUARTER)).toBe(FX_ONE);
    expect(fxSin(2 * ANGLE_QUARTER)).toBe(0);
    expect(fxSin(3 * ANGLE_QUARTER)).toBe(-FX_ONE);
    expect(fxCos(0)).toBe(FX_ONE);
  });

  it("is within 2/65536 of Math.sin/cos everywhere, including wrapped angles", () => {
    for (let a = -ANGLE_FULL; a < 2 * ANGLE_FULL; a++) {
      const rad = (a / ANGLE_FULL) * 2 * Math.PI;
      expect(Math.abs(fxSin(a) - Math.sin(rad) * FX_ONE)).toBeLessThanOrEqual(2);
      expect(Math.abs(fxCos(a) - Math.cos(rad) * FX_ONE)).toBeLessThanOrEqual(2);
    }
  });
});

function bigFloorDiv(n: bigint, d: bigint): number {
  let q = n / d;
  if (n % d !== 0n && n < 0n !== d < 0n) q -= 1n;
  return Number(q);
}
