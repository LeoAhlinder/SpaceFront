import { BALANCE } from "../../data/balance";
import type { LaunchCommand } from "../commands/commands";
import type { FactionId } from "../ids";
import { planFlight } from "../space/space";
import type { System } from "../tick";
import { setOwner } from "../world/territory";
import type { Ship, World } from "../world/world";
import { beginAttack, extendFrontiers } from "./attack";

const S = BALANCE.ships;

/**
 * Launches a Troop Lander (validated before). The route is planned now: a hop
 * across the same map, or a flight through space to where the target body
 * will be on arrival. Returns null on success or a reason it couldn't launch.
 */
export function applyLaunch(world: World, command: LaunchCommand): string | null {
  const faction = world.factions[command.faction]!;
  const port = world.structures[command.from]!;
  const troops = Math.floor((faction.troops * command.ratioPct) / 100);
  if (troops < 1) return "no troops";

  let arriveTick: number;
  let waypoints: Ship["waypoints"] = [];
  if (port.grid === command.toGrid) {
    const hop = world.grids[port.grid]!.distance(port.tile, command.toTile);
    arriveTick = world.tick + Math.max(S.minFlightTicks, Math.ceil(hop / S.landerTilesPerTick));
  } else {
    const flight = planFlight(
      world.gridBodies[port.grid]!,
      world.gridBodies[command.toGrid]!,
      world.tick,
    );
    arriveTick = flight.arriveTick;
    waypoints = flight.waypoints;
  }

  faction.troops -= troops;
  const ship: Ship = {
    id: world.nextShipId,
    kind: command.kind,
    owner: command.faction,
    troops,
    fromGrid: port.grid,
    fromTile: port.tile,
    toGrid: command.toGrid,
    toTile: command.toTile,
    launchTick: world.tick,
    arriveTick,
    waypoints,
  };
  world.nextShipId += 1;
  world.ships.push(ship);
  world.log?.shipsLaunched.push(ship.id);
  return null;
}

/** Lands every ship whose arrival tick has come. */
export const shipSystem: System = (world, ctx) => {
  if (world.ships.length === 0) return;
  const flying: Ship[] = [];
  for (const ship of world.ships) {
    if (ship.arriveTick > ctx.tick) {
      flying.push(ship);
      continue;
    }
    land(world, ship);
    world.log?.shipsLanded.push(ship.id);
  }
  world.ships = flying;
};

/**
 * A Troop Lander arrives. On its own land the troops simply join the
 * faction. Otherwise it pays BALANCE.ships.landingCost to take the landing
 * tile, then attacks the tile's previous owner (or empty land) from that
 * beachhead with the rest. Troops of an eliminated faction are lost.
 */
function land(world: World, ship: Ship): void {
  const faction = world.factions[ship.owner]!;
  if (!faction.alive) return;
  const grid = world.grids[ship.toGrid]!;
  const target = grid.owner[ship.toTile]! as FactionId;
  if (target === ship.owner) {
    faction.troops += ship.troops;
    return;
  }
  if (ship.troops <= S.landingCost) return; // too few to hold the beach
  setOwner(world, grid, ship.toTile, ship.owner);
  extendFrontiers(world, grid, ship.toTile, ship.owner);
  const troops = ship.troops - S.landingCost;
  const reason = beginAttack(world, ship.owner, ship.toGrid, ship.toTile, target, troops);
  // Nothing to attack from the beach (e.g. a lone island tile): keep the troops.
  if (reason !== null) faction.troops += troops;
}
