import { describe, expect, it } from "vitest";
import {
  addNation,
  findLeader,
  isAllied,
  NEUTRAL,
  refGrid,
  refTile,
  runTicks,
  setOwner,
} from "../../src/core";
import { BALANCE } from "../../src/data/balance";
import type { GridId } from "../../src/core";
import { DIFFICULTIES } from "../../src/data/difficulty";
import { COLONY_LABELS, nationById, NATIONS } from "../../src/data/nations";
import { populate, SOLAR_MAPS, solarWorld } from "../support/solarMatch";

const regions = new Map(SOLAR_MAPS.get("earth")!.regions.map((r) => [r.code, r]));

describe("data/nations", () => {
  it("every nation spawns in a real Earth region and colonizes real worlds", () => {
    const ids = new Set<string>();
    for (const n of NATIONS) {
      expect(regions.has(n.region), `${n.name} region ${n.region}`).toBe(true);
      expect(ids.has(n.id)).toBe(false);
      ids.add(n.id);
      for (const body of n.colonies) expect(COLONY_LABELS[body], body).toBeDefined();
    }
    expect(NATIONS.filter((n) => n.tier === 1).map((n) => n.short)).toEqual([
      "USA",
      "China",
      "Russia",
      "ESA",
      "India",
    ]);
    // Impossible needs enough countries of each tier.
    for (const tier of [1, 2, 3] as const) {
      expect(NATIONS.filter((n) => n.tier === tier).length).toBeGreaterThanOrEqual(
        DIFFICULTIES.impossible.nations[tier],
      );
    }
  });
});

describe("addNations", () => {
  const world = solarWorld(3, "hard");
  populate(world, 20);
  const earth = world.gridBodies.indexOf("earth");

  it("brings every space superpower on Hard, with colonies allied to them", () => {
    const tier1 = world.nations.filter((n) => n.tier === 1 && n.home === NEUTRAL);
    expect(tier1.map((n) => n.nationId).sort()).toEqual(["china", "esa", "india", "russia", "usa"]);
    const colonies = world.nations.filter((n) => n.home !== NEUTRAL);
    expect(colonies).toHaveLength(DIFFICULTIES.hard.colonies);
    for (const c of colonies) {
      const name = world.factions[c.faction]!.name;
      const body = world.gridBodies[c.homeGrid]!;
      expect(name).toBe(`${nationById(c.nationId).short} ${COLONY_LABELS[body]}`);
      expect(isAllied(world, c.faction, c.home)).toBe(true);
    }
  });

  it("is the same for the same seed", () => {
    const again = solarWorld(3, "hard");
    populate(again, 20);
    expect(again.factions.map((f) => f.name)).toEqual(world.factions.map((f) => f.name));
  });

  it("nations spawn in their own country, with a head start by tier", () => {
    runTicks(world, 40);
    for (const n of world.nations) {
      const f = world.factions[n.faction]!;
      expect(f.hasSpawned, f.name).toBe(true);
      if (n.home !== NEUTRAL) continue; // colonies spawn anywhere on their world
      const spawn = regions.get(nationById(n.nationId).region)!.spawnTile;
      // It owns land on (or close to, if a bot got there first) its spawn tile.
      const grid = world.grids[earth]!;
      let nearest = Infinity;
      for (const ref of f.tiles) {
        if (refGrid(ref) === earth) nearest = Math.min(nearest, grid.distance(spawn, refTile(ref)));
      }
      expect(nearest, f.name).toBeLessThanOrEqual(2 * BALANCE.nation.spawnSearchRadius);
    }
    const usa = world.factions[world.nations.find((n) => n.nationId === "usa")!.faction]!;
    const bot = world.factions.find((f) => f.kind === "bot" && f.hasSpawned)!;
    expect(usa.tileCount).toBeGreaterThan(bot.tileCount);
  });
});

describe("nation AI", () => {
  it("builds Solar Siphons on its Corona land when it can afford them", () => {
    const world = solarWorld(5, "impossible");
    const earth = world.gridBodies.indexOf("earth") as GridId;
    const nation = addNation(world, "India", {
      nationId: "india",
      tier: 1,
      profile: DIFFICULTIES.impossible.profiles[1],
      homeGrid: earth,
      spawnTile: regions.get("356")!.spawnTile,
    });
    runTicks(world, 20);
    expect(nation.hasSpawned).toBe(true);
    const corona = world.corona!;
    // Hand it a wide strip of the inner Corona and plenty of Solars.
    for (let ring = 0; ring < 4; ring++) {
      for (let sector = 0; sector < 120; sector++) {
        setOwner(world, corona, corona.index(ring, sector), nation.id);
      }
    }
    nation.coronaTroops = 5_000;
    nation.solars = 1_000_000;
    runTicks(world, 600);
    const siphons = world.structures.filter(
      (s) => s.kind === "solarSiphon" && s.owner === nation.id,
    );
    expect(siphons.length).toBeGreaterThan(0);
  });

  it("names a leader only once someone clearly leads", () => {
    const world = solarWorld(5, "normal");
    populate(world, 0);
    expect(findLeader(world)).toBe(NEUTRAL);
  });
});
