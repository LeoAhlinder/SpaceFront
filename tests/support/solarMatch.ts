/**
 * Builds full solar-system matches for cross-module tests: every landable
 * body with its real map file, the Corona, and optionally a difficulty's
 * nations and colonies plus bots, set up the way the worker does it.
 */
import { readFileSync } from "node:fs";
import type { Difficulty, TerrainMap, World } from "../../src/core";
import { addBot, addNations, createWorld, loadTerrainMap } from "../../src/core";
import { LANDABLE_BODIES } from "../../src/data/bodies";
import { botHomes } from "../../src/worker/simHost";

/** Every landable body's map, loaded once per test file. */
export const SOLAR_MAPS = new Map<string, TerrainMap>(
  LANDABLE_BODIES.map((b) => {
    const dir = new URL(`../../public/maps/${b.map!.mapId}/`, import.meta.url);
    const map = loadTerrainMap(
      new Uint8Array(readFileSync(new URL("terrain.bin", dir))),
      JSON.parse(readFileSync(new URL("regions.json", dir), "utf8")),
    );
    return [map.id, map];
  }),
);

/** An empty solar-system world (no factions yet), with the Corona. */
export function solarWorld(seed: number, difficulty: Difficulty = "normal"): World {
  return createWorld(
    {
      seed,
      difficulty,
      bodies: LANDABLE_BODIES.map((b) => ({
        width: b.map!.width,
        height: b.map!.height,
        mapId: b.map!.mapId,
        bodyId: b.id,
      })),
      corona: true,
    },
    SOLAR_MAPS,
  );
}

/** Adds the difficulty's nations and colonies, then `bots` bots (like the worker). */
export function populate(world: World, bots: number, withNations = true): void {
  if (withNations) {
    addNations(world, world.config.difficulty, SOLAR_MAPS.get("earth")!.regions);
  }
  botHomes(world, bots, world.config.seed).forEach((grid, i) =>
    addBot(world, `Bot ${i + 1}`, grid),
  );
}
