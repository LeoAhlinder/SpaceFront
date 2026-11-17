import { describe, expect, it } from "vitest";
import { BALANCE } from "../../data/balance";
import { queueCommand } from "../commands/applyCommands";
import type { Command } from "../commands/commands";
import type { FactionId, GridId } from "../ids";
import { runTick, runTicks } from "../tick";
import { setOwner } from "../world/territory";
import type { Ship, World } from "../world/world";
import { addFaction, createWorld } from "../world/world";
import { populationCap } from "./population";
import { buildCost } from "./structures";
import { tradePayout } from "./trade";

/** One 40×40 map per body id; one faction spawned in the middle of each map. */
function worlds(...bodies: string[]): World {
  const world = createWorld({
    seed: 3,
    difficulty: "normal",
    bodies: bodies.map((bodyId) => ({ width: 40, height: 40, bodyId })),
  });
  bodies.forEach((_, i) => {
    const f = addFaction(world, `F${i + 1}`, "bot").id;
    queueCommand(world, { type: "spawn", faction: f, grid: i as GridId, tile: 20 * 40 + 20 });
  });
  runTick(world);
  return world;
}

const F = (n: number) => n as FactionId;
const G = (n: number) => n as GridId;
const build = (
  f: number,
  grid: number,
  x: number,
  y: number,
  kind: "spaceport" | "habitat",
): Command => ({
  type: "build",
  faction: F(f),
  kind,
  grid: G(grid),
  tile: y * 40 + x,
});

function run(world: World, ...commands: Command[]): string[] {
  for (const c of commands) queueCommand(world, c);
  return runTick(world).rejected.map((r) => r.reason);
}

describe("income", () => {
  it("pays Solars from workers every tick, nothing lost to rounding", () => {
    const world = worlds("mars");
    const f = world.factions[1]!;
    f.solars = 0;
    f.solarsMilli = 0;
    const workersBefore = f.workers;
    runTick(world);
    // One tick at ~workersBefore workers (growth changes them slightly).
    const expected = (workersBefore * BALANCE.economy.workerIncomePermille) / 1000;
    expect(f.solars + f.solarsMilli / 1000).toBeGreaterThan(expected * 0.9);
    expect(f.solars + f.solarsMilli / 1000).toBeLessThan(expected * 1.2);
  });

  it("follows the world's income modifier (Io pays 150%)", () => {
    const world = worlds("mars", "io");
    const [mars, io] = [world.factions[1]!, world.factions[2]!];
    for (const f of [mars, io]) {
      f.solars = 0;
      f.workers = 10_000;
      f.troops = 0;
    }
    runTick(world);
    expect(io.solars / mars.solars).toBeGreaterThan(1.4);
    expect(io.solars / mars.solars).toBeLessThan(1.6);
  });
});

describe("building with Solars", () => {
  it("costs Solars, rejects what you can't afford, and gets dearer per one owned", () => {
    const world = worlds("mars");
    const f = world.factions[1]!;
    f.solars = 900;
    expect(run(world, build(1, 0, 20, 20, "spaceport"))).toEqual(["not enough Solars"]);
    const first = buildCost(world, F(1), "habitat", G(0));
    expect(first).toBe(BALANCE.structures.habitat.cost);
    f.solars = 10_000;
    expect(run(world, build(1, 0, 20, 20, "habitat"))).toEqual([]);
    expect(f.solars).toBeLessThan(10_000 - first + 50); // paid (plus a tick of income)
    expect(buildCost(world, F(1), "habitat", G(0))).toBe(
      (first * (100 + BALANCE.structures.costStepPct)) / 100,
    );
  });

  it("is cheaper on the Moon", () => {
    const world = worlds("moon", "mars");
    expect(buildCost(world, F(1), "spaceport", G(0))).toBe(
      Math.floor((BALANCE.structures.spaceport.cost * 70) / 100),
    );
    expect(buildCost(world, F(2), "spaceport", G(1))).toBe(BALANCE.structures.spaceport.cost);
  });

  it("Habitats raise the population cap and pay a flat income", () => {
    const world = worlds("mars");
    const f = world.factions[1]!;
    f.solars = 10_000;
    run(world, build(1, 0, 20, 20, "habitat"));
    runTicks(world, BALANCE.structures.habitat.buildTicks);
    f.workers = 0;
    f.troops = 0;
    f.solars = 0;
    f.solarsMilli = 0;
    runTick(world); // population regrows a little, so check the flat part as a minimum
    expect(f.solars).toBeGreaterThanOrEqual(BALANCE.structures.habitat.income);
    expect(populationCap(f.tileCount, 1) - populationCap(f.tileCount)).toBe(
      BALANCE.structures.habitat.popCap,
    );
  });
});

