import { describe, expect, it } from "vitest";
import type { System } from "./tick";
import { runTick, runTicks } from "./tick";
import { createWorld } from "./world/world";

const config = { seed: 1, difficulty: "normal", bodies: [{ radius: 4 }] } as const;

describe("runTick", () => {
  it("runs systems in order with the current tick, then advances", () => {
    const world = createWorld(config);
    const calls: string[] = [];
    const a: System = (_w, ctx) => calls.push(`a${ctx.tick}`);
    const b: System = (w, ctx) => calls.push(`b${ctx.tick}/${w.tick}`);
    runTick(world, [a, b]);
    runTick(world, [a, b]);
    expect(calls).toEqual(["a0", "b0/0", "a1", "b1/1"]);
    expect(world.tick).toBe(2);
  });

  it("runTicks runs the requested number of ticks", () => {
    const world = createWorld(config);
    runTicks(world, 25, []);
    expect(world.tick).toBe(25);
  });
});
