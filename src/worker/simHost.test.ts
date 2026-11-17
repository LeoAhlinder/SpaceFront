import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FactionId, GridId } from "../core";
import type { MatchInit, WorkerMessage } from "../shared/messages";
import type { HostEnv } from "./simHost";
import { SimHost } from "./simHost";

/** A host wired to the real Earth files on disk, with a manual clock. */
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

async function started() {
  const t = testHost();
  t.host.handle({
    type: "start",
    setup: { seed: 9, mapId: "earth", botCount: 5, playerName: "Tester" },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const init = t.posted.find((m) => m.type === "init")?.init as MatchInit;
  return { ...t, init };
}

describe("SimHost", () => {
  it("starts a match on Earth and posts its init data", async () => {
    const { init } = await started();
    expect(init.playerId).toBe(1);
    expect(init.factions.map((f) => f.kind)).toEqual(["player", "bot", "bot", "bot", "bot", "bot"]);
    expect([init.grids[0]!.width, init.grids[0]!.height]).toEqual([800, 386]);
    expect(init.spawnPhaseTicks).toBeGreaterThan(0);
  });

  it("posts a delta every tick and applies the player's commands", async () => {
    const { host, posted, init } = await started();
    const region = 77_000; // search for a land tile near the middle of the map
    const terrain = init.grids[0]!.terrain;
    let tile = region;
    while (terrain[tile] !== 2) tile++;
    host.handle({
      type: "command",
      command: { type: "spawn", faction: 1 as FactionId, grid: 0 as GridId, tile },
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

  it("stops posting while paused", async () => {
    const { host, posted } = await started();
    host.handle({ type: "pause", paused: true });
    host.step();
    expect(posted.filter((m) => m.type === "tick")).toHaveLength(0);
  });
});
