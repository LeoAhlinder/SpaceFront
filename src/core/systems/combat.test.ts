import { describe, expect, it } from "vitest";
import { BALANCE } from "../../data/balance";
import { queueCommand } from "../commands/applyCommands";
import type { Command } from "../commands/commands";
import type { FactionId, GridId } from "../ids";
import { NEUTRAL } from "../ids";
import { hashWorld } from "../serialize/hash";
import { coronaTilePoint, pointAlong } from "../space/space";
import { SpatialHash } from "../space/spatialHash";
import { runTick, runTicks } from "../tick";
import { makeAlliance } from "../world/diplomacy";
import { KIND_CODE } from "../world/structureIndex";
import { setOwner } from "../world/territory";
import type { Ship, StructureKind, World } from "../world/world";
import { addFaction, createWorld } from "../world/world";
import { trackChanges } from "../delta/delta";
import { foundSunBase } from "./corona";
import { tooCloseToStructure } from "./structures";

const EARTH = 0 as GridId;
const MARS = 1 as GridId;
const P1 = 1 as FactionId;
const P2 = 2 as FactionId;
const SIZE = 40;

/** Earth and Mars as 40×40 maps (and the Corona); P1 spawned on Earth, P2 on Mars, both rich. */
function twoPlanets(seed = 1): World {
  const world = createWorld({
    seed,
    difficulty: "normal",
    bodies: [
      { width: SIZE, height: SIZE, bodyId: "earth" },
      { width: SIZE, height: SIZE, bodyId: "mars" },
    ],
    corona: true,
  });
  addFaction(world, "P1", "player");
  addFaction(world, "P2", "bot");
  run(world, spawnAt(P1, EARTH, 20, 20), spawnAt(P2, MARS, 20, 20));
  for (const f of world.factions) f.solars = 10_000_000;
  // Take whole maps, so every test has room to build.
  for (let t = 0; t < SIZE * SIZE; t++) {
    setOwner(world, world.grids[EARTH]!, t, P1);
    setOwner(world, world.grids[MARS]!, t, P2);
  }
  return world;
}

const at = (x: number, y: number) => y * SIZE + x;
const spawnAt = (faction: FactionId, grid: GridId, x: number, y: number): Command => ({
  type: "spawn",
  faction,
  grid,
  tile: at(x, y),
});

function run(world: World, ...commands: Command[]) {
  for (const c of commands) queueCommand(world, c);
  return runTick(world);
}

function reasons(world: World, ...commands: Command[]): string[] {
  return run(world, ...commands).rejected.map((r) => r.reason);
}

/** Builds a structure and waits for it to finish. Returns its id. */
function built(
  world: World,
  faction: FactionId,
  kind: StructureKind,
  grid: GridId,
  x: number,
  y: number,
): number {
  expect(reasons(world, { type: "build", faction, kind, grid, tile: at(x, y) })).toEqual([]);
  runTicks(world, BALANCE.structures[kind].buildTicks);
  const id = world.structureAt[grid]![at(x, y)]!;
  expect(world.structures[id]!.buildTicksLeft).toBe(0);
  return id;
}

const fire = (
  from: number,
  kind: "kineticStrike" | "antimatterWarhead",
  grid: GridId,
  x: number,
  y: number,
  faction = P1,
): Command => ({ type: "fireWeapon", faction, kind, from, grid, tile: at(x, y) });

/** Runs until no ship of `faction` is in flight (at most `limit` ticks). */
function untilLanded(world: World, faction: FactionId, limit = 2_000): void {
  for (let i = 0; i < limit && world.ships.some((s) => s.owner === faction); i++) runTick(world);
}

