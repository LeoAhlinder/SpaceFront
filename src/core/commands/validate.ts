import { isOwnableTerrain } from "../grid/terrain";
import type { World } from "../world/world";
import type { Command } from "./commands";

/**
 * Checks a command against the current state. Returns null if it may be
 * applied, otherwise a short reason. Called at the moment the command applies,
 * so it sees the state as of that tick.
 */
export function validateCommand(world: World, command: Command): string | null {
  const faction = world.factions[command.faction];
  if (!faction || faction.kind === "neutral") return "unknown faction";
  if (!faction.alive) return "faction is eliminated";

  switch (command.type) {
    case "spawn": {
      if (faction.hasSpawned) return "already spawned";
      const grid = world.grids[command.grid];
      if (!grid) return "unknown grid";
      if (!isTileIndex(command.tile, grid.size) || !grid.isUsable(command.tile)) {
        return "tile is not on the body";
      }
      if (!isOwnableTerrain(grid.terrain[command.tile]!)) return "terrain can't be owned";
      if (grid.owner[command.tile] !== 0) return "tile is already owned";
      return null;
    }
    case "attack": {
      if (!faction.hasSpawned) return "not spawned yet";
      if (!isPercent(command.ratioPct)) return "ratio must be an integer 1–100";
      const grid = world.grids[command.grid];
      if (!grid) return "unknown grid";
      if (!isTileIndex(command.tile, grid.size) || !grid.isUsable(command.tile)) {
        return "tile is not on the body";
      }
      if (!isOwnableTerrain(grid.terrain[command.tile]!)) return "terrain can't be owned";
      if (grid.owner[command.tile] === command.faction) return "can't attack yourself";
      if (faction.troops < 1) return "no troops";
      return null;
    }
    case "setRatio":
      return isPercent(command.troopRatioPct) ? null : "ratio must be an integer 1–100";
    default:
      return "unknown command type"; // malformed input from outside
  }
}

function isTileIndex(tile: number, size: number): boolean {
  return Number.isInteger(tile) && tile >= 0 && tile < size;
}

function isPercent(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 100;
}
