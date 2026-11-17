import { describe, expect, it } from "vitest";
import { BALANCE } from "../../data/balance";
import { DIFFICULTIES } from "../../data/difficulty";
import { addNation } from "../ai/nation";
import { queueCommand } from "../commands/applyCommands";
import type { Command } from "../commands/commands";
import { validateCommand } from "../commands/validate";
import { drainDelta, trackChanges } from "../delta/delta";
import type { FactionId, GridId } from "../ids";
import { attack, countOwned, faction, runWith, spawn, testWorld } from "../testUtils";
import { runTick, runTicks } from "../tick";
import { hasEmbargo, hasRequest, isAllied, isTraitor } from "../world/diplomacy";
import { eliminate } from "../world/territory";
import type { World } from "../world/world";
import { addFaction, createWorld } from "../world/world";

const F = (n: number) => n as FactionId;

const ally = (f: number, other: number, action: "request" | "accept" | "break"): Command => ({
  type: "ally",
  faction: F(f),
  other: F(other),
  action,
});

function rejected(world: World, ...commands: Command[]): string[] {
  return runWith(world, ...commands).rejected.map((r) => r.reason);
}

/** Two spawned factions side by side on a 40×40 map, three more not spawned. */
function neighbors(): World {
  const world = testWorld(20, 5);
  runWith(world, spawn(world, 1, 10, 20), spawn(world, 2, 19, 20));
  return world;
}

function allied(world: World, a: number, b: number): void {
  runWith(world, ally(a, b, "request"));
  runWith(world, ally(b, a, "accept"));
  expect(isAllied(world, a, b)).toBe(true);
}

describe("alliances", () => {
  it("request then accept makes two factions allies; the request expires otherwise", () => {
    const world = neighbors();
    expect(rejected(world, ally(1, 2, "request"))).toEqual([]);
    expect(hasRequest(world, 1, 2)).toBe(true);
    expect(rejected(world, ally(1, 2, "request"))).toEqual(["already asked"]);
    expect(rejected(world, ally(1, 2, "accept"))).toEqual(["no request to accept"]);
    runWith(world, ally(2, 1, "accept"));
    expect(isAllied(world, 1, 2)).toBe(true);
    expect(isAllied(world, 2, 1)).toBe(true);
    expect(rejected(world, ally(1, 2, "request"))).toEqual(["already allies"]);

    runWith(world, ally(3, 4, "request"));
    runTicks(world, BALANCE.diplomacy.requestTicks + 1);
    expect(rejected(world, ally(4, 3, "accept"))).toEqual(["no request to accept"]);
  });

  it("two requests meet: asking someone who asked you accepts at once", () => {
    const world = neighbors();
    runWith(world, ally(1, 2, "request"));
    runWith(world, ally(2, 1, "request"));
    expect(isAllied(world, 1, 2)).toBe(true);
  });

  it("rejects diplomacy with yourself, unknown or eliminated factions", () => {
    const world = neighbors();
    expect(validateCommand(world, ally(1, 1, "request"))).toBe("that's you");
    expect(validateCommand(world, ally(1, 99, "request"))).toBe("unknown faction");
    expect(validateCommand(world, ally(1, 0, "request"))).toBe("unknown faction");
    expect(validateCommand(world, ally(1, 2, "break"))).toBe("not allies");
    eliminate(world, F(3));
    expect(validateCommand(world, ally(1, 3, "request"))).toBe("faction is eliminated");
    const bad = { ...ally(1, 2, "request"), action: "marry" } as unknown as Command;
    expect(validateCommand(world, bad)).toBe("unknown ally action");
  });

  it("allies can't attack each other, and running attacks end when they ally", () => {
    const world = neighbors();
    runWith(world, attack(world, 1, 19, 20, 50));
    runTicks(world, 2);
    const taken = countOwned(world, 1);
    expect(world.attacks.some((a) => a.attacker === 1 && a.target === 2)).toBe(true);
    allied(world, 1, 2);
    runTick(world);
    expect(world.attacks.some((a) => a.attacker === 1 && a.target === 2)).toBe(false);
    expect(countOwned(world, 1)).toBeLessThanOrEqual(taken + 40);
    expect(rejected(world, attack(world, 1, 23, 20))).toEqual(["can't attack an ally"]);
  });

  it("breaking an alliance marks a traitor whose attacks cost more", () => {
    const cost = (traitor: boolean) => {
      const world = neighbors();
      allied(world, 1, 2);
      if (traitor) runWith(world, ally(1, 2, "break"));
      else world.diplomacy.alliances.clear();
      expect(isAllied(world, 1, 2)).toBe(false);
      expect(isTraitor(world, 1)).toBe(traitor);
      const before = faction(world, 2).tileCount;
      runWith(world, attack(world, 1, 19, 20, 30));
      runTicks(world, 30);
      return before - faction(world, 2).tileCount;
    };
    // The same troops take fewer tiles for a traitor.
    expect(cost(true)).toBeLessThan(cost(false));
  });

  it("the traitor mark wears off", () => {
    const world = neighbors();
    allied(world, 1, 2);
    runWith(world, ally(2, 1, "break"));
    expect(isTraitor(world, 2)).toBe(true);
    runTicks(world, BALANCE.diplomacy.traitorTicks);
    expect(isTraitor(world, 2)).toBe(false);
  });
});

