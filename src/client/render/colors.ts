import type { FactionKind, Terrain } from "../../core";

/** Base color per terrain value (0xRRGGBB). Keyed by the core Terrain values. */
export const TERRAIN_COLORS: Record<Terrain, number> = {
  0: 0x05060f, // Space
  1: 0x163460, // Ocean
  2: 0x5f8c46, // Plains
  3: 0x968c5a, // Highlands
  4: 0x786e69, // Mountains
  5: 0xe1ebf0, // Ice
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
