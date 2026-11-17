import { startAttack } from "../systems/attack";
import { applySpawn } from "../systems/spawn";
import type { System } from "../tick";
import type { World } from "../world/world";
import type { Command } from "./commands";
import { validateCommand } from "./validate";

/**
 * Schedules a command. By default it applies at the start of the next tick.
 * In multiplayer (M6) the server picks the tick instead.
 */
export function queueCommand(world: World, command: Command, tick = world.tick): void {
  if (!Number.isInteger(tick) || tick < world.tick) {
    throw new RangeError(`Can't queue a command for past tick ${tick} (now ${world.tick})`);
  }
  world.pending.push(tick, command);
}

/** First system of every tick: validates and applies this tick's commands in order. */
export const applyCommands: System = (world, ctx) => {
  for (const command of world.pending.take(ctx.tick)) {
    const reason = validateCommand(world, command) ?? applyCommand(world, command);
    if (reason !== null) ctx.rejected.push({ command, reason });
  }
};

/** Applies a validated command. May still reject it (returns a reason). */
function applyCommand(world: World, command: Command): string | null {
  switch (command.type) {
    case "spawn":
      applySpawn(world, command);
      return null;
    case "attack":
      return startAttack(world, command.faction, command.grid, command.tile, command.ratioPct);
    case "setRatio":
      world.factions[command.faction]!.troopRatioPct = command.troopRatioPct;
      return null;
  }
}
