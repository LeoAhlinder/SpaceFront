import type { World } from "./world/world";

/** Per-tick data handed to every system. Grows the delta collector in M0.6. */
export interface TickContext {
  /** The tick being simulated (equal to world.tick while systems run). */
  readonly tick: number;
}

/** A system does one job each tick. It reads and writes only `world`. */
export type System = (world: World, ctx: TickContext) => void;

/**
 * The systems in the order they run each tick (ARCHITECTURE.md §4.1).
 * Entries are added as their milestones land:
 * applyCommands → orbit → population → income → attack → ships → combat →
 * construction → corona → ai → victory.
 */
export const SYSTEMS: readonly System[] = [];

/** Runs one tick: every system in order, then advances the tick counter. */
export function runTick(world: World, systems: readonly System[] = SYSTEMS): void {
  const ctx: TickContext = { tick: world.tick };
  for (const system of systems) system(world, ctx);
  world.tick += 1;
}

/** Runs `count` ticks. */
export function runTicks(world: World, count: number, systems?: readonly System[]): void {
  for (let i = 0; i < count; i++) runTick(world, systems);
}
