import { receiveSignal } from "../ai/nation";
import { startAttack } from "../systems/attack";
import { applyLaunch } from "../systems/ships";
import { applySpawn } from "../systems/spawn";
import { applyBuild } from "../systems/structures";
import type { System } from "../tick";
import {
  breakAlliance,
  dirKey,
  makeAlliance,
  pushEvent,
  requestAlliance,
} from "../world/diplomacy";
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
    case "build":
      applyBuild(world, command);
      return null;
    case "launch":
      return applyLaunch(world, command);
    case "ally":
      if (command.action === "request") requestAlliance(world, command.faction, command.other);
      else if (command.action === "accept") makeAlliance(world, command.faction, command.other);
      else breakAlliance(world, command.faction, command.other);
      return null;
    case "gift": {
      const from = world.factions[command.faction]!;
      const to = world.factions[command.to]!;
      from.solars -= command.solars;
      from.troops -= command.troops;
      to.solars += command.solars;
      to.troops += command.troops;
      const { solars, troops } = command;
      pushEvent(world, { kind: "gift", from: command.faction, to: command.to, solars, troops });
      return null;
    }
    case "embargo": {
      const key = dirKey(command.faction, command.other);
      if (command.on) world.diplomacy.embargoes.add(key);
      else world.diplomacy.embargoes.delete(key);
      pushEvent(world, {
        kind: "embargo",
        from: command.faction,
        to: command.other,
        on: command.on,
      });
      return null;
    }
    case "signal": {
      const { to, signal, about } = command;
      pushEvent(world, { kind: "signal", from: command.faction, to, signal, about });
      receiveSignal(world, command);
      return null;
    }
  }
}
