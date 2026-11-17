import { describe, expect, it } from "vitest";
import { BALANCE } from "../../data/balance";
import { Terrain } from "../grid/terrain";
import type { FactionId } from "../ids";
import { NEUTRAL } from "../ids";
import { attack, countOwned, faction, grid0, runWith, spawn, testWorld } from "../testUtils";
import { runTick, runTicks } from "../tick";
import { FrontierHeap } from "../world/frontierHeap";
import { attackSystem } from "./attack";
import { populationCap } from "./population";

describe("FrontierHeap", () => {
  it("pops lowest priority first, ties by tile index", () => {
    const heap = new FrontierHeap();
    const entries = [
      [5, 10],
      [1, 7],
      [5, 3],
      [-2, 99],
      [1, 2],
      [8, 0],
    ] as const;
    for (const [p, t] of entries) heap.push(p, t);
    const order: number[] = [];
    while (heap.size > 0) order.push(heap.pop());
    expect(order).toEqual([99, 2, 7, 3, 10, 0]);
    expect(heap.pop()).toBe(-1);
  });
});

describe("spawn", () => {
  it("claims a diamond of radius 4 around the tile and gives starting population", () => {
    const world = testWorld(20);
    runWith(world, spawn(world, 1, 20, 20));
    const f = faction(world, 1);
    // A diamond of radius r has 2r² + 2r + 1 tiles.
    const r = BALANCE.spawn.radius;
    expect(f.tileCount).toBe(2 * r * r + 2 * r + 1);
    expect(countOwned(world, 1)).toBe(f.tileCount);
    expect(f.hasSpawned).toBe(true);
    expect(f.troops).toBeGreaterThan(0);
  });

  it("skips ocean and other factions' land", () => {
    const world = testWorld(20);
    const grid = grid0(world);
    for (let y = 0; y < grid.side; y++) grid.terrain[grid.index(21, y)] = Terrain.Ocean;
    runWith(world, spawn(world, 2, 20, 17));
    runWith(world, spawn(world, 1, 20, 20));
    for (let y = 0; y < grid.side; y++) expect(grid.owner[grid.index(21, y)]).toBe(NEUTRAL);
    expect(grid.owner[grid.index(20, 17)]).toBe(2);
    expect(countOwned(world, 1) + countOwned(world, 2)).toBe(
      faction(world, 1).tileCount + faction(world, 2).tileCount,
    );
  });
});

describe("population", () => {
  it("grows toward the cap and never passes it", () => {
    const world = testWorld(20);
    runWith(world, spawn(world, 1, 20, 20));
    const f = faction(world, 1);
    const start = f.troops + f.workers;
    runTicks(world, 3_000);
    const pop = f.troops + f.workers;
    expect(pop).toBeGreaterThan(start);
    expect(pop).toBeLessThanOrEqual(populationCap(f.tileCount));
    expect(pop).toBeGreaterThan(populationCap(f.tileCount) * 0.95);
  });

  it("moves the troop share toward the chosen ratio", () => {
    const world = testWorld(20);
    runWith(world, spawn(world, 1, 20, 20), {
      type: "setRatio",
      faction: 1 as FactionId,
      troopRatioPct: 20,
    });
    runTicks(world, 500);
    const f = faction(world, 1);
    const share = f.troops / (f.troops + f.workers);
    expect(share).toBeGreaterThan(0.18);
    expect(share).toBeLessThan(0.22);
  });

  it("shrinks when above the cap", () => {
    const world = testWorld(20);
    runWith(world, spawn(world, 1, 20, 20));
    const f = faction(world, 1);
    f.workers = populationCap(f.tileCount) * 3;
    const before = f.troops + f.workers;
    runTick(world);
    const after = f.troops + f.workers;
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(before * 0.97); // gentle, not a sudden collapse
  });
});

