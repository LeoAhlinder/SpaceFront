import { describe, expect, it } from "vitest";
import { DiscGrid } from "../grid/discGrid";
import { Terrain } from "../grid/terrain";
import { gridId } from "../ids";
import { Rng } from "../math/rng";
import { createWorld } from "../world/world";
import { decodeTerrain, encodeTerrain, loadTerrainMap } from "./terrainMap";

/** A small disc with random land/ocean terrain and its outline intact. */
function randomTerrain(radius: number, seed = 1): Uint8Array {
  const grid = new DiscGrid(gridId(0), radius);
  const rng = Rng.fromSeed(seed);
  for (let i = 0; i < grid.size; i++) {
    if (grid.isUsable(i)) grid.terrain[i] = rng.chance(1, 3) ? Terrain.Ocean : Terrain.Plains;
  }
  return grid.terrain;
}

describe("terrain codec", () => {
  it("round-trips terrain exactly", () => {
    const terrain = randomTerrain(30);
    const decoded = decodeTerrain(encodeTerrain(30, terrain));
    expect(decoded.radius).toBe(30);
    expect(decoded.terrain).toEqual(terrain);
  });

  it("handles runs longer than 65535 tiles", () => {
    const radius = 200; // 160,000 tiles; the space rows alone form long runs
    const terrain = new Uint8Array(4 * radius * radius); // all Space
    expect(decodeTerrain(encodeTerrain(radius, terrain)).terrain).toEqual(terrain);
  });

  it("rejects malformed files", () => {
    const good = encodeTerrain(10, randomTerrain(10));
    expect(() => decodeTerrain(new Uint8Array([1, 2, 3]))).toThrow("Not a SpaceFront terrain file");
    expect(() => decodeTerrain(good.slice(0, good.length - 1))).toThrow();
    expect(() => decodeTerrain(good.slice(0, good.length - 3))).toThrow("too short");
    const badHeader = good.slice();
    badHeader[6] = 7; // tile count no longer matches the radius
    expect(() => decodeTerrain(badHeader)).toThrow("Bad terrain header");
  });
});

describe("loadTerrainMap", () => {
  const terrain = randomTerrain(10);
  const bytes = encodeTerrain(10, terrain);
  const land = terrain.indexOf(Terrain.Plains);
  const ocean = terrain.indexOf(Terrain.Ocean);
  const info = (regions: unknown[]) => ({ id: "test", radius: 10, regions });

  it("builds a map from valid files", () => {
    const map = loadTerrainMap(
      bytes,
      info([{ code: "1", name: "Land", spawnTile: land, tileCount: 5 }]),
    );
    expect(map.id).toBe("test");
    expect(map.regions[0]).toEqual({ code: "1", name: "Land", spawnTile: land, tileCount: 5 });
  });

  it("rejects bad info, mismatched radius and unusable spawn tiles", () => {
    expect(() => loadTerrainMap(bytes, null)).toThrow("Bad map info");
    expect(() => loadTerrainMap(bytes, { ...info([]), radius: 11 })).toThrow("radius");
    expect(() => loadTerrainMap(bytes, info([{ code: 1 }]))).toThrow("Bad map region");
    expect(() =>
      loadTerrainMap(bytes, info([{ code: "x", name: "Sea", spawnTile: ocean, tileCount: 1 }])),
    ).toThrow("unusable spawn tile");
  });
});

describe("createWorld with a map", () => {
  const terrain = randomTerrain(12);
  const map = { id: "test", radius: 12, terrain, regions: [] };
  const config = (radius: number) => ({
    seed: 1,
    difficulty: "normal" as const,
    bodies: [{ radius, mapId: "test" }],
  });

  it("copies the map terrain into the grid", () => {
    const world = createWorld(config(12), new Map([["test", map]]));
    expect(world.grids[0]!.terrain).toEqual(terrain);
  });

  it("refuses a missing map, a radius mismatch or a wrong outline", () => {
    expect(() => createWorld(config(12))).toThrow("was not provided");
    expect(() => createWorld(config(13), new Map([["test", map]]))).toThrow("radius");
    const broken = terrain.slice();
    broken[0] = Terrain.Plains; // a corner tile is space on a disc
    expect(() => new DiscGrid(gridId(0), 12).applyTerrain(broken)).toThrow("outline");
  });
});
