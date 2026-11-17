import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FactionId, GridId } from "../core";
import { createWorld } from "../core";
import { BALANCE } from "../data/balance";
import { LANDABLE_BODIES } from "../data/bodies";
import type { MatchInit, WorkerMessage } from "../shared/messages";
import type { HostEnv } from "./simHost";
import { botHomes, SimHost } from "./simHost";

/** A host wired to the real map files on disk, with a manual clock. */
function testHost() {
  const posted: WorkerMessage[] = [];
  const env: HostEnv = {
    post: (message) => posted.push(message),
    loadFile: (path) =>
      Promise.resolve(
        new Uint8Array(readFileSync(new URL(`../../public/${path}`, import.meta.url))),
      ),
    setInterval: () => 1,
    clearInterval: () => undefined,
  };
  return { host: new SimHost(env), posted };
}

async function started(botCount = 20) {
  const t = testHost();
  t.host.handle({
    type: "start",
    setup: { seed: 9, mapId: "sol", botCount, playerName: "Tester", difficulty: "normal" },
  });
  for (let i = 0; i < 50 && !t.posted.some((m) => m.type === "init"); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const init = t.posted.find((m) => m.type === "init")?.init as MatchInit;
  expect(init).toBeDefined();
  return { ...t, init };
}

/** First plains tile on the given grid. */
function landTile(init: MatchInit, grid: number): number {
  const tile = init.grids[grid]!.terrain.indexOf(2);
  expect(tile).toBeGreaterThanOrEqual(0);
  return tile;
}

describe("SimHost", () => {
  it("starts a solar-system match with a map for every landable body", async () => {
    const { init } = await started();
    expect(init.playerId).toBe(1);
    expect(init.grids.map((g) => g.bodyId)).toEqual(LANDABLE_BODIES.map((b) => b.id));
    const earth = init.grids.find((g) => g.bodyId === "earth")!;
    expect([earth.width, earth.height]).toEqual([800, 386]);
    expect(init.factions.filter((f) => f.kind === "bot")).toHaveLength(20);
    expect(init.spawnPhaseTicks).toBeGreaterThan(0);
  });

  it("adds the difficulty's nations and colonies, colonies allied with home", async () => {
    const { init } = await started();
    const nations = init.factions.filter((f) => f.kind === "nation");
    const colonies = nations.filter((f) => f.homeId !== undefined);
    expect(nations.length - colonies.length).toBe(12);
    expect(colonies.length).toBeGreaterThan(0);
    for (const c of colonies) {
      const pairs = init.diplomacy.alliances;
      const allied = pairs.some(
        (_, i) =>
          i % 2 === 0 &&
          [pairs[i], pairs[i + 1]].includes(c.id) &&
          [pairs[i], pairs[i + 1]].includes(c.homeId),
      );
      expect(allied, c.name).toBe(true);
    }
    expect(init.difficulty).toBe("normal");
  });

  it("posts a delta every tick and applies the player's commands", async () => {
    const { host, posted, init } = await started();
    const mars = init.grids.findIndex((g) => g.bodyId === "mars");
    host.handle({
      type: "command",
      command: {
        type: "spawn",
        faction: 1 as FactionId,
        grid: mars as GridId,
        tile: landTile(init, mars),
      },
    });
    host.step();
    const ticks = posted.filter((m) => m.type === "tick");
    expect(ticks).toHaveLength(1);
    const delta = ticks[0]!.type === "tick" ? ticks[0]!.delta : null;
    expect(delta!.tick).toBe(1);
    expect(delta!.stats[4]).toBeGreaterThan(0); // the player's tile count
  });

  it("ignores commands for factions other than the player", async () => {
    const { host, posted } = await started();
    host.handle({
      type: "command",
      command: { type: "setRatio", faction: 2 as FactionId, troopRatioPct: 1 },
    });
    host.step();
    expect(posted.filter((m) => m.type === "tick")).toHaveLength(1);
  });

  it("starts the tutorial without nations, with a few bots and some Solars", async () => {
    const t = testHost();
    t.host.handle({
      type: "start",
      setup: {
        seed: 3,
        mapId: "sol",
        botCount: 40,
        playerName: "Tester",
        difficulty: "easy",
        tutorial: true,
      },
    });
    for (let i = 0; i < 50 && !t.posted.some((m) => m.type === "init"); i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const init = t.posted.find((m) => m.type === "init")?.init as MatchInit;
    expect(init.factions.filter((f) => f.kind === "nation")).toHaveLength(0);
    expect(init.factions.filter((f) => f.kind === "bot")).toHaveLength(BALANCE.tutorial.botCount);
    expect(init.spawnPhaseTicks).toBe(0);
    t.host.step();
    const tick = t.posted.find((m) => m.type === "tick");
    const delta = tick?.type === "tick" ? tick.delta : null;
    expect(delta!.stats[5]).toBeGreaterThanOrEqual(BALANCE.tutorial.startSolars);
  });

  it("stops posting while paused", async () => {
    const { host, posted } = await started();
    host.handle({ type: "pause", paused: true });
    host.step();
    expect(posted.filter((m) => m.type === "tick")).toHaveLength(0);
  });
});

describe("botHomes", () => {
  const world = createWorld({
    seed: 1,
    difficulty: "normal",
    bodies: [
      { width: 100, height: 100 },
      { width: 10, height: 10 },
      { width: 30, height: 30 },
    ],
  });

  it("puts one bot on every body first, then favors bodies with more land", () => {
    const homes = botHomes(world, 200, 5);
    expect(homes.slice(0, 3)).toEqual([0, 1, 2]);
    const count = (g: number) => homes.filter((h) => h === g).length;
    expect(count(0)).toBeGreaterThan(count(2));
    expect(count(2)).toBeGreaterThan(count(1));
  });

  it("is deterministic for a seed", () => {
    expect(botHomes(world, 50, 9)).toEqual(botHomes(world, 50, 9));
  });
});
