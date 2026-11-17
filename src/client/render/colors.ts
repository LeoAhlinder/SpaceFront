import type { FactionKind, Terrain } from "../../core";

export type TerrainPalette = Record<Terrain, number>;

/** Earth's terrain colors (0xRRGGBB), the base every other world starts from. */
export const TERRAIN_COLORS: TerrainPalette = {
  0: 0x05060f, // Space
  1: 0x163460, // Ocean
  2: 0x5f8c46, // Plains
  3: 0x968c5a, // Highlands
  4: 0x786e69, // Mountains
  5: 0xe1ebf0, // Ice
};

/** Per-world overrides, so Mars looks red, Io yellow, and the belt's void looks like space. */
const WORLD_PALETTES: Record<string, Partial<TerrainPalette>> = {
  mercury: { 1: 0x2a2a30, 2: 0x8a8580, 3: 0x9c968c, 4: 0x6e6a66, 5: 0xd8d8dc },
  venus: { 1: 0x5a4a20, 2: 0xc9a85a, 3: 0xd4b06a, 4: 0x9a7c44 },
  moon: { 2: 0x9a9a9a, 3: 0xb0b0b0, 4: 0x707070 },
  mars: { 1: 0x23324a, 2: 0xb5532c, 3: 0xc77a4a, 4: 0x7d3a22, 5: 0xe8e0dc },
  belt: { 1: 0x080a14, 2: 0x7a6e60, 3: 0x8f8270, 4: 0x5c544a, 5: 0xc8d0d8 },
  io: { 2: 0xd8c050, 3: 0xc89a3a, 4: 0x8a5a2a },
  europa: { 2: 0xc8b8a0, 3: 0xb09a80, 4: 0x8a7a68, 5: 0xe8f0f8 },
  ganymede: { 2: 0x8a7f72, 3: 0x9e9384, 4: 0x5f574e, 5: 0xd8dde2 },
  callisto: { 2: 0x5e564c, 3: 0x726a5e, 4: 0x403a34, 5: 0xc8ccd0 },
  titan: { 1: 0x4a3010, 2: 0xc08a3a, 3: 0xa87430, 4: 0x7a5424, 5: 0xe0d8c8 },
  enceladus: { 2: 0xd0d8e0, 3: 0xc0c8d0, 4: 0xa0a8b0, 5: 0xf4f8fc },
  triton: { 2: 0xc8a8a0, 3: 0xb89890, 4: 0x907070, 5: 0xece4e4 },
};

export function terrainPalette(bodyId: string): TerrainPalette {
  return { ...TERRAIN_COLORS, ...WORLD_PALETTES[bodyId] };
}

/** Icon color of each body in the system view. */
export const BODY_COLORS: Record<string, number> = {
  sun: 0xffc94a,
  mercury: 0x9a948c,
  venus: 0xd9b56a,
  earth: 0x3a7bd5,
  moon: 0xb0b0b0,
  mars: 0xc1502e,
  belt: 0x8a7e6e,
  jupiter: 0xd8a878,
  io: 0xe0c850,
  europa: 0xd8ccb8,
  ganymede: 0x9a9080,
  callisto: 0x6a6258,
  saturn: 0xe6cf8f,
  titan: 0xd09a40,
  enceladus: 0xeef4fa,
  uranus: 0x9fd8e0,
  neptune: 0x4f6fd8,
  triton: 0xd0b0a8,
};

const PLAYER_COLOR = 0x29d4ff;

/** A stable, distinct color per faction. The player always gets the same bright cyan. */
export function factionColor(id: number, kind: FactionKind): number {
  if (kind === "player") return PLAYER_COLOR;
  // Golden-ratio hue steps spread neighbors' colors apart; skip the player's cyan band.
  let hue = (id * 0.618033988749895) % 1;
  if (hue > 0.47 && hue < 0.56) hue = (hue + 0.12) % 1;
  const lightness = 0.5 + ((id * 7) % 3) * 0.06;
  return hslToRgb(hue, 0.62, lightness);
}

function hslToRgb(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

/** Linear mix of two 0xRRGGBB colors; t = 0 gives a, t = 1 gives b. */
export function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) =>
    Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Hex string for CSS, e.g. "#29d4ff". */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