describe("space helpers", () => {
  it("finds points along a route by share of its length", () => {
    const route = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(pointAlong(route, 0, 10)).toEqual({ x: 0, y: 0 });
    expect(pointAlong(route, 5, 10)).toEqual({ x: 100, y: 0 });
    expect(pointAlong(route, 3, 4)).toEqual({ x: 100, y: 50 });
    expect(pointAlong(route, 20, 10)).toEqual({ x: 100, y: 100 });
  });

  it("spatial hash finds neighbors in the surrounding cells only", () => {
    const hash = new SpatialHash(100);
    hash.insert(1, 10, 10);
    hash.insert(2, 150, 10);
    hash.insert(3, 350, 10);
    hash.insert(4, -90, -90);
    expect(hash.near(20, 20, []).sort()).toEqual([1, 2, 4]);
  });
});

describe("structure index", () => {
  it("keeps per-faction counts through building, finishing, capture and destruction", () => {
    const world = twoPlanets();
    const p1 = world.factions[P1]!;
    const p2 = world.factions[P2]!;
    const code = KIND_CODE.habitat;
    run(world, { type: "build", faction: P1, kind: "habitat", grid: EARTH, tile: at(5, 5) });
    expect([p1.owned[code], p1.finished[code]]).toEqual([1, 0]);
    runTicks(world, BALANCE.structures.habitat.buildTicks);
    expect([p1.owned[code], p1.finished[code]]).toEqual([1, 1]);
    setOwner(world, world.grids[EARTH]!, at(5, 5), P2);
    expect([p1.owned[code], p2.owned[code], p2.finished[code]]).toEqual([0, 1, 1]);
    expect(tooCloseToStructure(world, EARTH, at(8, 7))).toBe(true);
    expect(tooCloseToStructure(world, EARTH, at(8, 8))).toBe(false);
  });
});

describe("Shield Generator", () => {
  it("makes the owner's nearby land cost attackers more troops", () => {
    const costToTake = (shielded: boolean) => {
      const world = twoPlanets();
      // P1 holds the left half of Mars, P2 the right half.
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < 20; x++) setOwner(world, world.grids[MARS]!, at(x, y), P1);
      }
      if (shielded) built(world, P2, "shieldGenerator", MARS, 25, 20);
      const p1 = world.factions[P1]!;
      p1.troops = 50_000;
      world.factions[P2]!.troops = 10_000;
      run(world, { type: "attack", faction: P1, grid: MARS, tile: at(21, 20), ratioPct: 1 });
      const attack = world.attacks[0]!;
      const sent = attack.troops;
      let taken = 0;
      for (let i = 0; i < 3; i++) {
        const before = world.factions[P1]!.gridTiles[MARS]!;
        runTick(world);
        taken += world.factions[P1]!.gridTiles[MARS]! - before;
      }
      const spent = sent - (world.attacks[0]?.troops ?? 0);
      return spent / Math.max(1, taken);
    };
    const plain = costToTake(false);
    const shielded = costToTake(true);
    expect(shielded).toBeGreaterThan(plain * 1.5);
  });
});

