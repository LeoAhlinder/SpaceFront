import { describe, expect, it } from "vitest";
import { BALANCE } from "../../data/balance";
import { queueCommand } from "../commands/applyCommands";
import type { BuildCommand, Command, LaunchCommand } from "../commands/commands";
import { Band } from "../grid/polarGrid";
import type { PolarGrid } from "../grid/polarGrid";
import type { FactionId, GridId } from "../ids";
import { NEUTRAL } from "../ids";
import { hashWorld } from "../serialize/hash";
import { coronaTilePoint, distance } from "../space/space";
import { runTick, runTicks } from "../tick";
import { setOwner } from "../world/territory";
import type { Faction, World } from "../world/world";
import { addFaction, coronaTiles, createWorld, landTiles } from "../world/world";
import { siphonIncomeMilli } from "./corona";
import { populationCap } from "./population";
import { buildCost } from "./structures";
import { victorySystem } from "./victory";

const F = (n: number) => n as FactionId;
const G = (n: number) => n as GridId;
const MID = 20 * 40 + 20;

/**
 * `n` factions, each spawned in the middle of its own 40×40 Mercury map,
 * with a finished Spaceport there. The Corona is grid n.
 */
function system(n = 2, solars = 50_000): { world: World; corona: PolarGrid; ports: number[] } {
  const world = createWorld({
    seed: 11,
    difficulty: "normal",
    bodies: Array.from({ length: n }, () => ({ width: 40, height: 40, bodyId: "mercury" })),
    corona: true,
  });
  for (let i = 0; i < n; i++) {
    const f = addFaction(world, `F${i + 1}`, "bot").id;
    queueCommand(world, { type: "spawn", faction: f, grid: G(i), tile: MID });
  }
  runTick(world);
  for (let i = 1; i <= n; i++) world.factions[i]!.solars = solars;
  for (let i = 0; i < n; i++) {
    queueCommand(world, {
      type: "build",
      faction: F(i + 1),
      kind: "spaceport",
      grid: G(i),
      tile: MID,
    });
  }
  runTicks(world, BALANCE.structures.spaceport.buildTicks + 1);
  const ports = world.structures.filter((s) => s.kind === "spaceport").map((s) => s.id);
  expect(ports).toHaveLength(n);
  return { world, corona: world.corona!, ports };
}

function run(world: World, ...commands: Command[]): string[] {
  for (const c of commands) queueCommand(world, c);
  return runTick(world).rejected.map((r) => r.reason);
}

/** Runs until no ships of `kind` are in flight. */
function untilLanded(world: World, kind = "sunBaseShip"): void {
  for (let i = 0; i < 5_000 && world.ships.some((s) => s.kind === kind); i++) runTick(world);
}

const sendBase = (f: number, from: number, tile: number, ratioPct = 50): LaunchCommand => ({
  type: "launch",
  faction: F(f),
  kind: "sunBaseShip",
  from,
  toGrid: G(-1), // replaced below
  toTile: tile,
  ratioPct,
});

function launchBase(world: World, f: number, from: number, tile: number, ratioPct = 50): string[] {
  return run(world, { ...sendBase(f, from, tile, ratioPct), toGrid: world.corona!.id });
}

describe("the Corona grid", () => {
  it("is added after the bodies and excluded from the win goal", () => {
    const { world, corona } = system(2);
    expect(corona.id).toBe(2);
    expect(corona.size).toBe(BALANCE.corona.rings * BALANCE.corona.sectors);
    expect(world.ownableTiles).toBe(2 * 40 * 40);
    expect(world.structureAt).toHaveLength(3);
    expect(world.factions[1]!.gridTiles).toHaveLength(3);
  });

  it("places tiles between the heat zone and Mercury's orbit", () => {
    const { corona } = system(1);
    const sun = { x: 0, y: 0 };
    for (const tile of [0, corona.size - 1, corona.index(10, 77)]) {
      const r = distance(sun, coronaTilePoint(corona, tile));
      expect(r).toBeGreaterThan(650);
      expect(r).toBeLessThan(1150);
    }
    // Sector 0 points along +x, a quarter turn later along +y.
    const quarter = coronaTilePoint(corona, corona.index(0, corona.sectors / 4));
    expect(Math.abs(quarter.x)).toBeLessThan(20);
    expect(quarter.y).toBeGreaterThan(650);
  });

  it("can't be spawned on", () => {
    const world = createWorld({
      seed: 1,
      difficulty: "normal",
      bodies: [{ width: 10, height: 10 }],
      corona: true,
    });
    const f = addFaction(world, "F", "bot");
    expect(run(world, { type: "spawn", faction: f.id, grid: world.corona!.id, tile: 0 })).toEqual([
      "unknown grid",
    ]);
  });
});

