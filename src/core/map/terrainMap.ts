import { isOwnableTerrain } from "../grid/terrain";

/**
 * Map data for one body: its size, terrain per tile, and named regions
 * (on Earth: countries, with a spawn tile each).
 *
 * Terrain is shipped as a small run-length-encoded binary file rather than an
 * image, so decoding is exact everywhere (browsers may color-correct images).
 */
export interface TerrainMap {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** Terrain value per tile, laid out like RectGrid (index = y × width + x). */
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
//   "SFM2"                magic
//   uint16 width
//   uint16 height
//   uint32 tile count     must equal width × height
//   repeated runs:        uint16 length (1–65535), uint8 terrain value
const MAGIC = [0x53, 0x46, 0x4d, 0x32]; // "SFM2"
const HEADER_BYTES = 12;
const MAX_RUN = 0xffff;

/** Encodes a terrain array (used by tools/mapgen). */
export function encodeTerrain(width: number, height: number, terrain: Uint8Array): Uint8Array {
  const size = width * height;
  if (terrain.length !== size) throw new RangeError("terrain length doesn't match size");
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
  view.setUint16(4, width, true);
  view.setUint16(6, height, true);
  view.setUint32(8, size, true);
  out.set(runs, HEADER_BYTES);
  return out;
}

/** Decodes a terrain file. Throws on anything malformed (files come from outside). */
export function decodeTerrain(bytes: Uint8Array): {
  width: number;
  height: number;
  terrain: Uint8Array;
} {
  if (bytes.length < HEADER_BYTES || MAGIC.some((b, i) => bytes[i] !== b)) {
    throw new Error("Not a SpaceFront terrain file");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(4, true);
  const height = view.getUint16(6, true);
  const size = view.getUint32(8, true);
  if (width < 1 || height < 1 || size !== width * height) throw new Error("Bad terrain header");
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
  return { width, height, terrain };
}

/**
 * Builds a TerrainMap from the two map files: the terrain binary and the
 * parsed regions JSON. Validates everything, since files come from outside.
 */
export function loadTerrainMap(terrainBytes: Uint8Array, info: unknown): TerrainMap {
  const { width, height, terrain } = decodeTerrain(terrainBytes);
  if (!isRecord(info) || typeof info["id"] !== "string" || !Array.isArray(info["regions"])) {
    throw new Error("Bad map info");
  }
  if (info["width"] !== width || info["height"] !== height) {
    throw new Error("Map info size doesn't match terrain");
  }
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
  return { id: info["id"], width, height, terrain, regions };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
