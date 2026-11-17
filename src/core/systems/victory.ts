import { BALANCE } from "../../data/balance";
import type { System } from "../tick";
import { inSpawnPhase, landTiles } from "../world/world";

/**
 * Declares a winner: the first faction to own BALANCE.match.winLandPct percent
 * of all ownable land on bodies (the Corona doesn't count), or the last
 * faction standing. Core keeps simulating
 * after a win; stopping the match is the host's decision.
 */
export const victorySystem: System = (world) => {
  if (world.winner !== null || inSpawnPhase(world)) return;
  // Factions that haven't spawned yet are still in the game: they count as alive.
  let alive = 0;
  let last = null;
  for (const f of world.factions) {
    if (f.kind === "neutral" || !f.alive) continue;
    if (landTiles(world, f) * 100 >= world.ownableTiles * BALANCE.match.winLandPct) {
      world.winner = f.id;
      return;
    }
    alive++;
    last = f;
  }
  // Last one standing (only in matches that had a contest at all).
  if (alive === 1 && last?.hasSpawned && world.factions.length > 2) world.winner = last.id;
};
