/**
 * The core promise of the simulation: same seed + same commands ⇒ same state.
 * Runs a match twice and compares state hashes every 50 ticks.
 *
 * The first tests use a stand-in system that claims random tiles; the scripted
 * match at the bottom runs the real systems (spawn, population, attacks).
 */
import { describe, expect, it } from "vitest";
import type { Command, MatchConfig, System, World } from "../../src/core";
import {
  addFaction,
  createWorld,
  factionId,
  hashWorld,
  isOwnableTerrain,
  queueCommand,
  Rng,
  runTick,
  Terrain,
} from "../../src/core";

const HASH_EVERY = 50;
const TICKS = 1_000;

const randomClaims: System = (world) => {
  const grid = world.grids[world.rng.nextInt(world.grids.length)]!;
  const tile = world.rng.nextInt(grid.size);
  if (!grid.isUsable(tile)) return;
  const owner = factionId(world.rng.nextInt(world.factions.length));
  grid.owner[tile] = owner;
  const faction = world.factions[owner]!;
  faction.troops += world.rng.nextRange(1, 100);
  faction.solars += world.rng.nextInt(10);
};

function play(config: MatchConfig): number[] {
  const world: World = createWorld(config);
  for (let i = 1; i <= 8; i++) addFaction(world, `Bot ${i}`, "bot");
  const hashes: number[] = [];
  for (let t = 0; t < TICKS; t++) {
    runTick(world, [randomClaims]);
    if (world.tick % HASH_EVERY === 0) hashes.push(hashWorld(world));
  }
  return hashes;
}

describe("determinism", () => {
  const config: MatchConfig = {
    seed: 20261117,
    difficulty: "normal",
    bodies: [
      { width: 80, height: 80 },
      { width: 24, height: 24 },
    ],
  };

  it("produces identical hashes every 50 ticks across two runs", () => {
    const first = play(config);
    const second = play(config);
    expect(first).toHaveLength(TICKS / HASH_EVERY);
    expect(second).toEqual(first);
  });

  it("produces different states for a different seed", () => {
    expect(play({ ...config, seed: config.seed + 1 })).not.toEqual(play(config));
  });

  it("a pure empty world stays deterministic too", () => {
    const run = () => {
      const world = createWorld(config);
      for (let t = 0; t < TICKS; t++) runTick(world);
      return hashWorld(world);
    };
    expect(run()).toBe(run());
  });
});

/**
 * A scripted match through the real systems: six factions spawn, then attack
 * neutral land and each other on a schedule. Terrain is painted from the seed.
 */
function playScripted(seed: number): { hashes: number[]; world: World; rejected: number } {
  const world = createWorld({ seed, difficulty: "normal", bodies: [{ width: 120, height: 120 }] });
  const grid = world.grids[0]!;
  const paint = Rng.fromSeed(seed, 99);
  for (let i = 0; i < grid.size; i++) {
    if (!grid.isUsable(i)) continue;
    const roll = paint.nextInt(100);
    grid.terrain[i] =
      roll < 5
        ? Terrain.Ocean
        : roll < 20
          ? Terrain.Mountains
          : roll < 35
            ? Terrain.Highlands
            : Terrain.Plains;
  }

  const spots: [number, number][] = [
    [30, 60],
    [90, 60],
    [60, 30],
    [60, 90],
    [40, 40],
    [80, 80],
  ];
  const script: { tick: number; command: Command }[] = [];
  spots.forEach(([x, y], i) => {
    const f = addFaction(world, `Bot ${i + 1}`, "bot").id;
    let tile = grid.index(x, y);
    while (!isOwnableTerrain(grid.terrain[tile]!)) tile++;
    script.push({ tick: 0, command: { type: "spawn", faction: f, grid: grid.id, tile } });
    for (let t = 20 + i * 7; t < 2_000; t += 90) {
      const [tx, ty] = spots[(i + 1 + Math.floor(t / 90)) % spots.length]!;
      script.push({
        tick: t,
        command: {
          type: "attack",
          faction: f,
          grid: grid.id,
          // Aim halfway to another spawn: neutral land early, a neighbor's land later.
          tile: grid.index(Math.floor((x + tx) / 2), Math.floor((y + ty) / 2)),
          ratioPct: 35,
        },
      });
    }
  });
  for (const { tick, command } of script) queueCommand(world, command, tick);

  const hashes: number[] = [];
  let rejected = 0;
  for (let t = 0; t < 2_000; t++) {
    rejected += runTick(world).rejected.length;
    if (world.tick % HASH_EVERY === 0) hashes.push(hashWorld(world));
  }
  return { hashes, world, rejected };
}

describe("determinism: scripted match through the real systems", () => {
  it("produces identical hashes every 50 ticks across two runs", () => {
    const first = playScripted(777);
    const second = playScripted(777);
    expect(second.hashes).toEqual(first.hashes);
  });

  it("actually plays: factions expand and fight", () => {
    const { world, rejected } = playScripted(777);
    const alive = world.factions.filter((f) => f.alive);
    const totalTiles = world.factions.reduce((sum, f) => sum + f.tileCount, 0);
    expect(alive.length).toBeGreaterThan(1);
    expect(rejected).toBeLessThan(100); // most scripted commands are valid
    expect(totalTiles).toBeGreaterThan(world.grids[0]!.size / 4);
  });
});
