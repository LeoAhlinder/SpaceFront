import { describe, expect, it } from "vitest";
import { AssertionError } from "../debug";
import { addFaction, createWorld } from "../world/world";
import { hashWorld } from "./hash";

const config = { seed: 9, difficulty: "normal", bodies: [{ radius: 6 }] } as const;

describe("hashWorld", () => {
  it("is equal for two identically built worlds", () => {
    expect(hashWorld(createWorld(config))).toBe(hashWorld(createWorld(config)));
  });

  it("changes when any part of the state changes", () => {
    const base = hashWorld(createWorld(config));
    const changes: ((w: ReturnType<typeof createWorld>) => void)[] = [
      (w) => (w.tick = 1),
      (w) => w.rng.nextU32(),
      (w) => (w.grids[0]!.owner[40] = 1),
      (w) => (w.grids[0]!.terrain[40] = 3),
      (w) => addFaction(w, "A", "bot"),
      (w) => (w.factions[0]!.troops = 1),
      (w) => (w.factions[0]!.solars = 2 ** 40), // above 32 bits
    ];
    for (const change of changes) {
      const world = createWorld(config);
      change(world);
      expect(hashWorld(world)).not.toBe(base);
    }
  });

  it("rejects non-integer state (a float leaking into the simulation)", () => {
    const world = createWorld(config);
    world.factions[0]!.troops = 0.5;
    expect(() => hashWorld(world)).toThrow(AssertionError);
  });
});