describe("weapons", () => {
  it("a Kinetic Strike destroys structures and kills troops, and everyone is warned", () => {
    const world = twoPlanets();
    trackChanges(world);
    const silo = built(world, P1, "launchSilo", EARTH, 5, 5);
    const target = built(world, P2, "habitat", MARS, 20, 20);
    const solars = world.factions[P1]!.solars;
    expect(reasons(world, fire(silo, "kineticStrike", MARS, 21, 20))).toEqual([]);
    // (Plus a tick of income.)
    expect(world.factions[P1]!.solars - (solars - BALANCE.weapons.kineticStrike.cost)).toBeLessThan(
      100,
    );
    expect(world.log!.events.some((e) => e.kind === "weaponLaunched")).toBe(true);
    // Reloading: a second shot is refused.
    expect(reasons(world, fire(silo, "kineticStrike", MARS, 10, 10))).toEqual([
      "launch silo is reloading",
    ]);
    // The tick it lands, P2 loses troops (growth can't make up for it).
    const strike = world.ships.find((sh) => sh.kind === "kineticStrike")!;
    runTicks(world, strike.arriveTick - world.tick);
    const before = world.factions[P2]!.troops;
    runTick(world);
    expect(world.factions[P2]!.troops).toBeLessThan(before - 500);
    expect(world.structures[target]!.destroyed).toBe(true);
    expect(world.structureAt[MARS]![at(20, 20)]).toBe(-1);
    expect(world.grids[MARS]!.owner[at(21, 20)]).toBe(P2); // the land stays
    expect(world.log!.events.some((e) => e.kind === "weaponHit")).toBe(true);
    expect(world.log!.effects.some((e) => e.kind === "impact")).toBe(true);
  });

  it("refuses to fire at yourself, at allies, unbuilt silos or without Solars", () => {
    const world = twoPlanets();
    expect(
      reasons(world, { type: "build", faction: P1, kind: "launchSilo", grid: EARTH, tile: 0 }),
    ).toEqual([]);
    expect(
      reasons(world, fire(world.structureAt[EARTH]![0]!, "kineticStrike", MARS, 1, 1)),
    ).toEqual(["launch silo not finished"]);
    const silo = built(world, P1, "launchSilo", EARTH, 30, 30);
    expect(reasons(world, fire(silo, "kineticStrike", EARTH, 1, 1))).toEqual([
      "can't fire at yourself",
    ]);
    makeAlliance(world, P1, P2);
    expect(reasons(world, fire(silo, "kineticStrike", MARS, 1, 1))).toEqual([
      "can't fire at an ally",
    ]);
    world.diplomacy.alliances.clear();
    world.factions[P1]!.solars = 10;
    expect(reasons(world, fire(silo, "antimatterWarhead", MARS, 1, 1))).toEqual([
      "not enough Solars",
    ]);
    expect(reasons(world, fire(silo, "kineticStrike", MARS, 1, 1, P2))).toEqual([
      "not your launch silo",
    ]);
  });

  it("an Antimatter Warhead wipes territory and leaves slow, unbuildable fallout", () => {
    const world = twoPlanets();
    const silo = built(world, P1, "launchSilo", EARTH, 5, 5);
    const port = built(world, P2, "spaceport", MARS, 20, 20);
    expect(reasons(world, fire(silo, "antimatterWarhead", MARS, 20, 20))).toEqual([]);
    untilLanded(world, P1);
    const mars = world.grids[MARS]!;
    const r = BALANCE.weapons.antimatterWarhead.radius;
    expect(mars.owner[at(20, 20)]).toBe(NEUTRAL);
    expect(mars.owner[at(20 + r, 20)]).toBe(NEUTRAL);
    expect(mars.owner[at(20 + r + 1, 20)]).toBe(P2);
    expect(world.structures[port]!.destroyed).toBe(true);
    expect(world.fallout).toHaveLength(1);
    // Nothing can be built on irradiated land, even after retaking it.
    setOwner(world, mars, at(20, 20), P2);
    expect(
      reasons(world, { type: "build", faction: P2, kind: "habitat", grid: MARS, tile: at(20, 20) }),
    ).toEqual(["the land is irradiated"]);

    // Retaking irradiated land costs more troops per tile than clean land.
    const p2 = world.factions[P2]!;
    p2.troops = 100_000;
    const cost = (tile: number) => {
      run(world, { type: "attack", faction: P2, grid: MARS, tile, ratioPct: 1 });
      const attack = world.attacks[0]!;
      const sent = attack.troops;
      const start = p2.gridTiles[MARS]!;
      runTicks(world, 2);
      expect(world.attacks).toContain(attack);
      const taken = p2.gridTiles[MARS]! - start;
      world.attacks.length = 0;
      return (sent - attack.troops) / Math.max(1, taken);
    };
    const irradiated = cost(at(20, 21));
    world.fallout.length = 0;
    const clean = cost(at(20, 21));
    expect(irradiated).toBeGreaterThan(clean * 2);
  });

  it("fallout fades after its time", () => {
    const world = twoPlanets();
    world.fallout.push({ grid: MARS, tile: at(5, 5), radius: 3, untilTick: world.tick + 5 });
    runTicks(world, 6);
    expect(world.fallout).toHaveLength(0);
  });
});

