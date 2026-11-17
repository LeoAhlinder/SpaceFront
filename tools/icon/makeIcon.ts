/**
 * Draws the desktop app icon (desktop/build/icon.png, 1024 px) from the same
 * design as public/favicon.svg: a dark disc, the Sun, an orbit and a cyan
 * world. Rendered analytically with 4×4 supersampling. Run with `npm run icon`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { encodePngRgb } from "../mapgen/png";

const SIZE = 1024;
const SAMPLES = 4;

type Rgb = readonly [number, number, number];
const hex = (h: number): Rgb => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

const BACKGROUND = hex(0x0b0e22);
const SPACE = hex(0x05060f);
const SUN = hex(0xffc94a);
const SUN_CORE = hex(0xfff3c4);
const ORBIT = hex(0x4a5680);
const WORLD = hex(0x29d4ff);

/** Color at a point in favicon units (0–32). */
function colorAt(x: number, y: number): Rgb {
  const d = (cx: number, cy: number) => Math.hypot(x - cx, y - cy);
  if (d(26.5, 13) <= 3) return WORLD;
  const sun = d(16, 16);
  if (sun <= 2.2) return SUN_CORE;
  if (sun <= 5) return SUN;
  if (Math.abs(sun - 11) <= 0.5) return ORBIT;
  if (sun <= 15) return SPACE;
  return BACKGROUND;
}

function main(): void {
  const rgb = new Uint8Array(SIZE * SIZE * 3);
  const scale = 32 / SIZE;
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const c = colorAt(
            (px + (sx + 0.5) / SAMPLES) * scale,
            (py + (sy + 0.5) / SAMPLES) * scale,
          );
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const n = SAMPLES * SAMPLES;
      const o = (py * SIZE + px) * 3;
      rgb[o] = Math.round(r / n);
      rgb[o + 1] = Math.round(g / n);
      rgb[o + 2] = Math.round(b / n);
    }
  }
  const out = new URL("../../desktop/build/", import.meta.url);
  mkdirSync(out, { recursive: true });
  writeFileSync(new URL("icon.png", out), encodePngRgb(SIZE, SIZE, rgb));
  console.log("Wrote desktop/build/icon.png");
}

main();
