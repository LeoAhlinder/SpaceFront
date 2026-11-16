/**
 * Every tunable gameplay number lives here (docs/CODING_STANDARDS.md §6).
 * Systems read from this object; they never hard-code numbers.
 */
export const BALANCE = {
  /** Simulation ticks per second. */
  ticksPerSecond: 10,
} as const satisfies Record<string, number>;
