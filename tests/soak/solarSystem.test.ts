/**
 * Soak test of a full match setup: all 13 worlds and the Corona, 40 bots,
 * economy, trade, structures, ships, Sun Bases and siphons, for 3,000 ticks (5 minutes of game time). Must stay
 * deterministic and keep the simulation well inside its 100 ms tick budget.
 */
import { describe, expect, it } from "vitest";
import { hashWorld, runTick } from "../../src/core";
import { populate, solarWorld } from "../support/solarMatch";

const TICKS = 3_000;

function play(seed: number) {
  const world = solarWorld(seed);
  populate(world, 40, false);
  const hashes: number[] = [];
  let slowest = 0;
  const start = performance.now();
  for (let t = 0; t < TICKS; t++) {
    const t0 = performance.now();
    runTick(world);
    slowest = Math.max(slowest, performance.now() - t0);
    if (world.tick % 100 === 0) hashes.push(hashWorld(world));
  }
  return { world, hashes, ms: performance.now() - start, slowest };
}

describe("solar system with 40 bots for 3,000 ticks", () => {
  const first = play(77);

  it("runs twice with identical hashes", () => {
    expect(play(77).hashes).toEqual(first.hashes);
  });

  it("builds an economy: Spaceports, Habitats, trade and the Corona", () => {
    const { world } = first;
    const ports = world.structures.filter((s) => s.kind === "spaceport").length;
    const habitats = world.structures.filter((s) => s.kind === "habitat").length;
    const bases = world.structures.filter((s) => s.kind === "sunBase").length;
    const siphons = world.structures.filter((s) => s.kind === "solarSiphon").length;
    const solars = world.factions.reduce((sum, f) => sum + f.solars, 0);
    console.log(
      `solar soak: ${(first.ms / TICKS).toFixed(2)} ms/tick avg, ${first.slowest.toFixed(1)} ms slowest; ` +
        `${ports} Spaceports, ${habitats} Habitats, ${bases} Sun Bases, ${siphons} siphons, ` +
        `${world.ships.length} ships in flight, ${solars}☉ total`,
    );
    expect(ports).toBeGreaterThan(5);
    expect(habitats).toBeGreaterThan(0);
    expect(bases).toBeGreaterThan(0);
  });

  it("stays well inside the 100 ms tick budget", () => {
    expect(first.ms / TICKS).toBeLessThan(5);
  });
});
