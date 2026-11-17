import { BALANCE } from "../../data/balance";
import type { BuildCommand } from "../commands/commands";
import type { GridId } from "../ids";
import type { System } from "../tick";
import type { Structure, World } from "../world/world";

/** True if a structure on this map is within BALANCE.structures.minSpacing steps. */
export function tooCloseToStructure(world: World, gridId: GridId, tile: number): boolean {
  const grid = world.grids[gridId]!;
  for (const s of world.structures) {
    if (s.grid === gridId && grid.distance(s.tile, tile) < BALANCE.structures.minSpacing) {
      return true;
    }
  }
  return false;
}

/** Places a structure (validated before). It works once construction finishes. */
export function applyBuild(world: World, command: BuildCommand): Structure {
  const structure: Structure = {
    id: world.structures.length,
    kind: command.kind,
    owner: command.faction,
    grid: command.grid,
    tile: command.tile,
    buildTicksLeft: BALANCE.structures.spaceportBuildTicks,
  };
  world.structures.push(structure);
  world.structureAt[command.grid]![command.tile] = structure.id;
  world.log?.structures.push(structure.id);
  return structure;
}

/** Counts down construction timers. */
export const constructionSystem: System = (world) => {
  for (const s of world.structures) {
    if (s.buildTicksLeft === 0) continue;
    s.buildTicksLeft -= 1;
    if (s.buildTicksLeft === 0) world.log?.structures.push(s.id);
  }
};
