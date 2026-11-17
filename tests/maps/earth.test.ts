/**
 * Checks the committed Earth map (public/maps/earth) produced by `npm run mapgen`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Command, FactionId, TerrainMap } from "../../src/core";
import {
  addFaction,
  createWorld,
  gridId,
  isOwnableTerrain,
  loadTerrainMap,
  queueCommand,
  runTicks,
  Terrain,
} from "../../src/core";
import { project } from "../../tools/mapgen/projection";

const dir = new URL("../../public/maps/earth/", import.meta.url);
const earth: TerrainMap = loadTerrainMap(
  new Uint8Array(readFileSync(new URL("terrain.bin", dir))),
  JSON.parse(readFileSync(new URL("regions.json", dir), "utf8")),
);
function terrainAt(lon: number, lat: number): number {
  const { px, py } = project(lon, lat, earth.width, earth.height);
  return earth.terrain[Math.floor(py) * earth.width + Math.floor(px)]!;
}

describe("Earth map", () => {
  it("is a flat 800×386 map with plenty of land", () => {
    expect([earth.width, earth.height]).toEqual([800, 386]);
    let usable = 0;
    let land = 0;
    for (const t of earth.terrain) {
      if (t === Terrain.Space) continue;
      usable++;
      if (t !== Terrain.Ocean) land++;
    }
    // Not equal-area: land far from the equator is enlarged, so a bit above Earth's 29%.
    expect(land / usable).toBeGreaterThan(0.25);
    expect(land / usable).toBeLessThan(0.36);
  });

  it("puts land and sea in the right places", () => {
    expect(terrainAt(2.35, 48.85)).not.toBe(Terrain.Ocean); // Paris
    expect(terrainAt(-87.6, 41.9)).not.toBe(Terrain.Ocean); // Chicago
    expect(terrainAt(116.4, 39.9)).not.toBe(Terrain.Ocean); // Beijing
    expect(terrainAt(-46.6, -23.5)).not.toBe(Terrain.Ocean); // São Paulo
    expect(terrainAt(-30, 30)).toBe(Terrain.Ocean); // mid-Atlantic
    expect(terrainAt(80, -10)).toBe(Terrain.Ocean); // Indian Ocean
    expect(terrainAt(-40, 72)).toBe(Terrain.Ice); // Greenland
    expect(terrainAt(-45, 66)).toBe(Terrain.Ice); // Greenland, south
  });

  it("has the major countries, with Russia largest", () => {
    const codes = new Set(earth.regions.map((r) => r.code));
    for (const code of ["840", "156", "643", "076", "356", "752", "036", "710"]) {
      expect(codes).toContain(code);
    }
    expect(earth.regions[0]!.name).toBe("Russia");
    expect(earth.regions.some((r) => r.code === "010")).toBe(false); // no Antarctica
  });

  it("gives every region a spawn tile on its own ownable land", () => {
    for (const region of earth.regions) {
      expect(isOwnableTerrain(earth.terrain[region.spawnTile]!)).toBe(true);
      expect(region.tileCount).toBeGreaterThan(0);
    }
  });

  it("plays: two nations spawn on their countries and expand", () => {
    const world = createWorld(
      {
        seed: 5,
        difficulty: "normal",
        bodies: [{ width: earth.width, height: earth.height, mapId: "earth" }],
      },
      new Map([["earth", earth]]),
    );
    const region = (code: string) => earth.regions.find((r) => r.code === code)!;
    const ids: FactionId[] = [];
    for (const code of ["250", "276"]) {
      const f = addFaction(world, region(code).name, "nation").id;
      ids.push(f);
      const spawn: Command = {
        type: "spawn",
        faction: f,
        grid: gridId(0),
        tile: region(code).spawnTile,
      };
      queueCommand(world, spawn);
    }
    runTicks(world, 1);
    for (const f of ids) {
      const tile = earth.regions.find((r) => r.name === world.factions[f]!.name)!.spawnTile;
      queueCommand(world, {
        type: "attack",
        faction: f,
        grid: gridId(0),
        tile: tile + 6,
        ratioPct: 50,
      });
    }
    runTicks(world, 100);
    for (const f of ids) expect(world.factions[f]!.tileCount).toBeGreaterThan(41);
  });
});
