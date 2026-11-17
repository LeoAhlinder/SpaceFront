import { describe, expect, it } from "vitest";
import { BALANCE } from "../../data/balance";
import type { Command } from "../commands/commands";
import { Terrain } from "../grid/terrain";
import type { FactionId, GridId } from "../ids";
import { NEUTRAL } from "../ids";
import { hashWorld } from "../serialize/hash";
import { runTick, runTicks } from "../tick";
import { setOwner } from "../world/territory";
import type { World } from "../world/world";
import { addFaction, createWorld } from "../world/world";
import { queueCommand } from "../commands/applyCommands";

const EARTH = 0 as GridId;
const MARS = 1 as GridId;
const P1 = 1 as FactionId;
const P2 = 2 as FactionId;

/** Earth and Mars as small 40×40 maps; P1 spawned on Earth, P2 on Mars. */
function twoPlanets(seed = 1): World {
  const world = createWorld({
    seed,
    difficulty: "normal",
    bodies: [
      { width: 40, height: 40, bodyId: "earth" },
      { width: 40, height: 40, bodyId: "mars" },
    ],
  });
  addFaction(world, "P1", "player");
  addFaction(world, "P2", "bot");
  run(world, spawn(P1, EARTH, 20, 20), spawn(P2, MARS, 10, 10));
  return world;
}

const at = (world: World, grid: GridId, x: number, y: number) => world.grids[grid]!.index(x, y);
const spawn = (faction: FactionId, grid: GridId, x: number, y: number): Command => ({
  type: "spawn",
  faction,
  grid,
  tile: y * 40 + x,
});
const build = (world: World, grid: GridId, x: number, y: number, faction = P1): Command => ({
  type: "build",
  faction,
  kind: "spaceport",
  grid,
  tile: at(world, grid, x, y),
});
const launch = (from: number, toGrid: GridId, toTile: number, ratioPct = 50): Command => ({
  type: "launch",
  faction: P1,
  kind: "troopLander",
  from,
  toGrid,
  toTile,
  ratioPct,
});

function run(world: World, ...commands: Command[]) {
  for (const c of commands) queueCommand(world, c);
  return runTick(world);
}

function reasons(world: World, ...commands: Command[]): string[] {
  return run(world, ...commands).rejected.map((r) => r.reason);
}

/** Builds a Spaceport at (20, 20) on Earth for P1 and waits until it's finished. */
function withPort(world: World): number {
  expect(reasons(world, build(world, EARTH, 20, 20))).toEqual([]);
  runTicks(world, BALANCE.structures.spaceportBuildTicks);
  return world.structureAt[EARTH]![at(world, EARTH, 20, 20)]!;
}

describe("Spaceport", () => {
  it("is built on your own land and takes time to finish", () => {
    const world = twoPlanets();
    expect(reasons(world, build(world, EARTH, 20, 20))).toEqual([]);
    const port = world.structures[0]!;
    expect(port).toMatchObject({ kind: "spaceport", owner: P1, grid: EARTH });
    expect(port.buildTicksLeft).toBeGreaterThan(0);
    runTicks(world, BALANCE.structures.spaceportBuildTicks);
    expect(port.buildTicksLeft).toBe(0);
  });

  it("can't be built on others' land, too close to another, or before spawning", () => {
    const world = twoPlanets();
    expect(reasons(world, build(world, MARS, 10, 10))).toEqual(["not your land"]);
    expect(reasons(world, build(world, EARTH, 20, 20))).toEqual([]);
    expect(reasons(world, build(world, EARTH, 21, 21))).toEqual(["too close to another structure"]);
    addFaction(world, "Late", "bot");
    expect(reasons(world, build(world, EARTH, 30, 30, 3 as FactionId))).toEqual([
      "not spawned yet",
    ]);
  });

  it("changes hands with its tile", () => {
    const world = twoPlanets();
    const portId = withPort(world);
    setOwner(world, world.grids[EARTH]!, at(world, EARTH, 20, 20), P2);
    expect(world.structures[portId]!.owner).toBe(P2);
  });
});

