import { describe, expect, it } from "vitest";
import { BALANCE } from "../../data/balance";
import { drainDelta, FACTION_STATS_STRIDE, trackChanges } from "../delta/delta";
import { attack, faction, G0, grid0, runWith, spawn, testWorld } from "../testUtils";
import { runTicks } from "../tick";
import { setOwner } from "../world/territory";
import { addFaction, createWorld } from "../world/world";

describe("spawn phase", () => {
  it("blocks attacks and growth until it ends", () => {
    const world = createWorld({
      seed: 1,
      difficulty: "normal",
      bodies: [{ radius: 20 }],
      spawnPhaseTicks: 30,
    });
    addFaction(world, "A", "player");
    runWith(world, spawn(world, 1, 20, 20));
    const f = faction(world, 1);
    const pop = f.troops + f.workers;
    const ctx = runWith(world, attack(world, 1, 30, 20));
    expect(ctx.rejected.map((r) => r.reason)).toEqual(["spawn phase"]);
    runTicks(world, 20);
    expect(f.troops + f.workers).toBe(pop);

    runTicks(world, 10); // phase over
    const tiles = f.tileCount;
    expect(runWith(world, attack(world, 1, 30, 20)).rejected).toEqual([]);
    runTicks(world, 5);
    expect(f.tileCount).toBeGreaterThan(tiles);
  });
});

describe("victory", () => {
  it("goes to the first faction owning the win share of the land", () => {
    const world = testWorld(10, 2);
    runWith(world, spawn(world, 1, 6, 10), spawn(world, 2, 14, 10));
    runTicks(world, 1);
    expect(world.winner).toBeNull();
    const grid = grid0(world);
    const needed = Math.ceil((world.ownableTiles * BALANCE.match.winLandPct) / 100);
    for (let t = 0; t < grid.size && faction(world, 1).tileCount < needed; t++) {
      if (grid.isUsable(t) && grid.owner[t] === 0) setOwner(world, grid, t, faction(world, 1).id);
    }
    runTicks(world, 1);
    expect(world.winner).toBe(1);
  });

  it("goes to the last faction standing", () => {
    const world = testWorld(10, 2);
    runWith(world, spawn(world, 1, 6, 10), spawn(world, 2, 14, 10));
    const grid = grid0(world);
    for (let t = 0; t < grid.size; t++) {
      if (grid.owner[t] === 2) setOwner(world, grid, t, faction(world, 1).id);
    }
    expect(faction(world, 2).alive).toBe(false);
    runTicks(world, 1);
    expect(world.winner).toBe(1);
  });
});

describe("deltas", () => {
  it("record nothing until tracking starts", () => {
    const world = testWorld(10, 1);
    runWith(world, spawn(world, 1, 10, 10));
    expect(world.changes).toBeNull();
    expect(drainDelta(world).tiles.length).toBe(0);
  });

  it("report each owner change with the current owner, then clear", () => {
    const world = testWorld(10, 2);
    trackChanges(world);
    runWith(world, spawn(world, 1, 10, 10));
    const delta = drainDelta(world);
    expect(delta.tick).toBe(1);
    expect(delta.tiles.length).toBe(faction(world, 1).tileCount * 3);
    for (let i = 0; i < delta.tiles.length; i += 3) {
      expect(delta.tiles[i]).toBe(G0);
      expect(delta.tiles[i + 2]).toBe(1);
      expect(grid0(world).owner[delta.tiles[i + 1]!]).toBe(1);
    }
    expect(drainDelta(world).tiles.length).toBe(0);
  });

  it("carry every faction's stats and the winner (none while others haven't spawned)", () => {
    const world = testWorld(10, 2);
    trackChanges(world);
    runWith(world, spawn(world, 2, 10, 10));
    const { stats, winner } = drainDelta(world);
    expect(stats.length).toBe(2 * FACTION_STATS_STRIDE);
    const f2 = faction(world, 2);
    expect([...stats.subarray(FACTION_STATS_STRIDE)]).toEqual([
      2,
      1,
      f2.troops,
      f2.workers,
      f2.tileCount,
    ]);
    expect(winner).toBe(-1);
  });
});
