/**
 * Save/load and replays through the host, as the game uses them: a match
 * with player commands is saved halfway; loading the save and replaying the
 * command log must both reproduce the original run's hashes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Command, FactionId, GridId } from "../core";
import type { MatchInit, MatchSetup, WorkerMessage } from "../shared/messages";
import type { HostEnv } from "./simHost";
import { SimHost } from "./simHost";

const HASH_EVERY = 50;
const TICKS = 400;
const SAVE_AT = 200;

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

/** Waits until the host has posted a message of this type. */
async function waitFor<T extends WorkerMessage["type"]>(
  posted: WorkerMessage[],
  type: T,
): Promise<Extract<WorkerMessage, { type: T }>> {
  for (let i = 0; i < 500; i++) {
    const found = posted.find((m) => m.type === type);
    if (found) return found as Extract<WorkerMessage, { type: T }>;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No ${type} message`);
}

const setup: MatchSetup = {
  seed: 31337,
  mapId: "sol",
  botCount: 20,
  playerName: "Tester",
  difficulty: "normal",
};

/** The player's script: spawn on Mars, then keep attacking, change the troop ratio once. */
function commandsAt(tick: number, init: MatchInit): Command[] {
  const me = init.playerId as FactionId;
  const mars = init.grids.findIndex((g) => g.bodyId === "mars");
  const terrain = init.grids[mars]!.terrain;
  const land = (n: number) => {
    let seen = 0;
    for (let t = 0; t < terrain.length; t++) if (terrain[t]! >= 2 && seen++ === n) return t;
    return 0;
  };
  const grid = mars as GridId;
  if (tick === 0) return [{ type: "spawn", faction: me, grid, tile: land(5000) }];
  if (tick === 120) return [{ type: "setRatio", faction: me, troopRatioPct: 70 }];
  if (tick >= 110 && tick % 40 === 0) {
    return [{ type: "attack", faction: me, grid, tile: land(5000 + tick * 7), ratioPct: 40 }];
  }
  return [];
}

describe("saves and replays through the host", () => {
  it("loading a save and replaying the log give the original run's hashes", async () => {
    // The original run, saved halfway.
    const a = testHost();
    a.host.handle({ type: "start", setup });
    const init = (await waitFor(a.posted, "init")).init;
    const original = new Map<number, number>();
    let save: Uint8Array | null = null;
    for (let tick = 0; tick < TICKS; tick++) {
      for (const command of commandsAt(tick, init)) a.host.handle({ type: "command", command });
      a.host.step();
      if ((tick + 1) % HASH_EVERY === 0) original.set(tick + 1, a.host.hash());
      if (tick + 1 === SAVE_AT) {
        a.host.handle({ type: "save", requestId: 7 });
        const saved = await waitFor(a.posted, "saveData");
        expect(saved.requestId).toBe(7);
        expect(saved.summary.tick).toBe(SAVE_AT);
        save = saved.data;
      }
    }
    a.host.handle({ type: "getReplay", requestId: 8 });
    const replay = (await waitFor(a.posted, "replayData")).data;
    // The player took land, so the replay has something to reproduce.
    const lastTick = a.posted.filter((m) => m.type === "tick").at(-1);
    expect(lastTick?.type === "tick" && lastTick.delta.stats[4]).toBeGreaterThan(50);

    // Loading the save: same hashes from there on, with the player's commands continuing.
    const b = testHost();
    b.host.handle({ type: "load", data: save! });
    const loaded = (await waitFor(b.posted, "init")).init;
    expect(loaded.tick).toBe(SAVE_AT);
    expect(loaded.playerId).toBe(init.playerId);
    expect(b.host.hash()).toBe(original.get(SAVE_AT));
    for (let tick = SAVE_AT; tick < TICKS; tick++) {
      for (const command of commandsAt(tick, init)) b.host.handle({ type: "command", command });
      b.host.step();
      if ((tick + 1) % HASH_EVERY === 0)
        expect(b.host.hash(), `tick ${tick + 1}`).toBe(original.get(tick + 1));
    }

    // Watching the replay: same hashes all the way, and it ends in sync.
    const c = testHost();
    c.host.handle({ type: "watchReplay", data: replay });
    expect((await waitFor(c.posted, "init")).init.replay).toBe(true);
    for (let tick = 0; tick < TICKS; tick++) {
      // Commands from the client are ignored while a replay plays.
      c.host.handle({
        type: "command",
        command: { type: "setRatio", faction: init.playerId as FactionId, troopRatioPct: 5 },
      });
      c.host.step();
      if ((tick + 1) % HASH_EVERY === 0)
        expect(c.host.hash(), `tick ${tick + 1}`).toBe(original.get(tick + 1));
    }
    expect(await waitFor(c.posted, "replayEnded")).toEqual({ type: "replayEnded", inSync: true });

    // A save made after loading keeps the whole replay log (the commands from before the save too).
    b.host.handle({ type: "getReplay", requestId: 9 });
    const replayAfterLoad = (await waitFor(b.posted, "replayData")).data;
    expect(new TextDecoder().decode(replayAfterLoad)).toBe(new TextDecoder().decode(replay));
  }, 60_000);

  it("reports a damaged save as an error instead of starting", async () => {
    const t = testHost();
    t.host.handle({ type: "load", data: new Uint8Array([1, 2, 3]) });
    const error = await waitFor(t.posted, "error");
    expect(error.message).toMatch(/Save could not be loaded/);
    expect(t.posted.some((m) => m.type === "init")).toBe(false);
  });
});
