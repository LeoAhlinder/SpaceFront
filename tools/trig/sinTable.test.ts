import { describe, expect, it } from "vitest";
import { SIN_QUARTER_TABLE } from "../../src/core/math/trigTable";
import { computeSinTable } from "./sinTable";

describe("committed sine table", () => {
  it("matches a fresh computation (±1 for engine rounding)", () => {
    const fresh = computeSinTable();
    expect(SIN_QUARTER_TABLE.length).toBe(fresh.length);
    for (let i = 0; i < fresh.length; i++) {
      expect(Math.abs(SIN_QUARTER_TABLE[i]! - fresh[i]!)).toBeLessThanOrEqual(1);
    }
  });
});
