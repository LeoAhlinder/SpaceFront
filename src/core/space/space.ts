import { BALANCE } from "../../data/balance";
import type { BodyDef } from "../../data/bodies";
import { SOLAR_SYSTEM } from "../../data/bodies";
import { ANGLE_FULL, fxCos, fxSin } from "../math/trig";

/** A point in space units (integers). The Sun is at (0, 0). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

const BODIES = new Map(SOLAR_SYSTEM.map((b) => [b.id, b]));
const OBSTACLES = SOLAR_SYSTEM.filter((b) => b.avoidRadius > 0);

/**
 * Where a body is at a tick. Positions are computed from the tick, not stored,
 * so any future position can be looked up (that's how ships aim).
 */
export function bodyPosition(id: string, tick: number): Point {
  const body = BODIES.get(id);
  if (!body) throw new Error(`Unknown body "${id}"`);
  return positionOf(body, tick);
}

function positionOf(body: BodyDef, tick: number): Point {
  const center = body.parent ? positionOf(BODIES.get(body.parent)!, tick) : { x: 0, y: 0 };
  if (body.orbitTicks === 0 || body.orbitRadius === 0) return center;
  const angle = body.phase + Math.floor((tick * ANGLE_FULL) / body.orbitTicks);
  // r × cos/sin in Q16.16 → integer space units (exact: r < 2^16).
  return {
    x: center.x + Math.floor((body.orbitRadius * fxCos(angle)) / 65536),
    y: center.y + Math.floor((body.orbitRadius * fxSin(angle)) / 65536),
  };
}

/** floor(√n) for a non-negative integer, exact. */
export function isqrt(n: number): number {
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return isqrt(dx * dx + dy * dy);
}

/** Total length of a polyline. */
export function pathLength(points: readonly Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += distance(points[i - 1]!, points[i]!);
  return len;
}

export interface Flight {
  /** Polyline from the launch point to the landing point (at least 2 points). */
  readonly waypoints: readonly Point[];
  readonly arriveTick: number;
}

/**
 * Plans a flight from body `fromId` to body `toId`, launched at `tick`. Aims
 * at where the target will be on arrival (refined a few times, since the
 * arrival time depends on the path) and bends around the Sun's heat zone and
 * the gas giants.
 */
export function planFlight(
  fromId: string,
  toId: string,
  tick: number,
  speed: number = BALANCE.ships.landerSpeed,
): Flight {
  const start = bodyPosition(fromId, tick);
  let arrive = tick + BALANCE.ships.minFlightTicks;
  for (let i = 0; i < 4; i++) {
    const end = bodyPosition(toId, arrive);
    const route = avoidObstacles(start, end, Math.floor((tick + arrive) / 2), [fromId, toId]);
    arrive = tick + Math.max(BALANCE.ships.minFlightTicks, Math.ceil(pathLength(route) / speed));
  }
  // Final aim at the settled arrival time.
  const end = bodyPosition(toId, arrive);
  const waypoints = avoidObstacles(start, end, Math.floor((tick + arrive) / 2), [fromId, toId]);
  return { waypoints, arriveTick: arrive };
}

/**
 * Inserts detour points so no segment passes inside an obstacle's avoid
 * radius (obstacle positions taken at `tick`). Obstacles that are the start
 * or target body (or their parents) are ignored.
 */
function avoidObstacles(a: Point, b: Point, tick: number, ends: readonly string[]): Point[] {
  const skip = new Set<string>();
  for (const id of ends) {
    skip.add(id);
    const parent = BODIES.get(id)?.parent;
    if (parent) skip.add(parent);
  }
  const path: Point[] = [a, b];
  for (const obstacle of OBSTACLES) {
    if (skip.has(obstacle.id)) continue;
    const c = positionOf(obstacle, tick);
    const r = obstacle.avoidRadius;
    for (let i = 0; i + 1 < path.length; i++) {
      const p = path[i]!;
      const q = path[i + 1]!;
      const closest = closestPoint(p, q, c);
      if (distance(closest, c) >= r) continue;
      path.splice(i + 1, 0, detourPoint(p, q, c, closest, r));
      break; // one detour per obstacle
    }
  }
  return path;
}

function closestPoint(p: Point, q: Point, c: Point): Point {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return p;
  const dot = Math.max(0, Math.min(len2, (c.x - p.x) * dx + (c.y - p.y) * dy));
  return { x: p.x + Math.floor((dx * dot) / len2), y: p.y + Math.floor((dy * dot) / len2) };
}

/** A point beside the obstacle, on the side the segment passes, outside the avoid radius. */
function detourPoint(p: Point, q: Point, c: Point, closest: Point, r: number): Point {
  let vx = closest.x - c.x;
  let vy = closest.y - c.y;
  if (vx === 0 && vy === 0) {
    // Heading straight through the center: go around on the left.
    vx = -(q.y - p.y);
    vy = q.x - p.x;
  }
  const len = Math.max(1, isqrt(vx * vx + vy * vy));
  const reach = Math.floor((r * BALANCE.ships.avoidMarginPct) / 100);
  return { x: c.x + Math.floor((vx * reach) / len), y: c.y + Math.floor((vy * reach) / len) };
}
