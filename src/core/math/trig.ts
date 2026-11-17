import type { Fixed } from "./fixed";
import { SIN_QUARTER_TABLE } from "./trigTable";

/**
 * Deterministic trig via a lookup table (Math.sin/cos may differ between engines).
 *
 * Angles are integers in "angle units": ANGLE_FULL units make one full turn,
 * counter-clockwise, starting at +x. Any integer is accepted and wraps around.
 */
export const ANGLE_FULL = 4096;
export const ANGLE_QUARTER = ANGLE_FULL / 4;
export const ANGLE_HALF = ANGLE_FULL / 2;

const QUARTER_MASK = ANGLE_QUARTER - 1;
const FULL_MASK = ANGLE_FULL - 1;

/** sin(angle) in Q16.16. */
export function fxSin(angle: number): Fixed {
  const a = angle & FULL_MASK;
  const i = a & QUARTER_MASK;
  switch (a >> 10) {
    case 0:
      return SIN_QUARTER_TABLE[i]!;
    case 1:
      return SIN_QUARTER_TABLE[ANGLE_QUARTER - i]!;
    // `0 - x` instead of `-x` so a zero entry gives +0, never -0.
    case 2:
      return 0 - SIN_QUARTER_TABLE[i]!;
    default:
      return 0 - SIN_QUARTER_TABLE[ANGLE_QUARTER - i]!;
  }
}

/** cos(angle) in Q16.16. */
export function fxCos(angle: number): Fixed {
  return fxSin(angle + ANGLE_QUARTER);
}
