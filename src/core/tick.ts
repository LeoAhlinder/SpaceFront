import { aiSystem } from "./ai/bot";
import { applyCommands } from "./commands/applyCommands";
import type { Command } from "./commands/commands";
import { attackSystem } from "./systems/attack";
import { populationSystem } from "./systems/population";
import type { World } from "./world/world";

/** A command that was dropped this tick, and why (logged in debug builds). */
export interface RejectedCommand {
  readonly command: Command;
  readonly reason: string;
}

/** Per-tick data handed to every system. Grows the delta collector in M0.6. */
export interface TickContext {
  /** The tick being simulated (equal to world.tick while systems run). */
  readonly tick: number;
  readonly rejected: RejectedCommand[];
}

/** A system does one job each tick. It reads and writes only `world`. */
export type System = (world: World, ctx: TickContext) => void;

/**
 * The systems in the order they run each tick (ARCHITECTURE.md §4.1).
 * Still to come: orbit, income, ships, combat, construction, corona, victory.
 */
export const SYSTEMS: readonly System[] = [applyCommands, populationSystem, attackSystem, aiSystem];

/** Runs one tick: every system in order, then advances the tick counter. */
export function runTick(world: World, systems: readonly System[] = SYSTEMS): TickContext {
  const ctx: TickContext = { tick: world.tick, rejected: [] };
  for (const system of systems) system(world, ctx);
  world.tick += 1;
  return ctx;
}

/** Runs `count` ticks. */
export function runTicks(world: World, count: number, systems?: readonly System[]): void {
  for (let i = 0; i < count; i++) runTick(world, systems);
}
