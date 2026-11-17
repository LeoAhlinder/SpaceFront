import { BALANCE } from "../../data/balance";
import { NEUTRAL } from "../ids";
import type { World } from "../world/world";
import type { System } from "../tick";
import { finishedCounts, weightedModifier } from "../world/modifiers";
import { inSpawnPhase } from "../world/world";
import { siphonIncomeMilli } from "./corona";

/**
 * Pays Solars every tick: workers × workerIncomePermille / 1000, scaled by the
 * income modifier of the worlds the faction holds, plus a flat amount per
 * finished Habitat, plus the output of its finished Solar Siphons (by band,
 * with diminishing returns). Fractions are carried in solarsMilli, so nothing
 * is lost to rounding. Trade income arrives with Freighters (systems/trade).
 */
export const incomeSystem: System = (world) => {
  if (inSpawnPhase(world)) return;
  const habitats = finishedCounts(world, "habitat");
  const siphons = siphonsPerBand(world);
  for (const faction of world.factions) {
    if (!faction.alive || !faction.hasSpawned) continue;
    const incomePct = weightedModifier(world, faction, "incomePct");
    const fromWorkers = Math.floor(
      (faction.workers * BALANCE.economy.workerIncomePermille * incomePct) / 100,
    );
    const fromHabitats = (habitats[faction.id] ?? 0) * BALANCE.structures.habitat.income * 1000;
    const fromSiphons = siphons ? siphonIncomeMilli(siphons[faction.id]!) : 0;
    const milli = faction.solarsMilli + fromWorkers + fromHabitats + fromSiphons;
    faction.solars += Math.floor(milli / 1000);
    faction.solarsMilli = milli % 1000;
  }
};

/** Finished siphons per faction per band, or null if there are none at all. */
function siphonsPerBand(world: World): number[][] | null {
  const corona = world.corona;
  if (!corona) return null;
  let counts: number[][] | null = null;
  for (const s of world.structures) {
    if (s.kind !== "solarSiphon" || s.buildTicksLeft > 0 || s.owner === NEUTRAL) continue;
    counts ??= world.factions.map(() => [0, 0, 0]);
    counts[s.owner]![corona.band(s.tile)]! += 1;
  }
  return counts;
}
