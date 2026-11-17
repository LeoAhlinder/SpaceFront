import { BALANCE } from "../../data/balance";
import type { System } from "../tick";
import type { Faction } from "../world/world";
import { inSpawnPhase } from "../world/world";
import { finishedCounts, weightedModifier } from "../world/modifiers";

const P = BALANCE.population;

/** Population cap for a faction with `tiles` tiles and `habitats` finished Habitats. */
export function populationCap(tiles: number, habitats = 0): number {
  return P.capBase + tiles * P.capPerTile + habitats * BALANCE.structures.habitat.popCap;
}

/**
 * Grows each faction's population toward its cap (logistic growth: fast when
 * far below the cap, slowing near it; above the cap it slowly decays), splits the growth
 * between troops and workers, and slowly moves people between the two toward
 * the faction's troop ratio.
 */
export const populationSystem: System = (world) => {
  if (inSpawnPhase(world)) return;
  const habitats = finishedCounts(world, "habitat");
  for (const faction of world.factions) {
    if (!faction.alive || !faction.hasSpawned) continue;
    grow(faction, habitats[faction.id] ?? 0, weightedModifier(world, faction, "growthPct"));
    rebalance(faction);
  }
};

function grow(faction: Faction, habitats: number, growthPct: number): void {
  const pop = faction.troops + faction.workers;
  const cap = populationCap(faction.tileCount, habitats);
  let growth: number;
  if (pop <= cap) {
    const rate = P.growthBase + Math.floor((pop * P.growthPermille) / 1000);
    growth = Math.floor((((rate * (cap - pop)) / cap) * growthPct) / 100);
  } else {
    // Gentle decay: a big surplus (e.g. after losing land) drains over time.
    growth = -Math.max(1, Math.floor(((pop - cap) * P.overCapDecayPermille) / 1000));
  }
  if (growth === 0) return;
  const toTroops = Math.floor((growth * faction.troopRatioPct) / 100);
  faction.troops = Math.max(0, faction.troops + toTroops);
  faction.workers = Math.max(0, faction.workers + growth - toTroops);
}

function rebalance(faction: Faction): void {
  const pop = faction.troops + faction.workers;
  if (pop === 0) return;
  const target = Math.floor((pop * faction.troopRatioPct) / 100);
  const maxShift = Math.max(1, Math.floor((pop * P.rebalancePermille) / 1000));
  const shift = Math.max(-maxShift, Math.min(maxShift, target - faction.troops));
  faction.troops += shift;
  faction.workers -= shift;
}