describe("gifts", () => {
  it("move Solars and troops to an ally, and only to an ally", () => {
    const world = neighbors();
    const gift = (solars: number, troops: number): Command => ({
      type: "gift",
      faction: F(1),
      to: F(2),
      solars,
      troops,
    });
    expect(rejected(world, gift(100, 0))).toEqual(["gifts go to allies"]);
    allied(world, 1, 2);
    const a = faction(world, 1);
    expect(rejected(world, gift(a.solars + 1, 0))).toEqual(["not enough Solars"]);
    expect(rejected(world, gift(0, 0))).toEqual(["gift must be whole Solars and troops"]);
    expect(rejected(world, gift(-5, 10))).toEqual(["gift must be whole Solars and troops"]);
    // Compare one tick with and without the gift.
    const world2 = neighbors();
    allied(world2, 1, 2);
    runWith(world, gift(200, 300));
    runTick(world2);
    // Within a little income: moving troops shifts the troop/worker split a bit.
    expect(Math.abs(faction(world, 1).solars - (faction(world2, 1).solars - 200))).toBeLessThan(20);
    expect(Math.abs(faction(world, 2).solars - (faction(world2, 2).solars + 200))).toBeLessThan(20);
    expect(faction(world, 1).troops).toBeLessThan(faction(world2, 1).troops - 200);
    expect(faction(world, 2).troops).toBeGreaterThan(faction(world2, 2).troops + 200);
  });
});

describe("embargoes", () => {
  /** Two factions with finished Spaceports on Earth and Mars. */
  function traders(): World {
    const world = createWorld({
      seed: 3,
      difficulty: "normal",
      bodies: ["earth", "mars"].map((bodyId) => ({ width: 40, height: 40, bodyId })),
    });
    for (const g of [0, 1]) {
      const f = addFaction(world, `F${g + 1}`, "bot").id;
      queueCommand(world, { type: "spawn", faction: f, grid: g as GridId, tile: 820 });
    }
    runTick(world);
    for (const f of world.factions) f.solars = 100_000;
    for (const g of [0, 1]) {
      queueCommand(world, {
        type: "build",
        faction: F(g + 1),
        kind: "spaceport",
        grid: g as GridId,
        tile: 820,
      });
    }
    runTicks(world, BALANCE.structures.spaceport.buildTicks + 1);
    return world;
  }

  it("stop trade between the two sides until lifted", () => {
    const world = traders();
    runWith(world, { type: "embargo", faction: F(2), other: F(1), on: true });
    expect(hasEmbargo(world, 1, 2)).toBe(true);
    const before = world.factions.map((f) => f.solars);
    // Freighters already in flight are not paid either.
    let launched = 0;
    for (let t = 0; t < 1_500; t++) {
      const ctx = runTick(world);
      expect(ctx.rejected).toEqual([]);
      launched += world.ships.filter((s) => s.launchTick === world.tick - 1).length;
    }
    expect(launched).toBe(0);
    const earned = world.factions[1]!.solars - before[1]!;

    runWith(world, { type: "embargo", faction: F(2), other: F(1), on: false });
    expect(hasEmbargo(world, 1, 2)).toBe(false);
    for (let t = 0; t < 1_500; t++) runTick(world);
    expect(world.factions[1]!.solars - before[1]!).toBeGreaterThan(earned * 2);
  });
});

