/**
 * Saves (ARCHITECTURE.md §9): a world saved mid-match and loaded again must
 * be the same world, and must keep producing the same hashes as the
 * original run.
 */
import { describe, expect, it } from "vitest";
import type { World } from "../../src/core";
import { hashWorld, loadWorld, readSaveHeader, runTick, saveWorld } from "../../src/core";
import { populate, solarWorld } from "../support/solarMatch";

const HASH_EVERY = 50;

/** A Hard match with nations, colonies and bots, run past the opening. */
function midMatch(ticks: number): World {
  const world = solarWorld(4242, "hard");
  populate(world, 20);
  for (let t = 0; t < ticks; t++) runTick(world);
  return world;
}

function hashesOver(world: World, ticks: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < ticks; t++) {
    runTick(world);
    if (world.tick % HASH_EVERY === 0) out.push(hashWorld(world));
  }
  return out;
}

describe("save and load", () => {
  const original = midMatch(1_200);
  const bytes = saveWorld(original, { playerId: 1, note: "test" });

  it("loads back to the same state hash, with its header", () => {
    const { world, header } = loadWorld<{ playerId: number; note: string }>(bytes);
    expect(hashWorld(world)).toBe(hashWorld(original));
    expect(world.tick).toBe(1_200);
    expect(header).toEqual({ playerId: 1, note: "test" });
    expect(readSaveHeader(bytes)).toEqual({ tick: 1_200, header });
    expect(world.log).toBeNull();
  });

  it("keeps producing the original run's hashes after loading", () => {
    const { world } = loadWorld(bytes);
    const resumed = hashesOver(world, 600);
    const continued = hashesOver(original, 600);
    expect(resumed).toHaveLength(600 / HASH_EVERY);
    expect(resumed).toEqual(continued);
    // Something happened in those ticks (the comparison isn't trivially equal).
    expect(new Set(continued).size).toBe(continued.length);
  });

  it("restores the world's internal objects as working instances", () => {
    const a = loadWorld(bytes).world;
    const b = loadWorld(bytes).world;
    expect(a.rng.nextInt(1_000_000)).toBe(b.rng.nextInt(1_000_000));
    expect(a.grids[0]!.neighbors(0, new Int32Array(4))).toBeGreaterThan(0);
    expect(a.pending.size).toBe(b.pending.size);
    expect(a.attacks.every((x) => typeof x.frontier.pop === "function")).toBe(true);
  });

  it("rejects a save that isn't one, has another version, or is damaged", () => {
    expect(() => loadWorld(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(
      /Not a SpaceFront save/,
    );
    const otherVersion = bytes.slice();
    otherVersion[4] = 99;
    expect(() => loadWorld(otherVersion)).toThrow(/format 99/);
    // Change the neutral faction's Solars (the first "solars" field): still readable, wrong hash.
    const damaged = bytes.slice();
    const key = [...new TextEncoder().encode("solars")];
    const at = damaged.findIndex((_, i) => key.every((b, j) => damaged[i + j] === b));
    damaged[at + key.length + 1]! ^= 0x01; // the Int value after its tag byte
    expect(() => loadWorld(damaged)).toThrow(/damaged/);
    expect(() => loadWorld(bytes.slice(0, bytes.length - 10))).toThrow();
  });

  it("is a reasonable size", () => {
    // Every tile of every map is in here; mostly typed arrays.
    expect(bytes.length).toBeLessThan(40_000_000);
    console.log(`Save at tick 1200: ${(bytes.length / 1e6).toFixed(1)} MB`);
  });
});
