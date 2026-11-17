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
