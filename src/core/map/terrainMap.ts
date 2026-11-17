import { isOwnableTerrain } from "../grid/terrain";

/**
 * Map data for one body: its radius, terrain per tile, and named regions
 * (on Earth: countries, with a spawn tile each).
 *
 * Terrain is shipped as a small run-length-encoded binary file rather than an
 * image, so decoding is exact everywhere (browsers may color-correct images).
 */
export interface TerrainMap {
  readonly id: string;
  readonly radius: number;
  /** Terrain value per tile, laid out like DiscGrid (side = 2·radius). */
  readonly terrain: Uint8Array;
  readonly regions: readonly MapRegion[];
}

/** A named area of the map, e.g. a country on Earth. */
export interface MapRegion {
  /** Stable code, e.g. the ISO 3166 numeric country code "840". */
  readonly code: string;
  readonly name: string;
  /** A land tile inside the region, near its middle. */
  readonly spawnTile: number;
  readonly tileCount: number;
}

// File layout (little-endian):
//   "SFM1"                magic
//   uint16 radius
//   uint32 tile count     must equal (2·radius)²
//   repeated runs:        uint16 length (1–65535), uint8 terrain value
const MAGIC = [0x53, 0x46, 0x4d, 0x31]; // "SFM1"
const HEADER_BYTES = 10;
const MAX_RUN = 0xffff;

/** Encodes a terrain array (used by tools/mapgen). */
export function encodeTerrain(radius: number, terrain: Uint8Array): Uint8Array {
  const size = 4 * radius * radius;
  if (terrain.length !== size) throw new RangeError("terrain length doesn't match radius");
  const runs: number[] = [];
  for (let i = 0; i < size;) {
    const value = terrain[i]!;
    let length = 1;
    while (i + length < size && length < MAX_RUN && terrain[i + length] === value) length++;
    runs.push(length & 0xff, length >> 8, value);
    i += length;
  }
  const out = new Uint8Array(HEADER_BYTES + runs.length);
  out.set(MAGIC, 0);
  const view = new DataView(out.buffer);
  view.setUint16(4, radius, true);
  view.setUint32(6, size, true);
  out.set(runs, HEADER_BYTES);
  return out;
}

/** Decodes a terrain file. Throws on anything malformed (files come from outside). */
export function decodeTerrain(bytes: Uint8Array): { radius: number; terrain: Uint8Array } {
  if (bytes.length < HEADER_BYTES || MAGIC.some((b, i) => bytes[i] !== b)) {
    throw new Error("Not a SpaceFront terrain file");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const radius = view.getUint16(4, true);
  const size = view.getUint32(6, true);
  if (radius < 1 || size !== 4 * radius * radius) throw new Error("Bad terrain header");
  if ((bytes.length - HEADER_BYTES) % 3 !== 0) throw new Error("Truncated terrain data");

  const terrain = new Uint8Array(size);
  let at = 0;
  for (let p = HEADER_BYTES; p < bytes.length; p += 3) {
    const length = bytes[p]! | (bytes[p + 1]! << 8);
    if (length === 0 || at + length > size) throw new Error("Bad terrain run");
    terrain.fill(bytes[p + 2]!, at, at + length);
    at += length;
  }
  if (at !== size) throw new Error("Terrain data too short");
  return { radius, terrain };
}

/**
 * Builds a TerrainMap from the two map files: the terrain binary and the
 * parsed regions JSON. Validates everything, since files come from outside.
 */
export function loadTerrainMap(terrainBytes: Uint8Array, info: unknown): TerrainMap {
  const { radius, terrain } = decodeTerrain(terrainBytes);
  if (!isRecord(info) || typeof info["id"] !== "string" || !Array.isArray(info["regions"])) {
    throw new Error("Bad map info");
  }
  if (info["radius"] !== radius) throw new Error("Map info radius doesn't match terrain");
  const regions = info["regions"].map((r: unknown): MapRegion => {
    if (
      !isRecord(r) ||
      typeof r["code"] !== "string" ||
      typeof r["name"] !== "string" ||
      !Number.isInteger(r["spawnTile"]) ||
      !Number.isInteger(r["tileCount"])
    ) {
      throw new Error("Bad map region");
    }
    const spawnTile = r["spawnTile"] as number;
    if (spawnTile < 0 || spawnTile >= terrain.length || !isOwnableTerrain(terrain[spawnTile]!)) {
      throw new Error(`Region ${r["code"]} has an unusable spawn tile`);
    }
    return { code: r["code"], name: r["name"], spawnTile, tileCount: r["tileCount"] as number };
  });
  return { id: info["id"], radius, terrain, regions };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
