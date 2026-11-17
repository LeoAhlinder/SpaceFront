/**
 * Builds the Earth map from Natural Earth country shapes (public domain, via
 * the world-atlas package). Run with `npm run mapgen` (optional arg: radius).
 *
 * Steps:
 *   1. Rasterize every country into a 0.1° longitude/latitude grid.
 *   2. For each disc tile, find its longitude/latitude with the inverse
 *      equal-area projection and look up the country there (or ocean).
 *   3. Terrain: ocean / ice (Antarctica, Greenland, far north) / land. Land is
 *      split into plains, highlands and mountains with seeded noise. This relief
 *      is invented, not real elevation (a possible upgrade for later).
 *   4. One region per country with a spawn tile near its middle.
 *
 * Outputs (committed):
 *   public/maps/earth/terrain.bin    run-length-encoded terrain (core format)
 *   public/maps/earth/regions.json   map info and countries
 *   docs/maps/earth-preview.png      picture for humans
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { DiscGrid } from "../../src/core/grid/discGrid";
import { Terrain } from "../../src/core/grid/terrain";
import { gridId } from "../../src/core/ids";
import type { MapRegion } from "../../src/core/map/terrainMap";
import { encodeTerrain } from "../../src/core/map/terrainMap";
import { sphereNoise } from "./noise";
import { encodePngRgb } from "./png";
import { tileCenter, unproject } from "./projection";

const RADIUS = Number(process.argv[2] ?? 300);
const RES = 10; // raster cells per degree
const RASTER_W = 360 * RES;
const RASTER_H = 180 * RES;
const NOISE_SEED = 20261117;
const MOUNTAIN_SHARE = 0.07;
const HIGHLAND_SHARE = 0.18;
const ICE_LATITUDE = 75;
const ANTARCTICA = "010";
const GREENLAND = "304";

const root = new URL("../../", import.meta.url);
const require = createRequire(import.meta.url);

type CountryProps = { name: string };
type Country = { code: string; name: string; geometry: Polygon | MultiPolygon };

function loadCountries(): Country[] {
  const path = require.resolve("world-atlas/countries-50m.json");
  const topo = JSON.parse(readFileSync(path, "utf8")) as Topology<{
    countries: GeometryCollection<CountryProps>;
  }>;
  const collection = feature(topo, topo.objects.countries) as FeatureCollection<
    Polygon | MultiPolygon,
    CountryProps
  >;
  return collection.features.map((f) => ({
    code: f.id === undefined ? slug(f.properties.name) : String(f.id),
    name: f.properties.name,
    geometry: f.geometry,
  }));
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Even-odd scanline fill of one country into the raster (value = index + 1). */
function rasterize(raster: Uint16Array, country: Country, value: number): number {
  const polygons =
    country.geometry.type === "Polygon"
      ? [country.geometry.coordinates]
      : country.geometry.coordinates;
  const edges: number[] = [];
  let poleRings = 0;
  let minLat = 90;
  let maxLat = -90;
  // Rings that cross the date line are "unwrapped" so longitudes stay continuous
  // (e.g. 179 → 181 instead of 179 → -179); spans past ±180 wrap when filled.
  const addRing = (ring: Position[]) => {
    const lons: number[] = [];
    const lats: number[] = [];
    let offset = 0;
    for (let i = 0; i < ring.length; i++) {
      const [rawLon, lat] = ring[i] as [number, number];
      if (i > 0) {
        const step = rawLon + offset - lons[i - 1]!;
        if (step > 180) offset -= 360;
        else if (step < -180) offset += 360;
      }
      lons.push(rawLon + offset);
      lats.push(lat);
    }
    // A ring that circles a pole (Antarctica) doesn't close after unwrapping:
    // close it by running along the pole, which makes it fill all longitudes.
    const first = lons[0]!;
    const last = lons[lons.length - 1]!;
    if (Math.abs(last - first) > 1e-9) {
      const pole = lats.reduce((sum, l) => sum + l, 0) < 0 ? -90 : 90;
      lons.push(last, first, first);
      lats.push(pole, pole, lats[0]!);
      poleRings++;
    }
    for (let i = 0; i + 1 < lons.length; i++) {
      edges.push(lons[i]!, lats[i]!, lons[i + 1]!, lats[i + 1]!);
      minLat = Math.min(minLat, lats[i]!, lats[i + 1]!);
      maxLat = Math.max(maxLat, lats[i]!, lats[i + 1]!);
    }
  };
  for (const polygon of polygons) for (const ring of polygon) addRing(ring);

  const rowStart = Math.max(0, Math.floor((90 - maxLat) * RES));
  const rowEnd = Math.min(RASTER_H - 1, Math.ceil((90 - minLat) * RES));
  const xs: number[] = [];
  for (let row = rowStart; row <= rowEnd; row++) {
    const lat = 90 - (row + 0.5) / RES;
    xs.length = 0;
    for (let e = 0; e < edges.length; e += 4) {
      const lon1 = edges[e]!;
      const lat1 = edges[e + 1]!;
      const lon2 = edges[e + 2]!;
      const lat2 = edges[e + 3]!;
      if (lat1 <= lat !== lat2 <= lat) {
        xs.push(lon1 + ((lat - lat1) * (lon2 - lon1)) / (lat2 - lat1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.ceil((xs[k]! + 180) * RES - 0.5);
      const c1 = Math.floor((xs[k + 1]! + 180) * RES - 0.5);
      for (let c = c0; c <= c1; c++) {
        raster[row * RASTER_W + (((c % RASTER_W) + RASTER_W) % RASTER_W)] = value;
      }
    }
  }
  return poleRings;
}

function lookup(raster: Uint16Array, lon: number, lat: number): number {
  const col = Math.min(RASTER_W - 1, Math.max(0, Math.floor((lon + 180) * RES)));
  const row = Math.min(RASTER_H - 1, Math.max(0, Math.floor((90 - lat) * RES)));
  return raster[row * RASTER_W + col]!;
}

function main(): void {
  const countries = loadCountries();
  const raster = new Uint16Array(RASTER_W * RASTER_H);
  let poleRings = 0;
  countries.forEach((c, i) => (poleRings += rasterize(raster, c, i + 1)));

  const grid = new DiscGrid(gridId(0), RADIUS);
  const { side, size, terrain } = grid;
  const countryOf = new Int32Array(size).fill(-1);
  const noise = new Float64Array(size).fill(-1);
  const landNoise: number[] = [];

  for (let tile = 0; tile < size; tile++) {
    if (!grid.isUsable(tile)) continue;
    const { u, v } = tileCenter(grid.x(tile), grid.y(tile), side);
    const geo = unproject(u, v)!;
    const ci = lookup(raster, geo.lon, geo.lat) - 1;
    if (ci < 0) {
      terrain[tile] = Terrain.Ocean;
      continue;
    }
    countryOf[tile] = ci;
    const code = countries[ci]!.code;
    if (code === ANTARCTICA || code === GREENLAND || Math.abs(geo.lat) >= ICE_LATITUDE) {
      terrain[tile] = Terrain.Ice;
      continue;
    }
    const n = sphereNoise(geo.lon, geo.lat, NOISE_SEED);
    noise[tile] = n;
    landNoise.push(n);
  }

  // Invented relief: the highest-noise land becomes mountains, the next band highlands.
  landNoise.sort((a, b) => b - a);
  const mountainAbove = landNoise[Math.floor(landNoise.length * MOUNTAIN_SHARE)] ?? 1;
  const highlandAbove =
    landNoise[Math.floor(landNoise.length * (MOUNTAIN_SHARE + HIGHLAND_SHARE))] ?? 1;
  for (let tile = 0; tile < size; tile++) {
    const n = noise[tile]!;
    if (n < 0) continue;
    terrain[tile] =
      n > mountainAbove
        ? Terrain.Mountains
        : n > highlandAbove
          ? Terrain.Highlands
          : Terrain.Plains;
  }

  const regions = buildRegions(countries, grid, countryOf);

  const outDir = new URL("public/maps/earth/", root);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(new URL("terrain.bin", outDir), encodeTerrain(RADIUS, terrain));
  writeFileSync(
    new URL("regions.json", outDir),
    JSON.stringify({
      id: "earth",
      radius: RADIUS,
      source: "Natural Earth 1:50m countries (public domain) via world-atlas 2.0.2",
      regions,
    }),
  );
  const docsDir = new URL("docs/maps/", root);
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(new URL("earth-preview.png", docsDir), preview(grid, countryOf));

  const counts = new Map<number, number>();
  for (let t = 0; t < size; t++) counts.set(terrain[t]!, (counts.get(terrain[t]!) ?? 0) + 1);
  const name = Object.fromEntries(Object.entries(Terrain).map(([k, v]) => [v, k]));
  console.log(`Earth: radius ${RADIUS}, ${grid.usableCount} usable tiles`);
  for (const [t, n] of [...counts].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${name[t]}: ${n} (${((100 * n) / grid.usableCount).toFixed(1)}%)`);
  }
  console.log(`  ${regions.length} regions, ${poleRings} pole-circling rings closed`);
}

function buildRegions(countries: Country[], grid: DiscGrid, countryOf: Int32Array): MapRegion[] {
  const sumX = new Float64Array(countries.length);
  const sumY = new Float64Array(countries.length);
  const count = new Int32Array(countries.length);
  for (let tile = 0; tile < grid.size; tile++) {
    const ci = countryOf[tile]!;
    if (ci < 0) continue;
    sumX[ci] = sumX[ci]! + grid.x(tile);
    sumY[ci] = sumY[ci]! + grid.y(tile);
    count[ci]! += 1;
  }
  const best = new Int32Array(countries.length).fill(-1);
  const bestDist = new Float64Array(countries.length).fill(Infinity);
  for (let tile = 0; tile < grid.size; tile++) {
    const ci = countryOf[tile]!;
    if (ci < 0) continue;
    const dx = grid.x(tile) - sumX[ci]! / count[ci]!;
    const dy = grid.y(tile) - sumY[ci]! / count[ci]!;
    const d = dx * dx + dy * dy;
    if (d < bestDist[ci]!) {
      bestDist[ci] = d;
      best[ci] = tile;
    }
  }
  const regions: MapRegion[] = [];
  countries.forEach((c, ci) => {
    if (count[ci] === 0 || c.code === ANTARCTICA) return;
    regions.push({ code: c.code, name: c.name, spawnTile: best[ci]!, tileCount: count[ci]! });
  });
  return regions.sort((a, b) => b.tileCount - a.tileCount || a.code.localeCompare(b.code));
}

const COLORS: Record<number, [number, number, number]> = {
  [Terrain.Space]: [5, 6, 15],
  [Terrain.Ocean]: [22, 52, 96],
  [Terrain.Plains]: [96, 140, 70],
  [Terrain.Highlands]: [150, 140, 90],
  [Terrain.Mountains]: [120, 110, 105],
  [Terrain.Ice]: [225, 235, 240],
};

function preview(grid: DiscGrid, countryOf: Int32Array): Buffer {
  const { side } = grid;
  const rgb = new Uint8Array(side * side * 3);
  for (let tile = 0; tile < grid.size; tile++) {
    const [r, g, b] = COLORS[grid.terrain[tile]!]!;
    const x = grid.x(tile);
    const ci = countryOf[tile]!;
    // Darken tiles on a country border (right or lower neighbor in another country).
    const border =
      ci >= 0 &&
      ((x + 1 < side && countryOf[tile + 1]! >= 0 && countryOf[tile + 1] !== ci) ||
        (tile + side < grid.size && countryOf[tile + side]! >= 0 && countryOf[tile + side] !== ci));
    const k = border ? 0.55 : 1;
    rgb.set([r * k, g * k, b * k], tile * 3);
  }
  return encodePngRgb(side, side, rgb);
}

main();
