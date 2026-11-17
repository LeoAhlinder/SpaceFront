import { BALANCE } from "../../data/balance";
import type { System } from "../tick";
import { isAllied } from "../world/diplomacy";
import type { Faction, World } from "../world/world";
import { inSpawnPhase, landTiles } from "../world/world";

/** Above this many factions left, an alliance can't be the last one standing (saves the pair check). */
const MAX_ALLIED_SURVIVORS = 8;

/**
 * Declares a winner: the first faction to own BALANCE.match.winLandPct percent
 * of all ownable land on bodies (the Corona doesn't count), or the last
 * faction standing. Allies share a win (GAMEPLAY_PLAN.md §9): when everyone
 * left is allied with everyone else, the one with the most land is named the
 * winner and the client shows the win to all of them. Core keeps simulating
 * after a win; stopping the match is the host's decision.
 */
export const victorySystem: System = (world) => {
  if (world.winner !== null || inSpawnPhase(world)) return;
  // Factions that haven't spawned yet are still in the game: they count as alive.
  const alive: Faction[] = [];
  for (const f of world.factions) {
    if (f.kind === "neutral" || !f.alive) continue;
    if (landTiles(world, f) * 100 >= world.ownableTiles * BALANCE.match.winLandPct) {
      world.winner = f.id;
      return;
    }
    alive.push(f);
  }
  // Only in matches that had a contest at all.
  if (world.factions.length <= 2 || alive.length === 0) return;
  if (!alive.every((f) => f.hasSpawned)) return;
  if (alive.length === 1 || (alive.length <= MAX_ALLIED_SURVIVORS && allAllied(world, alive))) {
    let best = alive[0]!;
    for (const f of alive) if (landTiles(world, f) > landTiles(world, best)) best = f;
    world.winner = best.id;
  }
};

function allAllied(world: World, factions: readonly Faction[]): boolean {
  for (let i = 0; i < factions.length; i++) {
    for (let j = i + 1; j < factions.length; j++) {
      if (!isAllied(world, factions[i]!.id, factions[j]!.id)) return false;
    }
  }
  return true;
}
