import type { Command } from "./commands";

/**
 * Commands waiting for the tick they apply on. Commands for the same tick keep
 * the order they were added in, which is part of the deterministic input.
 */
export class CommandQueue {
  private readonly byTick = new Map<number, Command[]>();

  /** Schedules `command` to apply at the start of `tick`. */
  push(tick: number, command: Command): void {
    const list = this.byTick.get(tick);
    if (list) list.push(command);
    else this.byTick.set(tick, [command]);
  }

  /** Removes and returns the commands for `tick` (empty if none). */
  take(tick: number): Command[] {
    const list = this.byTick.get(tick);
    if (!list) return [];
    this.byTick.delete(tick);
    return list;
  }

  /** Number of commands still waiting, for tests and debugging. */
  get size(): number {
    let n = 0;
    for (const list of this.byTick.values()) n += list.length;
    return n;
  }
}
