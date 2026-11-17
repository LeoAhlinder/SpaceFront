import { describe, expect, it } from "vitest";
import { BALANCE } from "../../data/balance";
import { isOwnableTerrain } from "../grid/terrain";
import type { FactionId } from "../ids";
import { NEUTRAL } from "../ids";
import { grid0, runWith, spawn } from "../testUtils";
import { runTick, runTicks } from "../tick";
import { setOwner } from "../world/territory";
import { refGrid, refTile } from "../world/tileRef";
import type { World } from "../world/world";
import { addFaction, createWorld } from "../world/world";
import { addBot, aiSystem } from "./bot";

function emptyWorld(half = 20, seed = 3): World {
  return createWorld({
    seed,
    difficulty: "normal",
    bodies: [{ width: 2 * half, height: 2 * half }],
  });
}

/** Checks that every faction's tile list, tile count and the owner map agree. */
function expectTileListsConsistent(world: World): void {
  for (const f of world.factions.slice(1)) {
    expect(f.tiles.length).toBe(f.tileCount);
    f.tiles.forEach((ref, slot) => {
      expect(world.grids[refGrid(ref)]!.owner[refTile(ref)]).toBe(f.id);
      expect(world.tileSlots[refGrid(ref)]![refTile(ref)]).toBe(slot);
    });
  }
}

describe("bots", () => {
  it("spawn on their own within the first decision window, then expand", () => {
    const world = emptyWorld();
    const bot = addBot(world, "Bot");
    runTicks(world, BALANCE.bot.decisionIntervalTicks + 2);
    expect(bot.hasSpawned).toBe(true);
    const spawned = bot.tileCount;
    runTicks(world, 400);
    expect(bot.tileCount).toBeGreaterThan(spawned * 2);
    expectTileListsConsistent(world);
  });

  it("never attack a stronger neighbor, but do attack a clearly weaker one", () => {
    const world = emptyWorld(20);
    const grid = grid0(world);
    const player = addFaction(world, "Player", "player");
    const bot = addBot(world, "Bot");
    runWith(world, spawn(world, player.id, 10, 20), spawn(world, bot.id, 30, 20));
    // Hand every other ownable tile to the player, so the bot has no neutral land left.
    for (let t = 0; t < grid.size; t++) {
      if (grid.owner[t] === NEUTRAL && isOwnableTerrain(grid.terrain[t]!)) {
        setOwner(world, grid, t, player.id);
      }
    }

    const botCommands = (ticks: number) => {
      const found = [];
      for (let i = 0; i < ticks; i++) {
        runTick(world, [aiSystem]);
        found.push(...world.pending.take(world.tick).filter((c) => c.faction === bot.id));
      }
      return found;
    };

    player.troops = 1_000_000;
    bot.troops = 5_000;
    expect(botCommands(200)).toEqual([]);

    player.troops = 100;
    const commands = botCommands(50);
    expect(commands.length).toBeGreaterThan(0);
    for (const c of commands) {
      expect(c.type).toBe("attack");
      if (c.type === "attack") expect(grid.owner[c.tile]).toBe(player.id);
    }
  });

  it("spread their decisions across ticks", () => {
    const world = emptyWorld(40);
    for (let i = 0; i < 100; i++) addBot(world, `Bot ${i}`);
    const decidedAt = new Map<FactionId, number[]>();
    for (let t = 0; t < 60; t++) {
      const before = world.bots.map((b) => b.nextDecisionTick);
      runTick(world, [aiSystem]);
      world.bots.forEach((b, i) => {
        if (b.nextDecisionTick !== before[i]) {
          decidedAt.set(b.faction, [...(decidedAt.get(b.faction) ?? []), t]);
        }
      });
    }
    const perTick = new Map<number, number>();
    for (const ticks of decidedAt.values()) {
      for (const t of ticks) perTick.set(t, (perTick.get(t) ?? 0) + 1);
    }
    expect(decidedAt.size).toBe(100);
    for (const ticks of decidedAt.values()) expect(ticks[0]).toBeLessThan(10);
    expect(Math.max(...perTick.values())).toBeLessThanOrEqual(20);
  });

  it("fight each other and keep tile lists in sync", () => {
    const world = emptyWorld(30, 11);
    for (let i = 0; i < 12; i++) addBot(world, `Bot ${i}`);
    runTicks(world, 2_000);
    const alive = world.factions.filter((f) => f.alive);
    const owned = alive.reduce((sum, f) => sum + f.tileCount, 0);
    expect(owned).toBeGreaterThan(grid0(world).size * 0.9);
    expectTileListsConsistent(world);
  });
});
