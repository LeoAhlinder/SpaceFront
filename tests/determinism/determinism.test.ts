/**
 * The core promise of the simulation: same seed + same commands ⇒ same state.
 * Runs a match twice and compares state hashes every 50 ticks.
 *
 * Until real systems exist (M0.3), a test system stands in for gameplay: it
 * uses the world RNG to claim tiles and change faction numbers, so the RNG,
 * grids and factions all feed into the hash.
 */
import { describe, expect, it } from "vitest";
import type { MatchConfig, System, World } from "../../src/core";
import { addFaction, createWorld, factionId, hashWorld, runTick } from "../../src/core";

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
    bodies: [{ radius: 40 }, { radius: 12 }],
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
