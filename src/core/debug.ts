/** Thrown when a "can't happen" invariant in the simulation is broken. */
export class AssertionError extends Error {
  override name = "AssertionError";
}

/**
 * Checks an invariant. For conditions that indicate a bug, not for validating
 * input (commands and saves are validated at the edges instead).
 */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AssertionError(message);
}
