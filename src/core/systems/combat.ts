import { BALANCE } from "../../data/balance";
import { structureCost } from "../../data/bodies";
import type { LaunchWarshipCommand, PatrolArea } from "../commands/commands";
import type { FactionId, GridId } from "../ids";
import { NEUTRAL } from "../ids";
import type { Point } from "../space/space";
import { bodyPosition, pointAlong, stepToward } from "../space/space";
import { SpatialHash } from "../space/spatialHash";
import type { System } from "../tick";
import { isAllied, pushEvent } from "../world/diplomacy";
import { destroyStructure, structuresOn } from "../world/structureIndex";
import type { Ship, Structure, Warship, World } from "../world/world";
import { gridOf, isCorona } from "../world/world";
import { coronaTilePoint } from "../space/space";
import { endpointOf } from "./ships";
import { dropExpiredFallout } from "./weapons";

const C = BALANCE.combat;
const WS = BALANCE.warship;
const OD = BALANCE.orbitalDefense;

/** Solars the faction's next Warship costs (rises with each one it has). */
export function warshipCost(world: World, faction: number): number {
  let owned = 0;
  for (const w of world.warships) if (w.owner === faction) owned++;
  return structureCost(WS.cost, WS.costStepPct, owned, 100);
}

/** Where a launch point or patrol world is right now (null for maps outside the solar system). */
function placeOf(world: World, grid: GridId, tile: number): Point | null {
  const end = endpointOf(world, grid, tile);
  if (end === null) return null;
  return typeof end === "string" ? bodyPosition(end, world.tick) : end;
}

/** The center of a patrol area right now. */
function patrolCenter(world: World, area: PatrolArea): Point {
  if (area.guardGrid >= 0) {
    const body = world.gridBodies[area.guardGrid];
    if (body) return bodyPosition(body, world.tick);
  }
  return { x: area.x, y: area.y };
}

/**
 * Buys a Warship (validated before) at a Spaceport or Sun Base: it starts at
 * the port's place in space and heads for its patrol area. Returns null on
 * success or a reason.
 */
export function applyLaunchWarship(world: World, command: LaunchWarshipCommand): string | null {
  const port = world.structures[command.from]!;
  const start = placeOf(world, port.grid, port.tile);
  if (!start) return "no route";
  const faction = world.factions[command.faction]!;
  faction.solars -= warshipCost(world, command.faction);
  const center = patrolCenter(world, command);
  const ship: Warship = {
    id: world.nextShipId,
    owner: command.faction,
    x: start.x,
    y: start.y,
    patrolX: center.x,
    patrolY: center.y,
    guardGrid: command.guardGrid,
    wayX: center.x,
    wayY: center.y,
    hp: BALANCE.hp.warship,
  };
  world.nextShipId += 1;
  world.warships.push(ship);
  return null;
}

/** Gives a Warship a new patrol area (validated before). */
export function applyPatrol(world: World, ship: Warship, area: PatrolArea): void {
  const center = patrolCenter(world, area);
  ship.patrolX = center.x;
  ship.patrolY = center.y;
  ship.guardGrid = area.guardGrid;
  ship.wayX = center.x;
  ship.wayY = center.y;
}

/**
 * Where a ship is in space at `tick`: along its route, or (weapons hopping
 * across one map) at that world, coming down from orbit. Null for ships
 * that never leave the map (landers and Freighters hopping across it).
 */
export function shipPosition(world: World, ship: Ship, tick: number): Point | null {
  if (ship.waypoints.length > 0) {
    return pointAlong(ship.waypoints, tick - ship.launchTick, ship.arriveTick - ship.launchTick);
  }
  if (ship.kind !== "kineticStrike" && ship.kind !== "antimatterWarhead") return null;
  const body = world.gridBodies[ship.toGrid];
  return body ? bodyPosition(body, tick) : null;
}

/** What a combat target is: a Warship, a ship in flight, or a Solar Siphon. */
const enum TargetKind {
  Warship,
  Ship,
  Siphon,
}

/**
 * Everything that can be shot this interval, as parallel lists (indexes go
 * into the spatial hash). Rebuilt every combat interval; not game state.
 */
interface Targets {
  kind: TargetKind[];
  /** Index into world.warships or world.ships, or a structure id. */
  ref: number[];
  owner: number[];
  x: number[];
  y: number[];
  hash: SpatialHash;
}

function collectTargets(world: World, tick: number): Targets {
  const t: Targets = {
    kind: [],
    ref: [],
    owner: [],
    x: [],
    y: [],
    hash: new SpatialHash(C.cellSize),
  };
  const add = (kind: TargetKind, ref: number, owner: number, p: Point) => {
    t.hash.insert(t.kind.length, p.x, p.y);
    t.kind.push(kind);
    t.ref.push(ref);
    t.owner.push(owner);
    t.x.push(p.x);
    t.y.push(p.y);
  };
  world.warships.forEach((w, i) => add(TargetKind.Warship, i, w.owner, w));
  world.ships.forEach((ship, i) => {
    const p = shipPosition(world, ship, tick);
    if (p) add(TargetKind.Ship, i, ship.owner, p);
  });
  const corona = world.corona;
  if (corona) {
    for (const id of structuresOn(world, corona.id, "solarSiphon")) {
      const s = world.structures[id]!;
      if (s.owner !== NEUTRAL) add(TargetKind.Siphon, id, s.owner, coronaTilePoint(corona, s.tile));
    }
  }
  return t;
}