describe("Orbital Defense Platform", () => {
  it("shoots down warheads near its world; a second one at once gets through", () => {
    const world = twoPlanets();
    trackChanges(world);
    const silo1 = built(world, P1, "launchSilo", EARTH, 5, 5);
    const silo2 = built(world, P1, "launchSilo", EARTH, 30, 30);
    built(world, P2, "orbitalDefense", MARS, 30, 5);
    expect(reasons(world, fire(silo1, "antimatterWarhead", MARS, 10, 10))).toEqual([]);
    untilLanded(world, P1);
    expect(world.log!.events.some((e) => e.kind === "weaponIntercepted")).toBe(true);
    expect(world.grids[MARS]!.owner[at(10, 10)]).toBe(P2); // nothing hit

    // Reloaded silos fire a salvo: the platform can't stop both.
    runTicks(world, BALANCE.weapons.siloReloadTicks);
    world.log!.events.length = 0;
    expect(
      reasons(
        world,
        fire(silo1, "antimatterWarhead", MARS, 10, 10),
        fire(silo2, "antimatterWarhead", MARS, 10, 30),
      ),
    ).toEqual([]);
    untilLanded(world, P1);
    const hits = world.log!.events.filter((e) => e.kind === "weaponHit").length;
    const downed = world.log!.events.filter((e) => e.kind === "weaponIntercepted").length;
    expect([hits, downed]).toEqual([1, 1]);
  });

  it("damages incoming landers, which land with fewer troops", () => {
    const world = twoPlanets();
    const port = built(world, P1, "spaceport", EARTH, 5, 5);
    built(world, P2, "orbitalDefense", MARS, 30, 5);
    world.factions[P1]!.troops = 10_000;
    run(world, {
      type: "launch",
      faction: P1,
      kind: "troopLander",
      from: port,
      toGrid: MARS,
      toTile: at(10, 10),
      ratioPct: 50,
    });
    const lander = world.ships[0]!;
    const sent = lander.troops;
    let last = sent;
    while (world.ships.includes(lander)) {
      last = lander.troops;
      runTick(world);
    }
    expect(last).toBeLessThan(sent);
  });
});

