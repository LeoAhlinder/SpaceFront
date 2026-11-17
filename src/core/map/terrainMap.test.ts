import { describe, expect, it } from "vitest";
import { Terrain } from "../grid/terrain";
import { Rng } from "../math/rng";
import { createWorld } from "../world/world";
import { decodeTerrain, encodeTerrain, loadTerrainMap } from "./terrainMap";

/** Random land/ocean terrain for a width × height map. */
function randomTerrain(width: number, height: number, seed = 1): Uint8Array {
  const rng = Rng.fromSeed(seed);
  const terrain = new Uint8Array(width * height);
  for (let i = 0; i < terrain.length; i++) {
    terrain[i] = rng.chance(1, 3) ? Terrain.Ocean : Terrain.Plains;
  }
  return terrain;
}

describe("terrain codec", () => {
  it("round-trips terrain exactly", () => {
    const terrain = randomTerrain(40, 25);
    const decoded = decodeTerrain(encodeTerrain(40, 25, terrain));
    expect(decoded.width).toBe(40);
    expect(decoded.height).toBe(25);
    expect(decoded.terrain).toEqual(terrain);
  });

  it("handles runs longer than 65535 tiles", () => {
    const terrain = new Uint8Array(400 * 300).fill(Terrain.Ocean); // one 120,000-tile run
    expect(decodeTerrain(encodeTerrain(400, 300, terrain)).terrain).toEqual(terrain);
  });

  it("rejects malformed files", () => {
    const good = encodeTerrain(10, 6, randomTerrain(10, 6));
    expect(() => decodeTerrain(new Uint8Array([1, 2, 3]))).toThrow("Not a SpaceFront terrain file");
    expect(() => decodeTerrain(good.slice(0, good.length - 1))).toThrow();
    expect(() => decodeTerrain(good.slice(0, good.length - 3))).toThrow("too short");
    const badHeader = good.slice();
    badHeader[8] = 7; // tile count no longer matches width × height
    expect(() => decodeTerrain(badHeader)).toThrow("Bad terrain header");
  });
});

describe("loadTerrainMap", () => {
  const terrain = randomTerrain(10, 6);
  const bytes = encodeTerrain(10, 6, terrain);
  const land = terrain.indexOf(Terrain.Plains);
  const ocean = terrain.indexOf(Terrain.Ocean);
  const info = (regions: unknown[]) => ({ id: "test", width: 10, height: 6, regions });

  it("builds a map from valid files", () => {
    const map = loadTerrainMap(
      bytes,
      info([{ code: "1", name: "Land", spawnTile: land, tileCount: 5 }]),
    );
    expect(map).toMatchObject({ id: "test", width: 10, height: 6 });
    expect(map.regions[0]).toEqual({ code: "1", name: "Land", spawnTile: land, tileCount: 5 });
  });

  it("rejects bad info, mismatched size and unusable spawn tiles", () => {
    expect(() => loadTerrainMap(bytes, null)).toThrow("Bad map info");
    expect(() => loadTerrainMap(bytes, { ...info([]), height: 7 })).toThrow("size");
    expect(() => loadTerrainMap(bytes, info([{ code: 1 }]))).toThrow("Bad map region");
    expect(() =>
      loadTerrainMap(bytes, info([{ code: "x", name: "Sea", spawnTile: ocean, tileCount: 1 }])),
    ).toThrow("unusable spawn tile");
  });
});

describe("createWorld with a map", () => {
  const terrain = randomTerrain(24, 16);
  const map = { id: "test", width: 24, height: 16, terrain, regions: [] };
  const config = (width: number, height: number) => ({
    seed: 1,
    difficulty: "normal" as const,
    bodies: [{ width, height, mapId: "test" }],
  });

  it("copies the map terrain into the grid", () => {
    const world = createWorld(config(24, 16), new Map([["test", map]]));
    expect(world.grids[0]!.terrain).toEqual(terrain);
  });

  it("refuses a missing map or a size mismatch", () => {
    expect(() => createWorld(config(24, 16))).toThrow("was not provided");
    expect(() => createWorld(config(24, 17), new Map([["test", map]]))).toThrow("24×16");
  });
});
