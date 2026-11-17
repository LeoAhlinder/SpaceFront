/**
 * Soak test (CODING_PLAN M0.5): 50 bots on the real Earth map for 5,000 ticks
 * (over 8 minutes of game time). Must finish without errors, keep every
 * invariant, and hash identically on a second run.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { World } from "../../src/core";
import {
  addBot,
  createWorld,
  hashWorld,
  loadTerrainMap,
  refGrid,
  refTile,
  runTick,
} from "../../src/core";

const dir = new URL("../../public/maps/earth/", import.meta.url);
const earth = loadTerrainMap(
  new Uint8Array(readFileSync(new URL("terrain.bin", dir))),
  JSON.parse(readFileSync(new URL("regions.json", dir), "utf8")),
);

const BOTS = 50;
const TICKS = 5_000;

function play(seed: number): { world: World; hashes: number[]; rejected: number; ms: number } {
  const start = performance.now();
  const world = createWorld(
    { seed, difficulty: "normal", bodies: [{ radius: earth.radius, mapId: "earth" }] },
    new Map([["earth", earth]]),
  );
  for (let i = 1; i <= BOTS; i++) addBot(world, `Bot ${i}`);
  const hashes: number[] = [];
  let rejected = 0;
  for (let t = 0; t < TICKS; t++) {
    rejected += runTick(world).rejected.length;
    if (world.tick % 50 === 0) hashes.push(hashWorld(world));
  }
  return { world, hashes, rejected, ms: performance.now() - start };
}

describe("50 bots on Earth for 5,000 ticks", () => {
  const first = play(2026);

  it("runs twice with identical hashes every 50 ticks", () => {
    const second = play(2026);
    expect(second.hashes).toEqual(first.hashes);
  });

  it("keeps every invariant", () => {
    const { world } = first;
    const grid = world.grids[0]!;
    for (const f of world.factions.slice(1)) {
      expect(f.tiles.length).toBe(f.tileCount);
      expect(f.troops).toBeGreaterThanOrEqual(0);
      expect(f.workers).toBeGreaterThanOrEqual(0);
      if (!f.alive) expect(f.tileCount).toBe(0);
      for (const ref of f.tiles) expect(grid.owner[refTile(ref)]).toBe(f.id);
      expect(f.tiles.every((ref) => refGrid(ref) === 0)).toBe(true);
    }
    let owned = 0;
    for (let t = 0; t < grid.size; t++) if (grid.owner[t] !== 0) owned++;
    expect(owned).toBe(world.factions.reduce((sum, f) => sum + f.tileCount, 0));
  });

  it("plays like a game: bots spawn, expand and some get eliminated", () => {
    const { world, rejected, ms } = first;
    const bots = world.factions.slice(1);
    const alive = bots.filter((f) => f.alive);
    const sizes = alive.map((f) => f.tileCount).sort((a, b) => b - a);
    console.log(
      `soak: ${Math.round(ms)} ms for ${TICKS} ticks (${(ms / TICKS).toFixed(2)} ms/tick), ` +
        `${alive.length}/${BOTS} alive, ${rejected} rejected, largest ${sizes.slice(0, 5).join(", ")}`,
    );
    expect(bots.every((f) => f.hasSpawned)).toBe(true);
    expect(alive.length).toBeGreaterThan(1);
    expect(sizes[0]).toBeGreaterThan(1_000);
  });
});
