/**
 * Soak test of a full match setup: all 13 worlds, 40 bots, economy, trade,
 * structures and ships, for 3,000 ticks (5 minutes of game time). Must stay
 * deterministic and keep the simulation well inside its 100 ms tick budget.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TerrainMap, World } from "../../src/core";
import { addBot, createWorld, hashWorld, loadTerrainMap, runTick } from "../../src/core";
import { LANDABLE_BODIES } from "../../src/data/bodies";
import { botHomes } from "../../src/worker/simHost";

const maps = new Map<string, TerrainMap>(
  LANDABLE_BODIES.map((b) => {
    const dir = new URL(`../../public/maps/${b.map!.mapId}/`, import.meta.url);
    const map = loadTerrainMap(
      new Uint8Array(readFileSync(new URL("terrain.bin", dir))),
      JSON.parse(readFileSync(new URL("regions.json", dir), "utf8")),
    );
    return [map.id, map];
  }),
);

const TICKS = 3_000;

function play(seed: number) {
  const world: World = createWorld(
    {
      seed,
      difficulty: "normal",
      bodies: LANDABLE_BODIES.map((b) => ({
        width: b.map!.width,
        height: b.map!.height,
        mapId: b.map!.mapId,
        bodyId: b.id,
      })),
    },
    maps,
  );
  botHomes(world, 40, seed).forEach((grid, i) => addBot(world, `Bot ${i + 1}`, grid));
  const hashes: number[] = [];
  let slowest = 0;
  const start = performance.now();
  for (let t = 0; t < TICKS; t++) {
    const t0 = performance.now();
    runTick(world);
    slowest = Math.max(slowest, performance.now() - t0);
    if (world.tick % 100 === 0) hashes.push(hashWorld(world));
  }
  return { world, hashes, ms: performance.now() - start, slowest };
}

describe("solar system with 40 bots for 3,000 ticks", () => {
  const first = play(77);

  it("runs twice with identical hashes", () => {
    expect(play(77).hashes).toEqual(first.hashes);
  });

  it("builds an economy: Spaceports, Habitats and trade", () => {
    const { world } = first;
    const ports = world.structures.filter((s) => s.kind === "spaceport").length;
    const habitats = world.structures.filter((s) => s.kind === "habitat").length;
    const solars = world.factions.reduce((sum, f) => sum + f.solars, 0);
    console.log(
      `solar soak: ${(first.ms / TICKS).toFixed(2)} ms/tick avg, ${first.slowest.toFixed(1)} ms slowest; ` +
        `${ports} Spaceports, ${habitats} Habitats, ${world.ships.length} ships in flight, ${solars}☉ total`,
    );
    expect(ports).toBeGreaterThan(5);
    expect(habitats).toBeGreaterThan(0);
  });

  it("stays well inside the 100 ms tick budget", () => {
    expect(first.ms / TICKS).toBeLessThan(5);
  });
});
