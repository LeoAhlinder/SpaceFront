import { BALANCE } from "../../data/balance";
import type { BuildCommand } from "../commands/commands";
import { structureCost } from "../../data/bodies";
import { tilesWithin } from "../grid/area";
import type { FactionId, GridId } from "../ids";
import type { System } from "../tick";
import { gridModifier } from "../world/modifiers";
import { addStructure, KIND_CODE, markFinished } from "../world/structureIndex";
import type { Structure, StructureKind, World } from "../world/world";
import { gridOf } from "../world/world";

/** Scratch list for area lookups; overwritten on every use. */
const area: number[] = [];

/**
 * True if a structure on this map is within BALANCE.structures.minSpacing
 * steps. Looks only at the tiles around `tile`, not at every structure.
 */
export function tooCloseToStructure(world: World, gridId: GridId, tile: number): boolean {
  const grid = gridOf(world, gridId)!;
  const at = world.structureAt[gridId]!;
  const n = tilesWithin(grid, tile, BALANCE.structures.minSpacing - 1, area);
  for (let i = 0; i < n; i++) if (at[area[i]!]! >= 0) return true;
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
  let owned = world.factions[faction]!.owned[KIND_CODE[kind]]!;
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

/** Starting hit points of a structure kind (only siphons can be shot at). */
export function structureHp(kind: StructureKind): number {
  return kind === "solarSiphon" ? BALANCE.hp.solarSiphon : 1;
}

/** Places a structure (validated and paid for before). It works once construction finishes. */
export function applyBuild(world: World, command: BuildCommand): Structure {
  const faction = world.factions[command.faction]!;
  faction.solars -= buildCost(world, command.faction, command.kind, command.grid);
  const structure: Structure = {
    id: world.structures.length,
    kind: command.kind,
    owner: command.faction,
    grid: command.grid,
    tile: command.tile,
    buildTicksLeft: Math.max(
      1,
      Math.floor((BALANCE.structures[command.kind].buildTicks * faction.bonus.buildTimePct) / 100),
    ),
    nextTradeTick: -1,
    readyTick: 0,
    hp: structureHp(command.kind),
    destroyed: false,
  };
  addStructure(world, structure);
  return structure;
}

/** Counts down construction timers; a finished port schedules its first Freighter. */
export const constructionSystem: System = (world, ctx) => {
  for (const s of world.structures) {
    if (s.buildTicksLeft === 0) continue;
    s.buildTicksLeft -= 1;
    if (s.buildTicksLeft > 0) continue;
    markFinished(world, s);
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