describe("attack", () => {
  it("expands into neutral land and returns unused troops when the land runs out", () => {
    const world = testWorld(12);
    runWith(world, spawn(world, 1, 12, 12));
    const f = faction(world, 1);
    f.troops = 1_000_000;
    runWith(world, attack(world, 1, 2, 12, 50));
    expect(world.attacks).toHaveLength(1);
    // Attack only: population would shrink the (far above cap) troop count.
    runTicks(world, 200, [attackSystem]);
    expect(world.attacks).toHaveLength(0);
    expect(f.tileCount).toBe(grid0(world).usableCount);
    expect(f.troops).toBeGreaterThan(980_000); // the unused troops came back
  });

  it("stops when troops run out and costs more on mountains", () => {
    const plains = testWorld(20);
    const mountains = testWorld(20);
    const g = grid0(mountains);
    for (let i = 0; i < g.size; i++) if (g.isUsable(i)) g.terrain[i] = Terrain.Mountains;
    const gained = [plains, mountains].map((world) => {
      runWith(world, spawn(world, 1, 20, 20));
      const before = faction(world, 1).tileCount;
      faction(world, 1).troops = 400;
      runWith(world, attack(world, 1, 30, 20));
      runTicks(world, 100);
      expect(world.attacks).toHaveLength(0);
      return faction(world, 1).tileCount - before;
    });
    // Mountains cost 250% of plains, so 400 troops buy ~2.5× fewer tiles.
    const [plainsGain, mountainGain] = gained as [number, number];
    expect(plainsGain).toBe(400 / BALANCE.attack.neutralCost);
    expect(plainsGain).toBeGreaterThan(mountainGain * 2);
  });

  it("never takes ocean", () => {
    const world = testWorld(12);
    const grid = grid0(world);
    for (let y = 0; y < grid.side; y++) grid.terrain[grid.index(16, y)] = Terrain.Ocean;
    runWith(world, spawn(world, 1, 10, 12));
    faction(world, 1).troops = 1_000_000;
    runWith(world, attack(world, 1, 14, 12));
    runTicks(world, 200);
    for (let y = 0; y < grid.side; y++) expect(grid.owner[grid.index(16, y)]).toBe(NEUTRAL);
    // Land beyond the ocean line is unreachable.
    expect(grid.owner[grid.index(18, 12)]).toBe(NEUTRAL);
  });

  it("conquers a weak enemy and eliminates it", () => {
    const world = testWorld(20);
    runWith(world, spawn(world, 1, 14, 20), spawn(world, 2, 24, 20));
    // Grow both until their land touches.
    faction(world, 1).troops = 50_000;
    faction(world, 2).troops = 50_000;
    runWith(world, attack(world, 1, 19, 20, 10), attack(world, 2, 19, 20, 10));
    runTicks(world, 50);
    faction(world, 1).troops = 1_000_000;
    faction(world, 2).troops = 10;
    const ctx = runWith(world, attack(world, 1, 24, 20));
    expect(ctx.rejected).toEqual([]);
    runTicks(world, 300);
    expect(faction(world, 2).alive).toBe(false);
    expect(faction(world, 2).tileCount).toBe(0);
    expect(countOwned(world, 2)).toBe(0);
  });

  it("rejects an attack with no shared border", () => {
    const world = testWorld(20);
    runWith(world, spawn(world, 1, 8, 20), spawn(world, 2, 32, 20));
    const ctx = runWith(world, attack(world, 1, 32, 20));
    expect(ctx.rejected.map((r) => r.reason)).toEqual(["no shared border"]);
    expect(faction(world, 1).troops).toBeGreaterThan(0); // nothing was spent
  });

  it("merges a second attack on the same target into the first", () => {
    const world = testWorld(20);
    runWith(world, spawn(world, 1, 20, 20));
    faction(world, 1).troops = 1_000;
    runWith(world, attack(world, 1, 30, 20, 50), attack(world, 1, 10, 20, 50));
    expect(world.attacks).toHaveLength(1);
    expect(faction(world, 1).troops).toBeLessThan(400);
  });

  it("keeps tile counts equal to the owner map", () => {
    const world = testWorld(25, 3);
    runWith(world, spawn(world, 1, 15, 25), spawn(world, 2, 35, 25), spawn(world, 3, 25, 12));
    for (let t = 0; t < 40; t++) {
      if (t % 10 === 0) {
        runWith(world, attack(world, 1, 25, 25, 40), attack(world, 2, 25, 25, 40));
        runWith(world, attack(world, 3, 25, 25, 40));
      }
      runTicks(world, 5);
    }
    for (const f of world.factions.slice(1)) expect(countOwned(world, f.id)).toBe(f.tileCount);
  });
});
