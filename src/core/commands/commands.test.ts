import { describe, expect, it } from "vitest";
import { Terrain } from "../grid/terrain";
import type { FactionId } from "../ids";
import { attack, G0, grid0, runWith, spawn, testWorld } from "../testUtils";
import { runTick } from "../tick";
import { queueCommand } from "./applyCommands";
import { CommandQueue } from "./commandQueue";
import type { Command } from "./commands";
import { validateCommand } from "./validate";

const F1 = 1 as FactionId;

describe("CommandQueue", () => {
  it("returns commands per tick in insertion order, once", () => {
    const q = new CommandQueue();
    const a: Command = { type: "setRatio", faction: F1, troopRatioPct: 10 };
    const b: Command = { type: "setRatio", faction: F1, troopRatioPct: 20 };
    q.push(3, a);
    q.push(3, b);
    q.push(4, a);
    expect(q.size).toBe(3);
    expect(q.take(3)).toEqual([a, b]);
    expect(q.take(3)).toEqual([]);
    expect(q.size).toBe(1);
  });
});

describe("queueCommand", () => {
  it("applies on the next tick by default and refuses past ticks", () => {
    const world = testWorld();
    queueCommand(world, { type: "setRatio", faction: F1, troopRatioPct: 33 });
    runTick(world);
    expect(world.factions[1]!.troopRatioPct).toBe(33);
    expect(() =>
      queueCommand(world, { type: "setRatio", faction: F1, troopRatioPct: 1 }, 0),
    ).toThrow(RangeError);
  });
});

describe("validateCommand", () => {
  it("accepts a valid spawn and rejects bad ones", () => {
    const world = testWorld(10);
    const grid = grid0(world);
    expect(validateCommand(world, spawn(world, 1, 10, 10))).toBeNull();
    expect(validateCommand(world, spawn(world, 9, 10, 10))).toBe("unknown faction");
    expect(validateCommand(world, spawn(world, 0, 10, 10))).toBe("unknown faction");
    expect(validateCommand(world, spawn(world, 1, 0, 0))).toBe("tile is not on the body");
    expect(validateCommand(world, { ...spawn(world, 1, 10, 10), grid: 5 } as Command)).toBe(
      "unknown grid",
    );
    expect(validateCommand(world, { ...spawn(world, 1, 10, 10), tile: 1.5 } as Command)).toBe(
      "tile is not on the body",
    );
    grid.terrain[grid.index(10, 10)] = Terrain.Ocean;
    expect(validateCommand(world, spawn(world, 1, 10, 10))).toBe("terrain can't be owned");
  });

  it("rejects spawning twice or on owned land", () => {
    const world = testWorld(10);
    runWith(world, spawn(world, 1, 10, 10));
    expect(validateCommand(world, spawn(world, 1, 5, 10))).toBe("already spawned");
    expect(validateCommand(world, spawn(world, 2, 10, 10))).toBe("tile is already owned");
  });

  it("checks attack preconditions", () => {
    const world = testWorld(10);
    expect(validateCommand(world, attack(world, 1, 12, 10))).toBe("not spawned yet");
    runWith(world, spawn(world, 1, 10, 10));
    expect(validateCommand(world, attack(world, 1, 15, 10))).toBeNull();
    expect(validateCommand(world, attack(world, 1, 10, 10))).toBe("can't attack yourself");
    expect(validateCommand(world, attack(world, 1, 15, 10, 0))).toBe(
      "ratio must be an integer 1–100",
    );
    expect(validateCommand(world, attack(world, 1, 15, 10, 101))).toBe(
      "ratio must be an integer 1–100",
    );
  });

  it("checks setRatio and unknown command types", () => {
    const world = testWorld();
    expect(validateCommand(world, { type: "setRatio", faction: F1, troopRatioPct: 50 })).toBeNull();
    expect(validateCommand(world, { type: "setRatio", faction: F1, troopRatioPct: 0 })).not.toBe(
      null,
    );
    expect(validateCommand(world, { type: "nuke", faction: F1 } as unknown as Command)).toBe(
      "unknown command type",
    );
  });

  it("reports rejected commands in the tick context", () => {
    const world = testWorld();
    const ctx = runWith(world, attack(world, 1, 12, 10));
    expect(ctx.rejected).toEqual([
      { command: attack(world, 1, 12, 10), reason: "not spawned yet" },
    ]);
    expect(G0).toBe(0);
  });
});
