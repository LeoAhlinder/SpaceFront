import { BALANCE } from "../../data/balance";
import type { BuildCommand } from "../commands/commands";
import { structureCost } from "../../data/bodies";
import type { FactionId, GridId } from "../ids";
import type { System } from "../tick";
import { gridModifier } from "../world/modifiers";
import type { Structure, StructureKind, World } from "../world/world";
import { gridOf } from "../world/world";

/** True if a structure on this map is within BALANCE.structures.minSpacing steps. */
export function tooCloseToStructure(world: World, gridId: GridId, tile: number): boolean {
  const grid = gridOf(world, gridId)!;
  for (const s of world.structures) {
    if (s.grid === gridId && grid.distance(s.tile, tile) < BALANCE.structures.minSpacing) {
      return true;
    }
  }
  return false;
}

/**
 * Solars it costs `faction` to build a `kind` on `gridId` right now. Sun
 * Base ships still in flight count as Sun Bases owned.
 */
export function buildCost(
  world: World,
  faction: FactionId,
  kind: StructureKind,
  gridId: GridId,
): number {
  let owned = 0;
  for (const s of world.structures) if (s.owner === faction && s.kind === kind) owned++;
  if (kind === "sunBase") {
    for (const ship of world.ships)
      if (ship.owner === faction && ship.kind === "sunBaseShip") owned++;
  }
  return structureCost(
    BALANCE.structures[kind].cost,
    BALANCE.structures.costStepPct,
    owned,
    gridModifier(world, gridId, "buildCostPct"),
  );
}

/** Places a structure (validated and paid for before). It works once construction finishes. */
export function applyBuild(world: World, command: BuildCommand): Structure {
  world.factions[command.faction]!.solars -= buildCost(
    world,
    command.faction,
    command.kind,
    command.grid,
  );
  const structure: Structure = {
    id: world.structures.length,
    kind: command.kind,
    owner: command.faction,
    grid: command.grid,
    tile: command.tile,
    buildTicksLeft: BALANCE.structures[command.kind].buildTicks,
    nextTradeTick: -1,
  };
  world.structures.push(structure);
  world.structureAt[command.grid]![command.tile] = structure.id;
  world.log?.structures.push(structure.id);
  return structure;
}

/** Counts down construction timers; a finished port schedules its first Freighter. */
export const constructionSystem: System = (world, ctx) => {
  for (const s of world.structures) {
    if (s.buildTicksLeft === 0) continue;
    s.buildTicksLeft -= 1;
    if (s.buildTicksLeft > 0) continue;
    if (s.kind === "spaceport" || s.kind === "sunBase") {
      s.nextTradeTick = ctx.tick + nextTradeDelay(world);
    }
    world.log?.structures.push(s.id);
  }
};

/** Ticks until a Spaceport's next Freighter. */
export function nextTradeDelay(world: World): number {
  const p = BALANCE.structures.spaceport;
  return p.tradeIntervalTicks + world.rng.nextInt(p.tradeJitterTicks + 1);
}