/** Scratch list for spatial-hash queries; overwritten on every use. */
const near: number[] = [];

/**
 * Space combat (ARCHITECTURE.md §4.6). Every tick Warships move (toward a
 * target or around their patrol area). Every combat interval:
 *
 * - each Warship (in id order) picks the closest hostile target it can see,
 *   other Warships first, then landers and Sun Base ships, then Freighters
 *   (not those trading with it), then Solar Siphons; it shoots if in range,
 *   else chases;
 * - each finished Orbital Defense Platform shoots the closest hostile weapon,
 *   lander, Sun Base ship or Warship near its world (weapons first);
 * - whatever ran out of hit points is destroyed.
 *
 * Also drops faded fallout.
 */
export const combatSystem: System = (world, ctx) => {
  dropExpiredFallout(world);
  if (world.warships.length > 0) moveWarships(world);
  if (ctx.tick % C.intervalTicks !== 0) return;
  const hasDefense = world.grids.some((g) => structuresOn(world, g.id, "orbitalDefense").length);
  if (world.warships.length === 0 && !hasDefense) return;

  const targets = collectTargets(world, ctx.tick);
  for (const w of world.warships) {
    if (w.hp > 0) warshipAct(world, w, targets);
  }
  if (hasDefense) {
    for (const grid of world.grids) {
      for (const id of structuresOn(world, grid.id, "orbitalDefense")) {
        defend(world, world.structures[id]!, targets);
      }
    }
  }
  removeDestroyed(world);
};

/** Moves every Warship one tick toward its waypoint; a patrol picks a new one on arrival. */
function moveWarships(world: World): void {
  let dead = false;
  for (const w of world.warships) {
    if (!world.factions[w.owner]!.alive) {
      w.hp = 0;
      dead = true;
      continue;
    }
    if (w.guardGrid >= 0 && world.tick % C.intervalTicks === 0) {
      const center = patrolCenter(world, w);
      w.patrolX = center.x;
      w.patrolY = center.y;
    }
    const next = stepToward(w, { x: w.wayX, y: w.wayY }, WS.speed);
    w.x = next.x;
    w.y = next.y;
    if (w.x === w.wayX && w.y === w.wayY) {
      const r = WS.patrolRadius;
      w.wayX = w.patrolX + world.rng.nextRange(-r, r);
      w.wayY = w.patrolY + world.rng.nextRange(-r, r);
    }
  }
  if (dead) world.warships = world.warships.filter((w) => w.hp > 0);
}

/** True if `owner`'s things are fair game for `shooter`. */
function isHostile(world: World, shooter: number, owner: number): boolean {
  return owner !== NEUTRAL && owner !== shooter && !isAllied(world, shooter, owner);
}

/** Target priority for a Warship (lower first), or -1 if it won't shoot this target. */
function warshipPriority(world: World, w: Warship, t: Targets, i: number): number {
  switch (t.kind[i]!) {
    case TargetKind.Warship:
      return world.warships[t.ref[i]!]!.hp > 0 ? 0 : -1;
    case TargetKind.Siphon:
      return world.structures[t.ref[i]!]!.destroyed ? -1 : 3;
    case TargetKind.Ship: {
      const ship = world.ships[t.ref[i]!]!;
      if (ship.hp <= 0) return -1;
      if (ship.kind === "troopLander" || ship.kind === "sunBaseShip") return 1;
      if (ship.kind !== "freighter") return -1; // weapons are Orbital Defense's job
      // Leave Freighters alone that are trading with the Warship's side.
      const dest = world.structures[ship.toStructure];
      if (dest && (dest.owner === w.owner || isAllied(world, w.owner, dest.owner))) return -1;
      return 2;
    }
  }
}

function warshipAct(world: World, w: Warship, t: Targets): void {
  t.hash.near(w.x, w.y, near);
  let best = -1;
  let bestPriority = 0;
  let bestDist = 0;
  const range2 = WS.detectRange * WS.detectRange;
  for (const i of near) {
    if (!isHostile(world, w.owner, t.owner[i]!)) continue;
    const dx = t.x[i]! - w.x;
    const dy = t.y[i]! - w.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > range2) continue;
    const priority = warshipPriority(world, w, t, i);
    if (priority < 0) continue;
    if (best < 0 || priority < bestPriority || (priority === bestPriority && d2 < bestDist)) {
      best = i;
      bestPriority = priority;
      bestDist = d2;
    }
  }
  if (best < 0) {
    // Nothing in sight: back to patrolling (a chase may have led it away).
    const dx = w.wayX - w.patrolX;
    const dy = w.wayY - w.patrolY;
    const r = WS.patrolRadius;
    if (dx * dx + dy * dy > 2 * r * r) {
      w.wayX = w.patrolX;
      w.wayY = w.patrolY;
    }
    return;
  }
  // Close in on the target (it keeps moving), shooting once in range.
  w.wayX = t.x[best]!;
  w.wayY = t.y[best]!;
  if (bestDist <= WS.fireRange * WS.fireRange) hit(world, t, best, WS.damage, w.owner, w);
}