describe("trade", () => {
  /** Two factions with finished Spaceports, on Earth and Mars. */
  function traders(): World {
    const world = worlds("earth", "mars");
    for (const f of world.factions) f.solars = 100_000;
    run(world, build(1, 0, 20, 20, "spaceport"), build(2, 1, 20, 20, "spaceport"));
    runTicks(world, BALANCE.structures.spaceport.buildTicks);
    return world;
  }

  it("sends Freighters between factions' Spaceports, paying both sides", () => {
    const world = traders();
    const before = world.factions.map((f) => f.solars);
    let delivered = 0;
    let payout = 0;
    for (let t = 0; t < 2_000; t++) {
      const arriving = world.ships.filter(
        (s) => s.kind === "freighter" && s.arriveTick === world.tick,
      );
      for (const s of arriving) payout += tradePayout(world, s);
      delivered += arriving.length;
      runTick(world);
    }
    expect(delivered).toBeGreaterThan(5);
    // Both sides earned at least half the trade (each side gets every payout).
    for (const id of [1, 2]) {
      expect(world.factions[id]!.solars - before[id]!).toBeGreaterThan(payout);
    }
  });

  it("pays more for longer routes", () => {
    const world = traders();
    const ship = (waypoints: Ship["waypoints"], toTile: number): Ship => ({
      id: 99,
      kind: "freighter",
      owner: F(1),
      troops: 0,
      hp: 1,
      fromGrid: G(0),
      fromTile: 0,
      toGrid: G(0),
      toTile,
      toStructure: 0,
      launchTick: 0,
      arriveTick: 1,
      waypoints,
    });
    const nearHop = tradePayout(world, ship([], 5));
    const farHop = tradePayout(world, ship([], 39));
    const space = tradePayout(
      world,
      ship(
        [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
        ],
        0,
      ),
    );
    expect(nearHop).toBeLessThan(farHop);
    expect(farHop).toBeLessThan(space);
    expect(space).toBe(BALANCE.trade.base + (4000 * BALANCE.trade.perUnitPermille) / 1000);
  });

  it("pays nothing if the destination was captured by the sender", () => {
    const world = traders();
    // Wait for the first Freighter, then hand its destination to the sender.
    while (world.ships.length === 0) runTick(world);
    const ship = world.ships[0]!;
    const dest = world.structures[ship.toStructure]!;
    setOwner(world, world.grids[dest.grid]!, dest.tile, ship.owner);
    const sender = world.factions[ship.owner]!;
    sender.workers = 0;
    while (world.ships.includes(ship)) {
      const solars = sender.solars;
      runTick(world);
      if (!world.ships.includes(ship)) {
        expect(sender.solars - solars).toBeLessThan(BALANCE.trade.base);
      }
    }
  });
});

describe("world modifiers", () => {
  it("Venus land is harder to take", () => {
    const cost = (body: string) => {
      const world = worlds(body);
      const defender = world.factions[1]!;
      const attacker = addFaction(world, "A", "bot");
      // Give the attacker the tile next to the defender's land.
      setOwner(world, world.grids[0]!, 20 * 40 + 25, attacker.id);
      attacker.hasSpawned = true;
      attacker.troops = 100_000;
      defender.troops = 5_000;
      run(world, {
        type: "attack",
        faction: attacker.id,
        grid: G(0),
        tile: 20 * 40 + 24,
        ratioPct: 1,
      });
      runTicks(world, 20);
      return attacker.tileCount;
    };
    // The same troops take fewer tiles on Venus.
    expect(cost("venus")).toBeLessThan(cost("mars"));
  });
});

describe("M2 goal", () => {
  it("a faction that builds and trades clearly beats one that doesn't", () => {
    // Builder and idler on identical Mars maps; a trade partner on Earth.
    const world = worlds("mars", "mars", "earth");
    const [builder, idler, partner] = [1, 2, 3].map((i) => world.factions[i]!);
    partner!.solars = 10_000;
    run(world, build(3, 2, 20, 20, "spaceport"));

    let spent = 0;
    // Inside the starting land (radius 4 around 20,20), at least 6 steps apart.
    const spots = [
      [16, 20],
      [24, 20],
      [20, 16],
      [20, 24],
    ] as const;
    let next = 0;
    for (let t = 0; t < 6_000; t++) {
      // The builder buys a Spaceport first, then Habitats, whenever it can afford one.
      if (next < spots.length) {
        const kind = next === 0 ? "spaceport" : "habitat";
        const cost = buildCost(world, builder!.id, kind, G(0));
        if (builder!.solars >= cost) {
          const [x, y] = spots[next]!;
          if (run(world, build(1, 0, x, y, kind)).length === 0) {
            spent += cost;
            next++;
          }
          continue;
        }
      }
      runTick(world);
    }
    const worth = (f: typeof builder) => f!.solars + f!.troops + f!.workers;
    console.log(
      `M2 goal: builder ${builder!.solars}☉ (+${spent} spent), pop ${builder!.troops + builder!.workers}; ` +
        `idler ${idler!.solars}☉, pop ${idler!.troops + idler!.workers}`,
    );
    expect(next).toBe(spots.length); // built everything
    expect(builder!.solars + spent).toBeGreaterThan(idler!.solars * 1.3);
    expect(worth(builder)).toBeGreaterThan(worth(idler) * 1.3);
  });
});
