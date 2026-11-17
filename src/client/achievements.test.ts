import { describe, expect, it } from "vitest";
import type { TickDelta } from "../core";
import type { MatchInit } from "../shared/messages";
import { ACHIEVEMENT_IDS, createAchievementTracker } from "./achievements";
import type { Platform } from "./platform/platform";
import { view } from "./store/clientStore";
import { strings } from "./ui/strings";

function fakePlatform() {
  const unlocked: string[] = [];
  const platform: Platform = {
    kind: "desktop",
    cloudSaves: false,
    saveFile: () => Promise.resolve(),
    loadFile: () => Promise.resolve(null),
    listFiles: () => Promise.resolve([]),
    deleteFile: () => Promise.resolve(),
    unlockAchievement: (id) => unlocked.push(id),
  };
  return { platform, unlocked };
}

function delta(change: Partial<TickDelta>): TickDelta {
  return {
    tick: 1,
    tiles: new Uint32Array(0),
    stats: new Float64Array(0),
    structures: [],
    shipsLaunched: [],
    shipsLanded: [],
    winner: -1,
    events: [],
    warships: new Int32Array(0),
    effects: [],
    diplomacy: null,
    ...change,
  };
}

describe("achievements", () => {
  it("every achievement has a name and description for Steam", () => {
    for (const id of ACHIEVEMENT_IDS) {
      expect(strings.achievements[id].name.length).toBeGreaterThan(0);
      expect(strings.achievements[id].description.length).toBeGreaterThan(0);
    }
  });

  it("unlocks through the platform once, and never while watching a replay", () => {
    const { platform, unlocked } = fakePlatform();
    const track = createAchievementTracker(platform);
    view.init = { playerId: 1, grids: [], difficulty: "impossible" } as unknown as MatchInit;
    view.replay = true;
    track({ type: "tick", delta: delta({ winner: 1 }) });
    expect(unlocked).toEqual([]);

    view.replay = false;
    const port = {
      id: 3,
      kind: "spaceport",
      owner: 1,
      grid: 0,
      tile: 0,
      buildTicksLeft: 0,
      readyTick: 0,
      destroyed: false,
    } as const;
    track({ type: "tick", delta: delta({ structures: [port] }) });
    track({ type: "tick", delta: delta({ structures: [port], winner: 1 }) });
    expect(unlocked).toEqual(["FIRST_SPACEPORT", "VICTORY", "VICTORY_HARD", "VICTORY_IMPOSSIBLE"]);
  });
});
