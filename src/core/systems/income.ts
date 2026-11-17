import { BALANCE } from "../../data/balance";
import type { System } from "../tick";
import { finishedCounts, weightedModifier } from "../world/modifiers";
import { inSpawnPhase } from "../world/world";

/**
 * Pays Solars every tick: workers × workerIncomePermille / 1000, scaled by the
 * income modifier of the worlds the faction holds, plus a flat amount per
 * finished Habitat. Fractions are carried in solarsMilli, so nothing is lost
 * to rounding. Trade income arrives with Freighters (systems/trade).
 */
export const incomeSystem: System = (world) => {
  if (inSpawnPhase(world)) return;
  const habitats = finishedCounts(world, "habitat");
  for (const faction of world.factions) {
    if (!faction.alive || !faction.hasSpawned) continue;
    const incomePct = weightedModifier(world, faction, "incomePct");
    const fromWorkers = Math.floor(
      (faction.workers * BALANCE.economy.workerIncomePermille * incomePct) / 100,
    );
    const fromHabitats = (habitats[faction.id] ?? 0) * BALANCE.structures.habitat.income * 1000;
    const milli = faction.solarsMilli + fromWorkers + fromHabitats;
    faction.solars += Math.floor(milli / 1000);
    faction.solarsMilli = milli % 1000;
  }
};
