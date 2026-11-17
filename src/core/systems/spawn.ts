import { BALANCE } from "../../data/balance";
import type { SpawnCommand } from "../commands/commands";
import { isOwnableTerrain } from "../grid/terrain";
import { NEUTRAL } from "../ids";
import { setOwner } from "../world/territory";
import type { World } from "../world/world";

/**
 * Claims the neutral, ownable tiles within BALANCE.spawn.radius steps of the
 * spawn tile (walking only over ownable land; nations claim a bit more) and
 * gives the starting population (more for nations, by tier).
 * The command was validated before this runs.
 */
export function applySpawn(world: World, command: SpawnCommand): void {
  const grid = world.grids[command.grid]!;
  const faction = world.factions[command.faction]!;
  const radius = BALANCE.spawn.radius + faction.bonus.spawnRadius;

  const out = new Int32Array(grid.maxNeighbors);
  const distance = new Map<number, number>([[command.tile, 0]]);
  const queue = [command.tile];
  for (let head = 0; head < queue.length; head++) {
    const tile = queue[head]!;
    setOwner(world, grid, tile, command.faction);
    const d = distance.get(tile)!;
    if (d === radius) continue;
    const n = grid.neighbors(tile, out);
    for (let i = 0; i < n; i++) {
      const next = out[i]!;
      if (distance.has(next)) continue;
      if (grid.owner[next] !== NEUTRAL || !isOwnableTerrain(grid.terrain[next]!)) continue;
      distance.set(next, d + 1);
      queue.push(next);
    }
  }

  faction.hasSpawned = true;
  faction.troops = Math.floor((BALANCE.spawn.troops * faction.bonus.startPopPct) / 100);
  faction.workers = Math.floor((BALANCE.spawn.workers * faction.bonus.startPopPct) / 100);
  faction.solars = BALANCE.spawn.solars;
}
