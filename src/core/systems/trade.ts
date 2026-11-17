import { BALANCE } from "../../data/balance";
import { pathLength, planFlight } from "../space/space";
import type { System } from "../tick";
import type { Ship, Structure, World } from "../world/world";
import { nextTradeDelay } from "./structures";

const T = BALANCE.trade;

/**
 * Automatic trade (GAMEPLAY_PLAN.md §5): every finished Spaceport sends a
 * Freighter now and then to a random Spaceport of another faction. When it
 * arrives, both owners earn Solars; longer routes pay more.
 */
export const tradeSystem: System = (world, ctx) => {
  let ports: Structure[] | null = null;
  for (const port of world.structures) {
    if (port.kind !== "spaceport" || port.nextTradeTick < 0 || port.nextTradeTick > ctx.tick) {
      continue;
    }
    port.nextTradeTick = ctx.tick + nextTradeDelay(world);
    if (!world.factions[port.owner]!.alive) continue;
    ports ??= world.structures.filter((s) => s.kind === "spaceport" && s.buildTicksLeft === 0);
    const partners = ports.filter((p) => p.owner !== port.owner && world.factions[p.owner]!.alive);
    if (partners.length === 0) continue;
    launchFreighter(world, port, partners[world.rng.nextInt(partners.length)]!);
  }
};

function launchFreighter(world: World, from: Structure, to: Structure): void {
  let arriveTick: number;
  let waypoints: Ship["waypoints"] = [];
  if (from.grid === to.grid) {
    const units = world.grids[from.grid]!.distance(from.tile, to.tile) * T.unitsPerTile;
    arriveTick =
      world.tick + Math.max(BALANCE.ships.minFlightTicks, Math.ceil(units / T.freighterSpeed));
  } else {
    const fromBody = world.gridBodies[from.grid];
    const toBody = world.gridBodies[to.grid];
    if (!fromBody || !toBody) return; // no route between maps outside the solar system
    const flight = planFlight(fromBody, toBody, world.tick, T.freighterSpeed);
    arriveTick = flight.arriveTick;
    waypoints = flight.waypoints;
  }
  const ship: Ship = {
    id: world.nextShipId,
    kind: "freighter",
    owner: from.owner,
    troops: 0,
    fromGrid: from.grid,
    fromTile: from.tile,
    toGrid: to.grid,
    toTile: to.tile,
    toStructure: to.id,
    launchTick: world.tick,
    arriveTick,
    waypoints,
  };
  world.nextShipId += 1;
  world.ships.push(ship);
  world.log?.shipsLaunched.push(ship.id);
}

/** Solars each side earns for a Freighter on this route. */
export function tradePayout(world: World, ship: Ship): number {
  const units =
    ship.waypoints.length > 0
      ? pathLength(ship.waypoints)
      : world.grids[ship.toGrid]!.distance(ship.fromTile, ship.toTile) * T.unitsPerTile;
  return T.base + Math.floor((units * T.perUnitPermille) / 1000);
}

/**
 * A Freighter arrives. If the destination Spaceport now belongs to the sender
 * (captured on the way), nobody is paid; otherwise both sides earn.
 */
export function deliver(world: World, ship: Ship): void {
  const dest = world.structures[ship.toStructure];
  if (!dest || dest.owner === ship.owner) return;
  const pay = tradePayout(world, ship);
  const sender = world.factions[ship.owner]!;
  const receiver = world.factions[dest.owner]!;
  if (sender.alive) sender.solars += pay;
  if (receiver.alive) receiver.solars += pay;
}
