import type { BodyDef } from "../../data/bodies";
import { SOLAR_SYSTEM } from "../../data/bodies";

/**
 * Body and ship positions for drawing. Uses smooth floating-point math at a
 * fractional tick, so motion is fluid between simulation ticks. The
 * simulation uses lookup tables instead; the tiny difference is invisible.
 */
const BODIES = new Map(SOLAR_SYSTEM.map((b) => [b.id, b]));
const TURN = Math.PI * 2;
const ANGLE_UNITS = 4096;

export interface Vec {
  x: number;
  y: number;
}

export function bodyPos(id: string, tick: number): Vec {
  const body = BODIES.get(id);
  return body ? positionOf(body, tick) : { x: 0, y: 0 };
}

function positionOf(body: BodyDef, tick: number): Vec {
  const center = body.parent ? positionOf(BODIES.get(body.parent)!, tick) : { x: 0, y: 0 };
  if (body.orbitTicks === 0) return center;
  const angle = (body.phase / ANGLE_UNITS) * TURN + (tick / body.orbitTicks) * TURN;
  return {
    x: center.x + body.orbitRadius * Math.cos(angle),
    y: center.y + body.orbitRadius * Math.sin(angle),
  };
}

/** Point along a flat [x0, y0, x1, y1, …] polyline at fraction f (0–1) of its length. */
export function alongPath(points: readonly number[], f: number): Vec {
  const n = points.length / 2;
  if (n === 0) return { x: 0, y: 0 };
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < n; i++) {
    const len = Math.hypot(
      points[i * 2]! - points[i * 2 - 2]!,
      points[i * 2 + 1]! - points[i * 2 - 1]!,
    );
    lengths.push(len);
    total += len;
  }
  let remaining = Math.min(1, Math.max(0, f)) * total;
  for (let i = 1; i < n; i++) {
    const len = lengths[i - 1]!;
    if (remaining <= len || i === n - 1) {
      const t = len === 0 ? 0 : Math.min(1, remaining / len);
      return {
        x: points[i * 2 - 2]! + (points[i * 2]! - points[i * 2 - 2]!) * t,
        y: points[i * 2 - 1]! + (points[i * 2 + 1]! - points[i * 2 - 1]!) * t,
      };
    }
    remaining -= len;
  }
  return { x: points[0]!, y: points[1]! };
}

/** A point on a path and the direction of travel there (a unit vector). */
export interface PathSample {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/**
 * Samples ship routes without allocating: each route's cumulative segment
 * lengths are measured once and kept by ship id. Hundreds of Freighters are
 * in flight late in a match, and measuring every route every frame showed up
 * in profiles of the system view.
 */
export class PathCache {
  private readonly lengths = new Map<number, Float64Array>();

  /** Writes the point at fraction f (0–1) of ship `id`'s route into `out`. */
  sample(id: number, points: readonly number[], f: number, out: PathSample): PathSample {
    const n = points.length / 2;
    if (n < 2) {
      out.x = points[0] ?? 0;
      out.y = points[1] ?? 0;
      out.dx = 0;
      out.dy = -1;
      return out;
    }
    let cum = this.lengths.get(id);
    if (!cum) {
      cum = new Float64Array(n);
      for (let i = 1; i < n; i++) {
        cum[i] =
          cum[i - 1]! +
          Math.hypot(points[i * 2]! - points[i * 2 - 2]!, points[i * 2 + 1]! - points[i * 2 - 1]!);
      }
      this.lengths.set(id, cum);
    }
    const total = cum[n - 1]!;
    const d = Math.min(1, Math.max(0, f)) * total;
    // Binary search for the segment holding distance d.
    let lo = 1;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! < d) lo = mid + 1;
      else hi = mid;
    }
    const len = cum[lo]! - cum[lo - 1]!;
    const t = len === 0 ? 0 : (d - cum[lo - 1]!) / len;
    const ax = points[lo * 2 - 2]!;
    const ay = points[lo * 2 - 1]!;
    const sx = points[lo * 2]! - ax;
    const sy = points[lo * 2 + 1]! - ay;
    out.x = ax + sx * t;
    out.y = ay + sy * t;
    out.dx = len === 0 ? 0 : sx / len;
    out.dy = len === 0 ? -1 : sy / len;
    return out;
  }

  /** Forgets ships that are no longer in flight. */
  prune(alive: (id: number) => boolean): void {
    for (const id of this.lengths.keys()) if (!alive(id)) this.lengths.delete(id);
  }

  get size(): number {
    return this.lengths.size;
  }
}
