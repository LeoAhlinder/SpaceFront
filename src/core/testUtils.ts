/** Helpers for core unit tests. Not exported from core/index.ts. */
import { queueCommand } from "./commands/applyCommands";
import type { Command } from "./commands/commands";
import type { DiscGrid } from "./grid/discGrid";
import type { FactionId, GridId } from "./ids";
import { gridId } from "./ids";
import type { TickContext } from "./tick";
import { runTick } from "./tick";
import type { Faction, World } from "./world/world";
import { addFaction, createWorld } from "./world/world";

export const G0: GridId = gridId(0);

/** A world with one disc of the given radius and `factions` bot factions. */
export function testWorld(radius = 20, factions = 2, seed = 1): World {
  const world = createWorld({ seed, difficulty: "normal", bodies: [{ radius }] });
  for (let i = 1; i <= factions; i++) addFaction(world, `F${i}`, "bot");
  return world;
}

export function grid0(world: World): DiscGrid {
  return world.grids[0]!;
}

export function faction(world: World, id: number): Faction {
  return world.factions[id]!;
}

/** Queues `commands` for the next tick and runs it. Returns the tick context. */
export function runWith(world: World, ...commands: Command[]): TickContext {
  for (const c of commands) queueCommand(world, c);
  return runTick(world);
}

export function spawn(world: World, f: number, x: number, y: number): Command {
  return {
    type: "spawn",
    faction: f as FactionId,
    grid: G0,
    tile: grid0(world).index(x, y),
  };
}

export function attack(world: World, f: number, x: number, y: number, ratioPct = 100): Command {
  return {
    type: "attack",
    faction: f as FactionId,
    grid: G0,
    tile: grid0(world).index(x, y),
    ratioPct,
  };
}

/** Counts the tiles on grid 0 owned by `owner`. */
export function countOwned(world: World, owner: number): number {
  const owners = grid0(world).owner;
  let n = 0;
  for (let i = 0; i < owners.length; i++) if (owners[i] === owner) n++;
  return n;
}