describe("Sun Base", () => {
  it("flies to an empty Corona tile, becomes a base and claims the area around it", () => {
    const { world, corona, ports } = system(1);
    const f = world.factions[1]!;
    const tile = corona.index(4, 0);
    const cost = buildCost(world, F(1), "sunBase", corona.id);
    const troops = f.troops;
    f.workers = 0; // no income this tick, so the price shows exactly
    const solars = f.solars;
    expect(launchBase(world, 1, ports[0]!, tile)).toEqual([]);
    expect(f.solars).toBe(solars - cost);
    const carried = troops - f.troops;
    expect(carried).toBeGreaterThan(0);
    // A second one costs more, even while the first is still flying.
    expect(buildCost(world, F(1), "sunBase", corona.id)).toBeGreaterThan(cost);

    untilLanded(world);
    const base = world.structures.find((s) => s.kind === "sunBase")!;
    expect(base).toMatchObject({ owner: 1, grid: corona.id, tile, buildTicksLeft: 0 });
    expect(world.structureAt[corona.id]![tile]).toBe(base.id);
    // Radius 3 diamond: 1 + 4 + 8 + 12 tiles.
    expect(coronaTiles(world, f)).toBe(25);
    expect(corona.owner[corona.index(4, 3)]).toBe(1);
    expect(corona.owner[corona.index(4, 4)]).toBe(NEUTRAL);
    expect(corona.owner[corona.index(1, 0)]).toBe(1);
    expect(f.coronaTroops).toBeGreaterThan(carried * 0.9); // minus a little heat since landing
  });

  it("only goes to empty Corona tiles", () => {
    const { world, corona, ports } = system(2);
    setOwner(world, corona, corona.index(4, 50), F(2));
    expect(launchBase(world, 1, ports[0]!, corona.index(4, 50))).toEqual(["tile is not empty"]);
    expect(run(world, { ...sendBase(1, ports[0]!, MID), toGrid: G(1) })).toEqual([
      "Sun Bases go in the Corona",
    ]);
    world.factions[1]!.solars = 0;
    expect(launchBase(world, 1, ports[0]!, corona.index(4, 0))).toEqual(["not enough Solars"]);
  });

  it("is lost if its tile was taken while it flew", () => {
    const { world, corona, ports } = system(2);
    const tile = corona.index(4, 0);
    launchBase(world, 1, ports[0]!, tile);
    // Keep it taken (a lone tile would decay back to neutral).
    while (world.ships.some((s) => s.kind === "sunBaseShip")) {
      setOwner(world, corona, tile, F(2));
      runTick(world);
    }
    expect(world.structures.some((s) => s.kind === "sunBase")).toBe(false);
    expect(coronaTiles(world, world.factions[1]!)).toBe(0);
  });

  it("works as a Spaceport: launches landers with Corona troops and trades", () => {
    const { world, corona, ports } = system(2);
    launchBase(world, 1, ports[0]!, corona.index(20, 0));
    untilLanded(world);
    const base = world.structures.find((s) => s.kind === "sunBase")!;
    const f = world.factions[1]!;
    f.coronaTroops = 1_000;
    const mainTroops = f.troops;
    const reasons = run(world, {
      type: "launch",
      faction: F(1),
      kind: "troopLander",
      from: base.id,
      toGrid: G(1),
      toTile: 5,
      ratioPct: 50,
    });
    expect(reasons).toEqual([]);
    expect(f.coronaTroops).toBeLessThan(1_000);
    expect(f.troops).toBeGreaterThanOrEqual(mainTroops); // the main pool wasn't touched
    untilLanded(world, "troopLander");
    expect(world.grids[1]!.owner[5]).toBe(1);
    // Trade: the base sends Freighters to the other faction's Spaceport.
    let traded = false;
    for (let i = 0; i < 600 && !traded; i++) {
      runTick(world);
      traded = world.ships.some((s) => s.kind === "freighter" && s.fromGrid === corona.id);
    }
    expect(traded).toBe(true);
  });
});

