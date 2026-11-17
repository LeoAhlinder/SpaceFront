import { isOwnableTerrain } from "../grid/terrain";
import type { World } from "../world/world";
import { inSpawnPhase } from "../world/world";
import { buildCost, tooCloseToStructure } from "../systems/structures";
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
      if (inSpawnPhase(world)) return "spawn phase";
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
    case "build": {
      if (!faction.hasSpawned) return "not spawned yet";
      if (command.kind !== "spaceport" && command.kind !== "habitat") return "unknown structure";
      const grid = world.grids[command.grid];
      if (!grid) return "unknown grid";
      if (!isTileIndex(command.tile, grid.size)) return "tile is not on the map";
      if (grid.owner[command.tile] !== command.faction) return "not your land";
      if (!isOwnableTerrain(grid.terrain[command.tile]!)) return "terrain can't be built on";
      if (tooCloseToStructure(world, command.grid, command.tile)) {
        return "too close to another structure";
      }
      return faction.solars < buildCost(world, command.faction, command.kind, command.grid)
        ? "not enough Solars"
        : null;
    }
    case "launch": {
      if (command.kind !== "troopLander") return "unknown ship";
      if (!isPercent(command.ratioPct)) return "ratio must be an integer 1–100";
      if (inSpawnPhase(world)) return "spawn phase";
      const port = world.structures[command.from];
      if (!port || port.kind !== "spaceport" || port.owner !== command.faction) {
        return "not your spaceport";
      }
      if (port.buildTicksLeft > 0) return "spaceport not finished";
      const grid = world.grids[command.toGrid];
      if (!grid) return "unknown grid";
      if (!isTileIndex(command.toTile, grid.size) || !grid.isUsable(command.toTile)) {
        return "tile is not on the map";
      }
      if (!isOwnableTerrain(grid.terrain[command.toTile]!)) return "can't land there";
      const crossing = port.grid !== command.toGrid;
      if (crossing && (!world.gridBodies[port.grid] || !world.gridBodies[command.toGrid])) {
        return "no route";
      }
      if (faction.troops < 1) return "no troops";
      return null;
    }
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