/** Target priority for Orbital Defense (lower first), or -1 if it won't shoot. */
function defensePriority(world: World, t: Targets, i: number): number {
  switch (t.kind[i]!) {
    case TargetKind.Warship:
      return world.warships[t.ref[i]!]!.hp > 0 ? 2 : -1;
    case TargetKind.Siphon:
      return -1;
    case TargetKind.Ship: {
      const ship = world.ships[t.ref[i]!]!;
      if (ship.hp <= 0 || ship.kind === "freighter") return -1;
      return ship.kind === "troopLander" || ship.kind === "sunBaseShip" ? 1 : 0;
    }
  }
}

function defend(world: World, s: Structure, t: Targets): void {
  if (s.buildTicksLeft > 0 || s.owner === NEUTRAL || s.readyTick > world.tick) return;
  const body = world.gridBodies[s.grid];
  if (!body) return;
  const center = bodyPosition(body, world.tick);
  t.hash.near(center.x, center.y, near);
  let best = -1;
  let bestPriority = 0;
  let bestDist = 0;
  const range2 = OD.range * OD.range;
  for (const i of near) {
    if (!isHostile(world, s.owner, t.owner[i]!)) continue;
    const dx = t.x[i]! - center.x;
    const dy = t.y[i]! - center.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > range2) continue;
    const priority = defensePriority(world, t, i);
    if (priority < 0) continue;
    if (best < 0 || priority < bestPriority || (priority === bestPriority && d2 < bestDist)) {
      best = i;
      bestPriority = priority;
      bestDist = d2;
    }
  }
  if (best < 0) return;
  s.readyTick = world.tick + OD.reloadTicks;
  hit(world, t, best, bestPriority === 0 ? OD.damage : OD.shipDamage, s.owner, center);
}

/**
 * Deals `damage` to target `i` and draws the shot. A damaged lander loses
 * troops in proportion. Destroyed siphons go at once; ships and Warships are
 * removed at the end of the interval. A downed weapon is announced.
 */
function hit(world: World, t: Targets, i: number, damage: number, by: number, from: Point): void {
  world.log?.effects.push({
    kind: "beam",
    owner: by,
    fromX: from.x,
    fromY: from.y,
    toX: t.x[i]!,
    toY: t.y[i]!,
  });
  const blast = (size: number) =>
    world.log?.effects.push({ kind: "blast", x: t.x[i]!, y: t.y[i]!, size });
  switch (t.kind[i]!) {
    case TargetKind.Warship: {
      const w = world.warships[t.ref[i]!]!;
      w.hp -= damage;
      if (w.hp <= 0) blast(3);
      return;
    }
    case TargetKind.Siphon: {
      const s = world.structures[t.ref[i]!]!;
      s.hp -= damage;
      if (s.hp <= 0) {
        destroyStructure(world, s);
        blast(3);
      }
      return;
    }
    case TargetKind.Ship: {
      const ship = world.ships[t.ref[i]!]!;
      if (ship.troops > 0) {
        ship.troops -= Math.floor((ship.troops * Math.min(damage, ship.hp)) / ship.hp);
      }
      ship.hp -= damage;
      if (ship.hp > 0) return;
      blast(ship.kind === "antimatterWarhead" ? 3 : 1);
      if (ship.kind === "kineticStrike" || ship.kind === "antimatterWarhead") {
        pushEvent(world, {
          kind: "weaponIntercepted",
          by,
          owner: ship.owner,
          weapon: ship.kind,
          grid: ship.toGrid,
        });
      }
      return;
    }
  }
}

/** Removes ships and Warships shot down this interval (the client hears of ships as landed). */
function removeDestroyed(world: World): void {
  if (world.ships.some((s) => s.hp <= 0)) {
    world.ships = world.ships.filter((s) => {
      if (s.hp > 0) return true;
      world.log?.shipsLanded.push(s.id);
      return false;
    });
  }
  if (world.warships.some((w) => w.hp <= 0)) {
    world.warships = world.warships.filter((w) => w.hp > 0);
  }
}

/** True if the area is a valid patrol order: a point near enough the Sun, or a world with a body. */
export function patrolAreaError(world: World, area: PatrolArea): string | null {
  if (!Number.isInteger(area.guardGrid) || area.guardGrid < -1) return "bad patrol area";
  if (area.guardGrid >= 0) {
    if (!gridOf(world, area.guardGrid) || isCorona(world, area.guardGrid)) return "unknown world";
    return world.gridBodies[area.guardGrid] ? null : "no route";
  }
  const { x, y } = area;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return "bad patrol point";
  const max = C.maxPatrolDistance;
  return x * x + y * y > max * max ? "patrol point is too far out" : null;
}

/** A faction's Warship by id, if it has it. */
export function warshipOf(world: World, faction: FactionId, id: number): Warship | undefined {
  return world.warships.find((w) => w.id === id && w.owner === faction);
}
