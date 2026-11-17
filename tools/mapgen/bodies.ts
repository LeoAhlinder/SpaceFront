/**
 * Generates the flat maps for every landable body except Earth, from the
 * terrain profiles in src/data/bodies.ts. Run with `npm run mapgen`.
 *
 * Each map: seeded noise decides water (seas, or the void between asteroids),
 * then ice (more toward the top and bottom edges), mountains and highlands,
 * each taking its share of the land by percentile, so the shares match the
 * profile exactly. These worlds have no countries yet (regions are empty).
 *
 * Outputs (committed): public/maps/<id>/terrain.bin, regions.json,
 * docs/maps/<id>-preview.png
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { BodyDef } from "../../src/data/bodies";
import { LANDABLE_BODIES } from "../../src/data/bodies";
import { Terrain } from "../../src/core/grid/terrain";
import { encodeTerrain } from "../../src/core/map/terrainMap";
import { sphereNoise } from "./noise";
import { encodePngRgb } from "./png";
import { TERRAIN_RGB } from "./terrainColors";

const root = new URL("../../", import.meta.url);

/** Stable seed per body id. */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Indexes of `candidates` with the highest `score`, `share` of them. */
function topShare(candidates: number[], score: Float64Array, share: number): Set<number> {
  const sorted = [...candidates].sort((a, b) => score[b]! - score[a]! || a - b);
  return new Set(sorted.slice(0, Math.round(candidates.length * share)));
}

function generate(body: BodyDef): Uint8Array {
  const { width, height, terrain: profile } = body.map!;
  if (!profile) throw new Error(`${body.id} has no terrain profile`);
  const size = width * height;
  const seed = seedOf(body.id);
  const terrain = new Uint8Array(size).fill(Terrain.Plains);
  const lonLat = (tile: number) => ({
    lon: (((tile % width) + 0.5) / width) * 360 - 180,
    lat: 90 - ((Math.floor(tile / width) + 0.5) / height) * 180,
  });

  // Water: lowest "elevation" noise. Islands use higher-frequency noise.
  const elevation = new Float64Array(size);
  const relief = new Float64Array(size);
  const cold = new Float64Array(size);
  for (let t = 0; t < size; t++) {
    const { lon, lat } = lonLat(t);
    elevation[t] = sphereNoise(lon, lat, seed, profile.islands ? 9 : 2.5);
    relief[t] = sphereNoise(lon, lat, seed + 1, 4);
    cold[t] = Math.abs(lat) / 90 + 0.5 * sphereNoise(lon, lat, seed + 2, 3);
  }
  const all = Array.from({ length: size }, (_, t) => t);
  const lowest = topShare(
    all,
    elevation.map((e) => -e),
    profile.waterPct / 100,
  );
  for (const t of lowest) terrain[t] = Terrain.Ocean;

  let land = all.filter((t) => terrain[t] !== Terrain.Ocean);
  const landTotal = land.length;
  const pick = (score: Float64Array, pct: number, value: number) => {
    const chosen = topShare(land, score, (pct / 100) * (landTotal / Math.max(1, land.length)));
    for (const t of chosen) terrain[t] = value;
    land = land.filter((t) => !chosen.has(t));
  };
  pick(cold, profile.icePct, Terrain.Ice);
  pick(relief, profile.mountainsPct, Terrain.Mountains);
  pick(relief, profile.highlandsPct, Terrain.Highlands);
  return terrain;
}

function preview(width: number, height: number, terrain: Uint8Array): Buffer {
  const rgb = new Uint8Array(width * height * 3);
  for (let t = 0; t < terrain.length; t++) rgb.set(TERRAIN_RGB[terrain[t]!]!, t * 3);
  return encodePngRgb(width, height, rgb);
}

for (const body of LANDABLE_BODIES) {
  if (!body.map?.terrain) continue; // Earth comes from real data (earth.ts)
  const { width, height, mapId } = body.map;
  const terrain = generate(body);
  const outDir = new URL(`public/maps/${mapId}/`, root);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(new URL("terrain.bin", outDir), encodeTerrain(width, height, terrain));
  writeFileSync(
    new URL("regions.json", outDir),
    JSON.stringify({
      id: mapId,
      width,
      height,
      source: "generated (tools/mapgen/bodies.ts)",
      regions: [],
    }),
  );
  writeFileSync(new URL(`docs/maps/${mapId}-preview.png`, root), preview(width, height, terrain));
  const land = terrain.filter((t) => t !== Terrain.Ocean).length;
  console.log(
    `${body.name}: ${width}×${height}, ${((100 * land) / terrain.length).toFixed(0)}% land`,
  );
}
