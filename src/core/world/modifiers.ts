import type { WorldModifiers } from "../../data/bodies";
import { modifierOf, SOLAR_SYSTEM } from "../../data/bodies";
import { KIND_CODE } from "./structureIndex";
import type { Faction, StructureKind, World } from "./world";
import { isCorona, landTiles } from "./world";

const BODIES = new Map(SOLAR_SYSTEM.map((b) => [b.id, b]));

/** A world modifier (percent, 100 = normal) for land on this grid. */
export function gridModifier(world: World, grid: number, key: keyof WorldModifiers): number {
  const id = world.gridBodies[grid];
  return modifierOf(id ? BODIES.get(id) : undefined, key);
}

/**
 * A faction's modifier averaged over its land on bodies (not the Corona):
 * owning mostly Io land gives mostly Io's income bonus. 100 for a faction
 * with no land.
 */
export function weightedModifier(
  world: World,
  faction: Faction,
  key: keyof WorldModifiers,
): number {
  const land = landTiles(world, faction);
  if (land === 0) return 100;
  let sum = 0;
  for (let g = 0; g < faction.gridTiles.length; g++) {
    const tiles = faction.gridTiles[g]!;
    if (tiles > 0 && !isCorona(world, g)) sum += tiles * gridModifier(world, g, key);
  }
  return Math.floor(sum / land);
}

/** Finished structures of a kind per faction (index = FactionId). */
export function finishedCounts(world: World, kind: StructureKind): number[] {
  const code = KIND_CODE[kind];
  return world.factions.map((f) => f.finished[code]!);
}
