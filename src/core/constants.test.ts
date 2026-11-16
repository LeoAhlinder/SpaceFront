import { describe, expect, it } from "vitest";
import { TICK_MS } from "./constants";

describe("TICK_MS", () => {
  it("is 100 ms at 10 ticks per second", () => {
    expect(TICK_MS).toBe(100);
  });
});