describe("Corona territory", () => {
  it("spreads with attacks paid from Corona troops; nobody lives there", () => {
    const { world, corona, ports } = system(1);
    launchBase(world, 1, ports[0]!, corona.index(20, 0));
    untilLanded(world);
    const f = world.factions[1]!;
    f.coronaTroops = 500;
    const mainTroops = f.troops;
    const before = coronaTiles(world, f);
    expect(
      run(world, {
        type: "attack",
        faction: F(1),
        grid: corona.id,
        tile: corona.index(20, 10),
        ratioPct: 100,
      }),
    ).toEqual([]);
    runTicks(world, 30);
    expect(coronaTiles(world, f)).toBeGreaterThan(before + 20);
    expect(f.troops).toBeGreaterThanOrEqual(mainTroops); // main troops not spent
    // Population counts only land: the cap ignores the Corona.
    expect(landTiles(world, f)).toBe(f.tileCount - coronaTiles(world, f));
    expect(populationCap(landTiles(world, f))).toBeLessThan(populationCap(f.tileCount));
  });

  it("rejects Corona attacks without Corona troops", () => {
    const { world, corona, ports } = system(1);
    launchBase(world, 1, ports[0]!, corona.index(20, 0), 1);
    untilLanded(world);
    world.factions[1]!.coronaTroops = 0;
    expect(
      run(world, {
        type: "attack",
        faction: F(1),
        grid: corona.id,
        tile: corona.index(20, 10),
        ratioPct: 100,
      }),
    ).toEqual(["no troops"]);
  });

  it("landers from a planet reinforce your own Corona tiles", () => {
    const { world, corona, ports } = system(1);
    const tile = corona.index(20, 0);
    launchBase(world, 1, ports[0]!, tile, 1);
    untilLanded(world);
    const f = world.factions[1]!;
    const before = f.coronaTroops;
    run(world, {
      type: "launch",
      faction: F(1),
      kind: "troopLander",
      from: ports[0]!,
      toGrid: corona.id,
      toTile: tile,
      ratioPct: 50,
    });
    const sent = world.ships[0]!.troops;
    untilLanded(world, "troopLander");
    expect(f.coronaTroops).toBeGreaterThanOrEqual(before + sent - 100); // minus a little heat
  });

  it("Sun Bases train troops up to a cap", () => {
    const { world, corona, ports } = system(1);
    launchBase(world, 1, ports[0]!, corona.index(23, 0), 1); // outer band: no heat
    untilLanded(world);
    const f = world.factions[1]!;
    f.coronaTroops = 0;
    runTicks(world, BALANCE.corona.intervalTicks * 5);
    expect(f.coronaTroops).toBe(5 * BALANCE.sunBase.trainTroops);
    runTicks(world, BALANCE.corona.intervalTicks * 200);
    expect(f.coronaTroops).toBe(BALANCE.sunBase.troopCapPerBase);
  });

  it("heat drains troops in the inner band most, the outer band not at all", () => {
    const { world, corona, ports } = system(3);
    launchBase(world, 1, ports[0]!, corona.index(3, 0));
    launchBase(world, 2, ports[1]!, corona.index(11, 80));
    launchBase(world, 3, ports[2]!, corona.index(20, 160));
    untilLanded(world);
    expect([0, 80, 160].map((s, i) => corona.band(corona.index([3, 11, 20][i]!, s)))).toEqual([
      Band.Inner,
      Band.Middle,
      Band.Outer,
    ]);
    runTicks(world, 3_000);
    const [inner, middle, outer] = [1, 2, 3].map((i) => world.factions[i]!.coronaTroops);
    expect(inner).toBeLessThan(middle!);
    expect(middle).toBeLessThan(outer!);
    expect(outer).toBe(BALANCE.sunBase.troopCapPerBase);
  });

  it("territory cut off from every Sun Base decays to neutral; connected land stays", () => {
    const { world, corona, ports } = system(1);
    launchBase(world, 1, ports[0]!, corona.index(20, 0), 1);
    untilLanded(world);
    const f = world.factions[1]!;
    const connected = coronaTiles(world, f);
    // An island of 10 tiles far from the base.
    for (let s = 100; s < 110; s++) setOwner(world, corona, corona.index(20, s), F(1));
    expect(coronaTiles(world, f)).toBe(connected + 10);
    runTicks(world, BALANCE.corona.intervalTicks);
    expect(coronaTiles(world, f)).toBe(connected + 10 - BALANCE.corona.decayTilesPerInterval);
    runTicks(world, BALANCE.corona.intervalTicks * 10);
    expect(coronaTiles(world, f)).toBe(connected);
    expect(corona.owner[corona.index(20, 0)]).toBe(1);
  });

  it("all Corona land decays once the Sun Base is captured", () => {
    const { world, corona, ports } = system(2);
    const tile = corona.index(20, 0);
    launchBase(world, 1, ports[0]!, tile, 1);
    untilLanded(world);
    const base = world.structures.find((s) => s.kind === "sunBase")!;
    setOwner(world, corona, tile, F(2));
    expect(base.owner).toBe(2);
    runTicks(world, BALANCE.corona.intervalTicks * 20);
    expect(coronaTiles(world, world.factions[1]!)).toBe(0);
    expect(world.factions[1]!.coronaTroops).toBe(0);
  });
});

