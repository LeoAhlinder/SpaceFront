import { BALANCE } from "../../data/balance";
import { pathLength } from "../space/space";
import type { System } from "../tick";
import { hasEmbargo } from "../world/diplomacy";
import type { Ship, Structure, World } from "../world/world";
import { gridOf } from "../world/world";
import { planRoute } from "./ships";
import { nextTradeDelay } from "./structures";

const T = BALANCE.trade;

/**
 * Automatic trade (GAMEPLAY_PLAN.md §5): every finished Spaceport (or Sun
 * Base, which works as one) sends a Freighter now and then to a random port
 * of another faction (none under an embargo). When it
 * arrives, both owners earn Solars; longer routes pay more.
 */
export const tradeSystem: System = (world, ctx) => {
  let ports: Structure[] | null = null;
  for (const port of world.structures) {
    if (!isPort(port) || port.nextTradeTick < 0 || port.nextTradeTick > ctx.tick) continue;
    port.nextTradeTick = ctx.tick + nextTradeDelay(world);
    if (!world.factions[port.owner]!.alive) continue;
    ports ??= world.structures.filter((s) => isPort(s) && s.buildTicksLeft === 0);
    const partners = ports.filter(
      (p) =>
        p.owner !== port.owner &&
        world.factions[p.owner]!.alive &&
        !hasEmbargo(world, port.owner, p.owner),
    );
    if (partners.length === 0) continue;
    launchFreighter(world, port, partners[world.rng.nextInt(partners.length)]!);
  }
};

/** True for structures that launch ships and trade: Spaceports and Sun Bases. */
export function isPort(s: Structure): boolean {
  return s.kind === "spaceport" || s.kind === "sunBase";
}

function launchFreighter(world: World, from: Structure, to: Structure): void {
  const route = planRoute(world, from, to, T.freighterSpeed, (steps) =>
    Math.ceil((steps * T.unitsPerTile) / T.freighterSpeed),
  );
  if (!route) return; // no route between maps outside the solar system
  const { arriveTick, waypoints } = route;
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
      : gridOf(world, ship.toGrid)!.distance(ship.fromTile, ship.toTile) * T.unitsPerTile;
  return T.base + Math.floor((units * T.perUnitPermille) / 1000);
}

/**
 * A Freighter arrives. If the destination Spaceport now belongs to the sender
 * (captured on the way), or an embargo started meanwhile, nobody is paid;
 * otherwise both sides earn.
 */
export function deliver(world: World, ship: Ship): void {
  const dest = world.structures[ship.toStructure];
  if (!dest || dest.owner === ship.owner || hasEmbargo(world, ship.owner, dest.owner)) return;
  const pay = tradePayout(world, ship);
  const sender = world.factions[ship.owner]!;
  const receiver = world.factions[dest.owner]!;
  if (sender.alive) sender.solars += pay;
  if (receiver.alive) receiver.solars += pay;
}