describe("Troop Lander", () => {
  it("can't launch from an unfinished or foreign Spaceport", () => {
    const world = twoPlanets();
    run(world, build(world, EARTH, 20, 20));
    expect(reasons(world, launch(0, MARS, at(world, MARS, 30, 30)))).toEqual([
      "spaceport not finished",
    ]);
    expect(reasons(world, launch(99, MARS, 0))).toEqual(["not your spaceport"]);
  });

  it("flies to Mars, takes a beachhead and expands from it", () => {
    const world = twoPlanets();
    const portId = withPort(world);
    const troopsBefore = world.factions[P1]!.troops;
    const target = at(world, MARS, 30, 30);
    expect(reasons(world, launch(portId, MARS, target))).toEqual([]);

    const ship = world.ships[0]!;
    expect(ship.troops).toBeGreaterThan(0);
    expect(world.factions[P1]!.troops).toBeLessThan(troopsBefore);
    expect(ship.arriveTick).toBeGreaterThan(world.tick);
    expect(ship.waypoints.length).toBeGreaterThanOrEqual(2);

    runTicks(world, ship.arriveTick - world.tick + 1);
    expect(world.ships).toHaveLength(0);
    expect(world.grids[MARS]!.owner[target]).toBe(P1);
    runTicks(world, 30);
    let onMars = 0;
    for (const o of world.grids[MARS]!.owner) if (o === P1) onMars++;
    expect(onMars).toBeGreaterThan(10);
  });

  it("invades enemy land, attacking its owner", () => {
    const world = twoPlanets();
    const portId = withPort(world);
    world.factions[P1]!.troops = 50_000;
    const enemyTile = at(world, MARS, 10, 10);
    expect(world.grids[MARS]!.owner[enemyTile]).toBe(P2);
    run(world, launch(portId, MARS, enemyTile, 80));
    runTicks(world, world.ships[0]!.arriveTick - world.tick + 1);
    expect(world.grids[MARS]!.owner[enemyTile]).toBe(P1);
    expect(world.attacks.some((a) => a.attacker === P1 && a.target === P2)).toBe(true);
  });

  it("hops across an ocean on the same map", () => {
    const world = twoPlanets();
    const earth = world.grids[EARTH]!;
    for (let y = 0; y < 40; y++) earth.terrain[earth.index(30, y)] = Terrain.Ocean;
    const portId = withPort(world);
    const far = at(world, EARTH, 35, 20);
    run(world, launch(portId, EARTH, far));
    const ship = world.ships[0]!;
    expect(ship.waypoints).toEqual([]);
    runTicks(world, ship.arriveTick - world.tick + 1);
    expect(earth.owner[far]).toBe(P1);
  });

  it("reinforces when landing on your own land", () => {
    const world = twoPlanets();
    const portId = withPort(world);
    const own = at(world, EARTH, 21, 20);
    run(world, launch(portId, EARTH, own, 50));
    const sent = world.ships[0]!.troops;
    const before = world.factions[P1]!.troops;
    runTicks(world, world.ships[0]!.arriveTick - world.tick + 1);
    expect(world.factions[P1]!.troops).toBeGreaterThanOrEqual(before + sent);
  });

  it("needs a route between maps outside the solar system", () => {
    const world = createWorld({
      seed: 1,
      difficulty: "normal",
      bodies: [
        { width: 40, height: 40 },
        { width: 40, height: 40 },
      ],
    });
    addFaction(world, "P1", "player");
    run(world, spawn(P1, EARTH, 20, 20));
    const portId = withPort(world);
    expect(reasons(world, launch(portId, MARS, 5))).toEqual(["no route"]);
    expect(world.grids[MARS]!.owner[5]).toBe(NEUTRAL);
  });

  it("plays out identically across runs", () => {
    const play = () => {
      const world = twoPlanets(42);
      const portId = withPort(world);
      const hashes: number[] = [];
      for (let i = 0; i < 6; i++) {
        run(world, launch(portId, MARS, at(world, MARS, 5 + i * 5, 30), 20));
        runTicks(world, 60);
        hashes.push(hashWorld(world));
      }
      return hashes;
    };
    expect(play()).toEqual(play());
  });
});
