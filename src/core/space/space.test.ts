import { describe, expect, it } from "vitest";
import { BALANCE } from "../../data/balance";
import { bodyById, LANDABLE_BODIES } from "../../data/bodies";
import type { Point } from "./space";
import { bodyPosition, distance, isqrt, pathLength, planFlight } from "./space";

/** Closest distance from `c` to the segment p–q (floats are fine in tests). */
function segmentClearance(p: Point, q: Point, c: Point): number {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - p.x) * dx + (c.y - p.y) * dy) / len2));
  return Math.hypot(p.x + dx * t - c.x, p.y + dy * t - c.y);
}

describe("bodyPosition", () => {
  it("puts the Sun at the origin and Earth on its orbit", () => {
    expect(bodyPosition("sun", 12_345)).toEqual({ x: 0, y: 0 });
    expect(bodyPosition("earth", 0)).toEqual({ x: 2500, y: 0 });
    const quarter = bodyPosition("earth", 9_000 / 4);
    expect(Math.abs(quarter.x)).toBeLessThanOrEqual(1);
    expect(quarter.y).toBeGreaterThanOrEqual(2499);
  });

  it("keeps moons on orbit around their moving parent", () => {
    for (const tick of [0, 777, 5_000, 40_000]) {
      const moon = bodyPosition("moon", tick);
      const earth = bodyPosition("earth", tick);
      expect(Math.abs(distance(moon, earth) - 200)).toBeLessThanOrEqual(1);
    }
  });

  it("is a pure function of the tick", () => {
    expect(bodyPosition("titan", 31_337)).toEqual(bodyPosition("titan", 31_337));
  });

  it("rejects unknown bodies", () => {
    expect(() => bodyPosition("pluto", 0)).toThrow("Unknown body");
  });
});

describe("isqrt", () => {
  it("is exact", () => {
    for (const n of [0, 1, 2, 3, 4, 15, 16, 17, 99_999_999, 100_000_000, 2 ** 52 - 1]) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1) * (r + 1) > n).toBe(true);
    }
  });
});

describe("planFlight", () => {
  it("lands where the target is at arrival, at the lander's speed", () => {
    const flight = planFlight("earth", "mars", 1_000);
    const end = flight.waypoints[flight.waypoints.length - 1]!;
    expect(end).toEqual(bodyPosition("mars", flight.arriveTick));
    expect(flight.waypoints[0]).toEqual(bodyPosition("earth", 1_000));
    const ticks = flight.arriveTick - 1_000;
    expect(ticks).toBeGreaterThanOrEqual(BALANCE.ships.minFlightTicks);
    expect(ticks).toBe(Math.ceil(pathLength(flight.waypoints) / BALANCE.ships.landerSpeed));
  });

  it("goes around the Sun's heat zone, whatever the planets' positions", () => {
    const sun = { x: 0, y: 0 };
    const avoid = bodyById("sun").avoidRadius;
    let detours = 0;
    for (let tick = 0; tick < 60_000; tick += 997) {
      for (const [from, to] of [
        ["earth", "mars"],
        ["mercury", "titan"],
        ["venus", "belt"],
      ] as const) {
        const { waypoints } = planFlight(from, to, tick);
        if (waypoints.length > 2) detours++;
        for (let i = 1; i < waypoints.length; i++) {
          expect(segmentClearance(waypoints[i - 1]!, waypoints[i]!, sun)).toBeGreaterThan(
            avoid * 0.6,
          );
        }
      }
    }
    expect(detours).toBeGreaterThan(10); // the check above actually exercised detours
  });

  it("can reach every landable body from Earth", () => {
    for (const body of LANDABLE_BODIES) {
      if (body.id === "earth") continue;
      const flight = planFlight("earth", body.id, 500);
      expect(flight.arriveTick).toBeGreaterThan(500);
      expect(flight.waypoints.length).toBeGreaterThanOrEqual(2);
    }
  });
});