describe("Solar Siphon", () => {
  /** Faction 1 with a Sun Base at ring `ring`, sector 0, and Corona land 10 sectors either way. */
  function holding(ring: number, n = 1) {
    const ctx = system(n);
    const { world, corona, ports } = ctx;
    launchBase(world, 1, ports[0]!, corona.index(ring, 0), 1);
    untilLanded(world);
    for (let s = -10; s <= 10; s++) setOwner(world, corona, corona.index(ring, s), F(1));
    return ctx;
  }
  const siphon = (f: number, grid: number, tile: number): BuildCommand => ({
    type: "build",
    faction: F(f),
    kind: "solarSiphon",
    grid: G(grid),
    tile,
  });

  it("is built only on your own Corona tiles", () => {
    const { world, corona } = holding(4, 2);
    expect(run(world, siphon(1, 0, MID + 7))).toEqual(["siphons go in the Corona"]);
    expect(run(world, siphon(1, corona.id, corona.index(4, 100)))).toEqual(["not your land"]);
    expect(run(world, siphon(1, corona.id, corona.index(4, 2)))).toEqual([
      "too close to another structure",
    ]);
    expect(run(world, { ...siphon(1, corona.id, corona.index(4, 8)), kind: "habitat" })).toEqual([
      "can't build that in the Corona",
    ]);
    expect(run(world, siphon(1, corona.id, corona.index(4, 8)))).toEqual([]);
    expect(world.structures.at(-1)).toMatchObject({ kind: "solarSiphon", owner: 1 });
  });

  it("pays by band: ×3 inner, ×2 middle, ×1 outer", () => {
    const S = BALANCE.solarSiphon;
    const one = (band: number) => siphonIncomeMilli([0, 1, 2].map((b) => (b === band ? 1 : 0)));
    expect(one(Band.Outer)).toBe(S.baseIncome * 1000);
    expect(one(Band.Middle)).toBe(2 * one(Band.Outer));
    expect(one(Band.Inner)).toBe(3 * one(Band.Outer));
  });

  it("has diminishing returns per siphon owned", () => {
    const pay = (n: number) => siphonIncomeMilli([n, 0, 0]);
    const extra = [1, 2, 3, 4, 5, 10, 11].map((n) => pay(n) - pay(n - 1));
    for (let i = 1; i < 5; i++) expect(extra[i]).toBeLessThan(extra[i - 1]!);
    // Never below the floor.
    expect(extra[6]).toBe(Math.floor((pay(1) * BALANCE.solarSiphon.diminishMinPct) / 100));
    // The best band is counted first: an inner siphon added to an outer one pays full rate.
    expect(siphonIncomeMilli([1, 0, 1])).toBeGreaterThan(siphonIncomeMilli([0, 0, 1]) + pay(1) / 2);
  });

  it("earns Solars once finished, and is captured with its tile", () => {
    const { world, corona } = holding(4, 2);
    const tile = corona.index(4, 8);
    run(world, siphon(1, corona.id, tile));
    runTicks(world, BALANCE.structures.solarSiphon.buildTicks + 1);
    const f1 = world.factions[1]!;
    const f2 = world.factions[2]!;
    const gain = (f: Faction) => {
      const before = f.solars;
      runTick(world);
      return f.solars - before;
    };
    expect(gain(f1)).toBeGreaterThanOrEqual(3 * BALANCE.solarSiphon.baseIncome);
    setOwner(world, corona, tile, F(2));
    expect(world.structures.at(-1)!.owner).toBe(2);
    expect(gain(f2)).toBeGreaterThanOrEqual(3 * BALANCE.solarSiphon.baseIncome);
    expect(gain(f1)).toBeLessThan(BALANCE.solarSiphon.baseIncome);
  });
});

