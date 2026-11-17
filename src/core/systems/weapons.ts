import { BALANCE } from "../../data/balance";
import type { FireWeaponCommand } from "../commands/commands";
import { tilesWithin } from "../grid/area";
import { NEUTRAL } from "../ids";
import { pushEvent } from "../world/diplomacy";
import { destroyStructure } from "../world/structureIndex";
import { setOwner } from "../world/territory";
import type { Faction, Ship, World } from "../world/world";
import { addTroops, coronaTiles, gridOf, isCorona, landTiles } from "../world/world";
import { planRoute } from "./ships";

const W = BALANCE.weapons;

/** Scratch list for blast areas; overwritten on every use. */
const area: number[] = [];

/**
 * True if `tile` lies in irradiated land (an Antimatter Warhead's fallout
 * that hasn't faded yet): taking it costs more, and nothing can be built there.
 */
export function isIrradiated(world: World, grid: number, tile: number): boolean {
  const fallout = world.fallout;
  if (fallout.length === 0) return false;
  for (const f of fallout) {
    if (f.grid !== grid || f.untilTick <= world.tick) continue;
    if (gridOf(world, grid)!.distance(f.tile, tile) <= f.radius) return true;
  }
  return false;
}

/** Forgets fallout that has faded (zones are kept oldest first). */
export function dropExpiredFallout(world: World): void {
  let n = 0;
  while (n < world.fallout.length && world.fallout[n]!.untilTick <= world.tick) n++;
  if (n > 0) world.fallout.splice(0, n);
}

/**
 * Fires a weapon from a loaded Launch Silo (validated before): pays for it,
 * starts the silo's reload and sends the weapon on its way as a ship (it
 * flies like a lander and can be shot down by Orbital Defense). Everyone is
 * warned. Returns null on success or a reason it couldn't fire.
 */
export function applyFireWeapon(world: World, command: FireWeaponCommand): string | null {
  const faction = world.factions[command.faction]!;
  const silo = world.structures[command.from]!;
  const route = planRoute(world, silo, { grid: command.grid, tile: command.tile }, W.speed, (s) =>
    Math.ceil(s / W.tilesPerTick),
  );
  if (!route) return "no route";
  faction.solars -= W[command.kind].cost;
  silo.readyTick = world.tick + W.siloReloadTicks;
  world.log?.structures.push(silo.id);
  const ship: Ship = {
    id: world.nextShipId,
    kind: command.kind,
    owner: command.faction,
    troops: 0,
    hp: BALANCE.hp[command.kind],
    fromGrid: silo.grid,
    fromTile: silo.tile,
    toGrid: command.grid,
    toTile: command.tile,
    toStructure: -1,
    launchTick: world.tick,
    arriveTick: route.arriveTick,
    waypoints: route.waypoints,
  };
  world.nextShipId += 1;
  world.ships.push(ship);
  world.log?.shipsLaunched.push(ship.id);
  pushEvent(world, {
    kind: "weaponLaunched",
    by: command.faction,
    weapon: command.kind,
    grid: command.grid,
    tile: command.tile,
    arriveTick: route.arriveTick,
  });
  return null;
}

/**
 * A weapon reaches its target tile. Both kinds destroy every structure in
 * their radius and kill troops of whoever owns land there. A Kinetic Strike
 * leaves the land owned; an Antimatter Warhead turns it neutral and leaves
 * it irradiated for a while. Nations hit hold a grudge against the shooter.
 */
export function impact(world: World, ship: Ship): void {
  if (ship.kind !== "kineticStrike" && ship.kind !== "antimatterWarhead") return;
  const grid = gridOf(world, ship.toGrid)!;
  const isWarhead = ship.kind === "antimatterWarhead";
  const radius = W[ship.kind].radius;
  const n = tilesWithin(grid, ship.toTile, radius, area);

  // Count the tiles hit per owner first, so troop losses use the density before the blast.
  const hits = new Int32Array(world.factions.length);
  for (let i = 0; i < n; i++) {
    const tile = area[i]!;
    const owner = grid.owner[tile]!;
    if (owner !== NEUTRAL) hits[owner] = hits[owner]! + 1;
    const structure = world.structureAt[grid.id]![tile]!;
    if (structure >= 0) destroyStructure(world, world.structures[structure]!);
  }
  for (let id = 1; id < hits.length; id++) {
    const count = hits[id]!;
    if (count === 0) continue;
    const f = world.factions[id]!;
    const density = troopDensity(world, f, grid.id);
    const loss = isWarhead
      ? Math.floor((count * density * W.antimatterWarhead.killDensityPct) / 100)
      : count * W.kineticStrike.killPerTile +
        Math.floor((count * density * W.kineticStrike.killDensityPct) / 100);
    const pool = isCorona(world, grid.id) ? f.coronaTroops : f.troops;
    addTroops(world, f, grid.id, -Math.min(pool, loss));
    for (const nation of world.nations) {
      if (nation.faction !== id || id === ship.owner) continue;
      const grudge = nation.grudges.get(ship.owner) ?? 0;
      nation.grudges.set(ship.owner, grudge + BALANCE.nation.weaponGrudge);
    }
  }
  if (isWarhead) {
    for (let i = 0; i < n; i++) setOwner(world, grid, area[i]!, NEUTRAL);
    world.fallout.push({
      grid: ship.toGrid,
      tile: ship.toTile,
      radius,
      untilTick: world.tick + W.antimatterWarhead.falloutTicks,
    });
  }
  world.log?.effects.push({
    kind: "impact",
    weapon: ship.kind,
    grid: ship.toGrid,
    tile: ship.toTile,
    radius,
  });
  pushEvent(world, {
    kind: "weaponHit",
    by: ship.owner,
    weapon: ship.kind,
    grid: ship.toGrid,
    tile: ship.toTile,
  });
}

/** A faction's troops per tile on the side of the war `grid` belongs to (Corona or bodies). */
function troopDensity(world: World, f: Faction, grid: number): number {
  if (isCorona(world, grid)) return Math.floor(f.coronaTroops / Math.max(1, coronaTiles(world, f)));
  return Math.floor(f.troops / Math.max(1, landTiles(world, f)));
}
