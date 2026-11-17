import { describe, expect, it } from "vitest";
import { NEUTRAL } from "../ids";
import { addFaction, createWorld } from "./world";

describe("createWorld", () => {
  const config = {
    seed: 1,
    difficulty: "normal",
    bodies: [{ radius: 10 }, { radius: 4 }],
  } as const;

  it("starts at tick 0 with one grid per body and the neutral faction", () => {
    const world = createWorld(config);
    expect(world.tick).toBe(0);
    expect(world.grids.map((g) => g.radius)).toEqual([10, 4]);
    expect(world.grids.map((g) => g.id)).toEqual([0, 1]);
    expect(world.factions).toHaveLength(1);
    expect(world.factions[0]).toMatchObject({ id: NEUTRAL, kind: "neutral", alive: false });
  });

  it("gives factions sequential ids", () => {
    const world = createWorld(config);
    expect(addFaction(world, "A", "player").id).toBe(1);
    expect(addFaction(world, "B", "bot").id).toBe(2);
    expect(world.factions[2]).toMatchObject({ name: "B", alive: true, troops: 0 });
  });

  it("refuses a second neutral faction", () => {
    const world = createWorld(config);
    expect(() => addFaction(world, "X", "neutral")).toThrow();
  });
});