describe("Warship", () => {
  const launchWarship = (from: number, area: object, faction = P1): Command => ({
    type: "launchWarship",
    faction,
    from,
    x: 0,
    y: 0,
    guardGrid: -1,
    ...area,
  });

  it("is bought at a Spaceport, costs more each time, and patrols its area", () => {
    const world = twoPlanets();
    const port = built(world, P1, "spaceport", EARTH, 5, 5);
    const solars = world.factions[P1]!.solars;
    expect(reasons(world, launchWarship(port, { x: 3_000, y: 0 }))).toEqual([]);
    expect(world.factions[P1]!.solars - (solars - BALANCE.warship.cost)).toBeLessThan(100);
    expect(reasons(world, launchWarship(port, { x: 3_000, y: 0 }))).toEqual([]);
    expect(world.factions[P1]!.solars).toBeLessThan(solars - 2 * BALANCE.warship.cost);
    expect(reasons(world, launchWarship(port, { x: 50_000, y: 0 }))).toEqual([
      "patrol point is too far out",
    ]);
    runTicks(world, 600);
    for (const w of world.warships) {
      const d = Math.hypot(w.x - 3_000, w.y);
      expect(d).toBeLessThan(BALANCE.warship.patrolRadius * 1.5);
    }
    const id = world.warships[0]!.id;
    expect(
      reasons(world, { type: "patrol", faction: P2, warship: id, x: 0, y: 0, guardGrid: -1 }),
    ).toEqual(["not your warship"]);
    expect(
      reasons(world, { type: "patrol", faction: P1, warship: id, x: 0, y: 0, guardGrid: 1 }),
    ).toEqual([]);
    expect(world.warships[0]!.guardGrid).toBe(1);
  });

  it("guarding a world, it shoots enemy landers flying there", () => {
    const world = twoPlanets();
    const p2port = built(world, P2, "spaceport", MARS, 30, 30);
    const port = built(world, P1, "spaceport", EARTH, 5, 5);
    expect(reasons(world, launchWarship(p2port, { guardGrid: MARS }, P2))).toEqual([]);
    runTicks(world, 100);
    world.factions[P1]!.troops = 10_000;
    run(world, {
      type: "launch",
      faction: P1,
      kind: "troopLander",
      from: port,
      toGrid: MARS,
      toTile: at(10, 10),
      ratioPct: 50,
    });
    const lander = world.ships.find((s) => s.kind === "troopLander")!;
    const sent = lander.troops;
    let last = sent;
    while (world.ships.includes(lander)) {
      last = lander.hp > 0 ? lander.troops : 0;
      runTick(world);
    }
    expect(last).toBeLessThan(sent / 2);
  });

  it("two Warships fight until one is destroyed", () => {
    const world = twoPlanets();
    const port1 = built(world, P1, "spaceport", EARTH, 5, 5);
    const port2 = built(world, P2, "spaceport", MARS, 5, 5);
    const point = { x: 2_900, y: 400 };
    expect(reasons(world, launchWarship(port1, point), launchWarship(port2, point, P2))).toEqual(
      [],
    );
    for (let i = 0; i < 2_000 && world.warships.length === 2; i++) runTick(world);
    expect(world.warships).toHaveLength(1);
  });

  it("allies' Warships leave each other alone", () => {
    const world = twoPlanets();
    const port1 = built(world, P1, "spaceport", EARTH, 5, 5);
    const port2 = built(world, P2, "spaceport", MARS, 5, 5);
    makeAlliance(world, P1, P2);
    const point = { x: 2_900, y: 400 };
    run(world, launchWarship(port1, point), launchWarship(port2, point, P2));
    runTicks(world, 800);
    expect(world.warships.map((w) => w.hp)).toEqual([BALANCE.hp.warship, BALANCE.hp.warship]);
  });

  it("destroys an enemy Solar Siphon it patrols at", () => {
    const world = twoPlanets();
    const corona = world.corona!;
    // A Sun Base at sector 6 keeps P2's Corona land (sectors 0–9) from decaying.
    for (let sector = 0; sector < 3; sector++) setOwner(world, corona, sector, P2);
    const ship: Ship = {
      id: 999,
      kind: "sunBaseShip",
      owner: P2,
      troops: 0,
      hp: 1,
      fromGrid: MARS,
      fromTile: 0,
      toGrid: corona.id,
      toTile: 6,
      toStructure: -1,
      launchTick: 0,
      arriveTick: 0,
      waypoints: [],
    };
    foundSunBase(world, ship);
    const siphon = built(world, P2, "solarSiphon", corona.id, 0, 0);
    expect(world.structures[siphon]!.tile).toBe(0);
    const port = built(world, P1, "spaceport", EARTH, 5, 5);
    run(world, launchWarship(port, coronaTilePoint(corona, 0)));
    for (let i = 0; i < 3_000 && !world.structures[siphon]!.destroyed; i++) runTick(world);
    expect(world.structures[siphon]!.destroyed).toBe(true);
    expect(world.factions[P2]!.finished[KIND_CODE.solarSiphon]).toBe(0);
  });

  it("is deterministic with Warships, weapons and defenses in play", () => {
    const play = () => {
      const world = twoPlanets(7);
      const silo = built(world, P1, "launchSilo", EARTH, 5, 5);
      const port1 = built(world, P1, "spaceport", EARTH, 30, 30);
      const port2 = built(world, P2, "spaceport", MARS, 30, 30);
      built(world, P2, "orbitalDefense", MARS, 5, 5);
      run(
        world,
        launchWarship(port1, { guardGrid: MARS }),
        launchWarship(port2, { guardGrid: MARS }, P2),
        fire(silo, "kineticStrike", MARS, 20, 20),
      );
      const hashes: number[] = [];
      for (let i = 0; i < 20; i++) {
        runTicks(world, 50);
        hashes.push(hashWorld(world));
      }
      return hashes;
    };
    expect(play()).toEqual(play());
  });
});
