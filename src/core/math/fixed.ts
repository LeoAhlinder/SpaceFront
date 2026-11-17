/**
 * Fixed-point numbers in Q16.16: a plain JS integer where 65536 means 1.0.
 *
 * Every function returns an exact integer result (rounded toward −∞), so the
 * same inputs give the same output on every JS engine. Inputs must stay within
 * ±2^37 (about ±2 million in fixed-point units) to keep intermediates exact.
 */
export type Fixed = number;

export const FX_SHIFT = 16;
export const FX_ONE: Fixed = 1 << FX_SHIFT; // 65536
export const FX_HALF: Fixed = FX_ONE >> 1;

const FX_ONE_N = 65536; // as a plain number for float-safe multiplication

/** Integer → fixed. */
export function fx(n: number): Fixed {
  return n * FX_ONE_N;
}

/** Fraction `numerator / denominator` → fixed (rounded toward −∞). */
export function fxRatio(numerator: number, denominator: number): Fixed {
  return Math.floor((numerator * FX_ONE_N) / denominator);
}

/** Fixed → integer (rounded toward −∞). */
export function fxFloor(a: Fixed): number {
  return Math.floor(a / FX_ONE_N);
}

/** Fixed → nearest integer (halves round up). */
export function fxRound(a: Fixed): number {
  return Math.floor((a + FX_HALF) / FX_ONE_N);
}

/** a × b. Split into high/low 16-bit halves so no intermediate exceeds 2^53. */
export function fxMul(a: Fixed, b: Fixed): Fixed {
  const bHi = Math.floor(b / FX_ONE_N);
  const bLo = b - bHi * FX_ONE_N; // always in [0, 65536)
  return a * bHi + Math.floor((a * bLo) / FX_ONE_N);
}

/** a ÷ b (rounded toward −∞). Throws on division by zero. */
export function fxDiv(a: Fixed, b: Fixed): Fixed {
  if (b === 0) throw new RangeError("fxDiv: division by zero");
  return Math.floor((a * FX_ONE_N) / b);
}

/** √a for a ≥ 0 (rounded down). `Math.sqrt` is correctly rounded, so this is exact. */
export function fxSqrt(a: Fixed): Fixed {
  if (a < 0) throw new RangeError("fxSqrt: negative input");
  let r = Math.floor(Math.sqrt(a * FX_ONE_N));
  // Guard against the float result landing one off the true integer root.
  while (r * r > a * FX_ONE_N) r--;
  while ((r + 1) * (r + 1) <= a * FX_ONE_N) r++;
  return r;
}
