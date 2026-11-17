import { BALANCE } from "../../data/balance";
import type { LaunchCommand } from "../commands/commands";
import type { FactionId, GridId } from "../ids";
import type { Endpoint, Point } from "../space/space";
import { coronaArc, coronaTilePoint, pathLength, planFlight } from "../space/space";
import type { System } from "../tick";
import { isAllied } from "../world/diplomacy";
import { setOwner } from "../world/territory";
import type { Ship, World } from "../world/world";
import { addTroops, gridOf, isCorona, troopPool } from "../world/world";
import { beginAttack, extendFrontiers } from "./attack";
import { foundSunBase } from "./corona";
import { buildCost } from "./structures";
import { deliver } from "./trade";

const S = BALANCE.ships;

/** Where a tile is for flights: its body, or the tile's own point in the Corona. */
export function endpointOf(world: World, grid: GridId, tile: number): Endpoint | null {
  if (isCorona(world, grid)) return coronaTilePoint(world.corona!, tile);
  return world.gridBodies[grid] ?? null;
}

/** A planned trip: when it arrives and its route through space (empty for a hop). */
export interface Route {
  readonly arriveTick: number;
  readonly waypoints: readonly Point[];
}

/**
 * Plans a trip between two tiles leaving now: a hop across the same map
 * (taking hopTicks(steps)), a curve around the Sun within the Corona, or a
 * flight through space. Null if there is no route (maps outside the solar system).
 */
export function planRoute(
  world: World,
  from: { readonly grid: GridId; readonly tile: number },
  to: { readonly grid: GridId; readonly tile: number },
  speed: number,
  hopTicks: (steps: number) => number,
): Route | null {
  const min = S.minFlightTicks;
  if (from.grid === to.grid && isCorona(world, from.grid)) {
    const waypoints = coronaArc(world.corona!, from.tile, to.tile);
    const ticks = Math.max(min, Math.ceil(pathLength(waypoints) / speed));
    return { arriveTick: world.tick + ticks, waypoints };
  }
  if (from.grid === to.grid) {
    const steps = gridOf(world, from.grid)!.distance(from.tile, to.tile);
    return { arriveTick: world.tick + Math.max(min, hopTicks(steps)), waypoints: [] };
  }
  const a = endpointOf(world, from.grid, from.tile);
  const b = endpointOf(world, to.grid, to.tile);
  if (a === null || b === null) return null;
  return planFlight(a, b, world.tick, speed);
}

/**
 * Launches a Troop Lander or a Sun Base ship (validated before). Troops come
 * from the pool of the launching map (a Sun Base launches Corona troops). A
 * Sun Base ship is paid for now. Returns null on success or a reason it
 * couldn't launch.
 */
export function applyLaunch(world: World, command: LaunchCommand): string | null {
  const faction = world.factions[command.faction]!;
  const port = world.structures[command.from]!;
  const troops = Math.floor((troopPool(world, faction, port.grid) * command.ratioPct) / 100);
  const isSunBase = command.kind === "sunBaseShip";
  // A Sun Base ship may fly empty: its base trains troops after landing.
  if (troops < 1 && !isSunBase) return "no troops";

  const route = planRoute(
    world,
    port,
    { grid: command.toGrid, tile: command.toTile },
    S.landerSpeed,
    (steps) => Math.ceil(steps / S.landerTilesPerTick),
  );
  if (!route) return "no route";

  if (isSunBase) faction.solars -= buildCost(world, command.faction, "sunBase", command.toGrid);
  addTroops(world, faction, port.grid, -troops);
  const { arriveTick, waypoints } = route;
  const ship: Ship = {
    id: world.nextShipId,
    kind: command.kind,
    owner: command.faction,
    troops,
    fromGrid: port.grid,
    fromTile: port.tile,
    toGrid: command.toGrid,
    toTile: command.toTile,
    toStructure: -1,
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
    if (ship.kind === "freighter") deliver(world, ship);
    else if (ship.kind === "sunBaseShip") foundSunBase(world, ship);
    else land(world, ship);
    world.log?.shipsLanded.push(ship.id);
  }
  world.ships = flying;
};

/**
 * A Troop Lander arrives. On its own land the troops simply join the
 * faction (in the Corona: its Corona troops). Otherwise it pays BALANCE.ships.landingCost to take the landing
 * tile, then attacks the tile's previous owner (or empty land) from that
 * beachhead with the rest. Troops of an eliminated faction are lost.
 */
function land(world: World, ship: Ship): void {
  const faction = world.factions[ship.owner]!;
  if (!faction.alive) return;
  const grid = gridOf(world, ship.toGrid)!;
  const target = grid.owner[ship.toTile]! as FactionId;
  // Own land reinforces; an ally's land (allied while flying) can't be invaded.
  if (target === ship.owner || isAllied(world, ship.owner, target)) {
    addTroops(world, faction, ship.toGrid, ship.troops);
    return;
  }
  if (ship.troops <= S.landingCost) return; // too few to hold the beach
  setOwner(world, grid, ship.toTile, ship.owner);
  extendFrontiers(world, grid, ship.toTile, ship.owner);
  const troops = ship.troops - S.landingCost;
  const reason = beginAttack(world, ship.owner, ship.toGrid, ship.toTile, target, troops);
  // Nothing to attack from the beach (e.g. a lone island tile): keep the troops.
  if (reason !== null) addTroops(world, faction, ship.toGrid, troops);
}
