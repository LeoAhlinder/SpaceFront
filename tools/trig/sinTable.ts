/**
 * Computes the quarter-wave sine table used by src/core/math/trig.ts.
 * Build-time only: tools may use Math.sin, the simulation may not.
 */
export const QUARTER_STEPS = 1024; // angle units per quarter turn
export const TABLE_ONE = 65536; // Q16.16 one

/** sin(i/QUARTER_STEPS × π/2) in Q16.16 for i = 0..QUARTER_STEPS (inclusive). */
export function computeSinTable(): number[] {
  const table: number[] = [];
  for (let i = 0; i <= QUARTER_STEPS; i++) {
    table.push(Math.round(Math.sin((i / QUARTER_STEPS) * (Math.PI / 2)) * TABLE_ONE));
  }
  return table;
}