describe("colonies", () => {
  function homeAndColony(): World {
    const world = testWorld(20, 0);
    const profile = DIFFICULTIES.normal.profiles[1];
    const options = { nationId: "usa", tier: 1 as const, profile, homeGrid: 0 as GridId };
    const home = addNation(world, "United States", { ...options, spawnTile: 20 * 40 + 10 });
    addNation(world, "USA Mars Colony", { ...options, spawnTile: 20 * 40 + 30, home: home.id });
    addFaction(world, "Rival", "bot");
    return world;
  }

  it("start allied with their home nation", () => {
    const world = homeAndColony();
    expect(isAllied(world, 1, 2)).toBe(true);
    expect(world.nations[1]!.home).toBe(1);
  });

  it("become independent when the alliance breaks", () => {
    const world = homeAndColony();
    trackChanges(world);
    runWith(world, ally(1, 2, "break"));
    expect(world.nations[1]!.home).toBe(0);
    expect(drainDelta(world).events).toContainEqual({ kind: "independent", colony: 2, home: 1 });
  });

  it("become independent when the home nation dies", () => {
    const world = homeAndColony();
    runTicks(world, 40); // both spawn
    eliminate(world, F(1));
    runTicks(world, 2 * DIFFICULTIES.normal.profiles[1].reactionTicks);
    expect(world.nations[1]!.home).toBe(0);
  });
});

describe("signals", () => {
  it("are validated and reach the other side as events", () => {
    const world = neighbors();
    trackChanges(world);
    const signal = (s: string, about = 0): Command =>
      ({ type: "signal", faction: F(1), to: F(2), signal: s, about: F(about) }) as Command;
    expect(rejected(world, signal("dance"))).toEqual(["unknown signal"]);
    expect(rejected(world, signal("attack", 77))).toEqual(["unknown faction to signal about"]);
    drainDelta(world);
    runWith(world, signal("peace"));
    expect(drainDelta(world).events).toEqual([
      { kind: "signal", from: 1, to: 2, signal: "peace", about: 0 },
    ]);
  });

  it("an ally's call to attack points a nation at the target", () => {
    const world = testWorld(20, 1);
    const n = addNation(world, "Japan", {
      nationId: "japan",
      tier: 2,
      profile: DIFFICULTIES.normal.profiles[2],
      homeGrid: 0 as GridId,
      spawnTile: 800 + 20,
    });
    addFaction(world, "Target", "bot");
    const call: Command = {
      type: "signal",
      faction: F(1),
      to: n.id,
      signal: "attack",
      about: F(3),
    };
    runWith(world, call);
    expect(world.nations[0]!.focus).toBe(0); // not allies yet: ignored
    allied(world, 1, n.id);
    runWith(world, call);
    expect(world.nations[0]!.focus).toBe(3);
  });
});

describe("shared victory", () => {
  it("the last factions standing win together when they are all allied", () => {
    const world = testWorld(20, 3);
    runWith(world, spawn(world, 1, 5, 5), spawn(world, 2, 30, 30), spawn(world, 3, 5, 30));
    allied(world, 1, 2);
    eliminate(world, F(3));
    runTick(world);
    expect([1, 2]).toContain(world.winner);
  });

  it("no winner while someone left is not allied", () => {
    const world = testWorld(20, 3);
    runWith(world, spawn(world, 1, 5, 5), spawn(world, 2, 30, 30), spawn(world, 3, 5, 30));
    allied(world, 1, 2);
    runTick(world);
    expect(world.winner).toBeNull();
  });
});