describe("win condition", () => {
  it("doesn't count Corona tiles", () => {
    const { world, corona } = system(2);
    const f = world.factions[1]!;
    // All of the Corona is not enough...
    for (let t = 0; t < corona.size; t++) setOwner(world, corona, t, F(1));
    victorySystem(world, { tick: world.tick, rejected: [] });
    expect(world.winner).toBeNull();
    // ...but 80% of the land is.
    const land = world.grids[1]!;
    for (let t = 0; t < land.size && landTiles(world, f) * 100 < world.ownableTiles * 80; t++) {
      setOwner(world, land, t, F(1));
    }
    victorySystem(world, { tick: world.tick, rejected: [] });
    expect(world.winner).toBe(1);
  });
});

describe("M2.5 goal", () => {
  it("holding the inner Corona gives a clear economic lead, and it can be taken away", () => {
    // Three equal factions on identical Mercury maps, each with a Spaceport and
    // the same Solars. F1 goes for the inner Corona, F3 for the outer band,
    // F2 stays home (Spaceport trade only).
    const { world, corona, ports } = system(3, 60_000);
    const [f1, f2, f3] = [1, 2, 3].map((i) => world.factions[i]!) as [Faction, Faction, Faction];
    const spent = [0, 0, 0, 0];
    const homes = [
      { f: 1, ring: 4, sector: 0 },
      { f: 3, ring: 20, sector: 128 },
    ];
    for (const { f, ring, sector } of homes) {
      spent[f]! += buildCost(world, F(f), "sunBase", corona.id);
      expect(launchBase(world, f, ports[f - 1]!, corona.index(ring, sector), 60)).toEqual([]);
    }
    untilLanded(world);
    // Spread out along the ring both ways, then build siphons 6+ steps apart.
    for (const ds of [14, -14]) {
      for (const { f, ring, sector } of homes) {
        const tile = corona.index(ring, sector + ds);
        run(world, { type: "attack", faction: F(f), grid: corona.id, tile, ratioPct: 50 });
      }
      runTicks(world, 150);
    }
    for (const { f, ring, sector } of homes) {
      for (const ds of [6, -6]) {
        const cost = buildCost(world, F(f), "solarSiphon", corona.id);
        const reasons = run(world, {
          type: "build",
          faction: F(f),
          kind: "solarSiphon",
          grid: corona.id,
          tile: corona.index(ring, sector + ds),
        });
        expect(reasons).toEqual([]);
        spent[f]! += cost;
      }
    }

    runTicks(world, 6_000); // 10 minutes
    const worth = (f: Faction) => f.solars + spent[f.id]!;
    console.log(
      `M2.5 goal: inner ${worth(f1)}☉, outer ${worth(f3)}☉, home only ${worth(f2)}☉ ` +
        `(inner Corona troops ${f1.coronaTroops}, outer ${f3.coronaTroops})`,
    );
    expect(worth(f1)).toBeGreaterThan(worth(f2) * 3);
    expect(worth(f1)).toBeGreaterThan(worth(f3) * 1.5);
    const siphons1 = world.structures.filter((s) => s.kind === "solarSiphon" && s.owner === 1);
    expect(siphons1).toHaveLength(2);

    // F2 strikes: a lander full of troops onto F1's Sun Base, then the attack
    // rolls over F1's Corona land and its siphons.
    const base = world.structures.find((s) => s.kind === "sunBase" && s.owner === 1)!;
    expect(
      run(world, {
        type: "launch",
        faction: F(2),
        kind: "troopLander",
        from: ports[1]!,
        toGrid: corona.id,
        toTile: base.tile,
        ratioPct: 100,
      }),
    ).toEqual([]);
    untilLanded(world, "troopLander");
    expect(base.owner).toBe(2);
    runTicks(world, 600);
    expect(siphons1.every((s) => s.owner === 2)).toBe(true);
    expect(coronaTiles(world, f1)).toBe(0);

    // Now F2 earns the siphon income and F1 is back to its planet.
    const rate = (f: Faction) => {
      const before = f.solars;
      runTicks(world, 100);
      return f.solars - before;
    };
    const [r1, r2] = [rate(f1), rate(f2)];
    console.log(`after the takeover: F1 ${r1}☉ / 10 s, F2 ${r2}☉ / 10 s`);
    expect(r2).toBeGreaterThan(r1 * 3);
    expect(hashWorld(world)).toBeGreaterThanOrEqual(0); // state stays hashable
  });
});
