import { BALANCE } from "../../data/balance";
import { queueCommand } from "../commands/applyCommands";
import type { Command } from "../commands/commands";
import { isOwnableTerrain } from "../grid/terrain";
import type { FactionId, GridId } from "../ids";
import { NEUTRAL } from "../ids";
import { Rng } from "../math/rng";
import { buildCost, tooCloseToStructure } from "../systems/structures";
import { firstOwned, KIND_CODE } from "../world/structureIndex";
import type { System } from "../tick";
import { refGrid, refTile } from "../world/tileRef";
import type { BotState, Faction, World } from "../world/world";
import { addFaction, gridOf, inSpawnPhase, isCorona, troopPool } from "../world/world";

const B = BALANCE.bot;

/** RNG stream ids for bots start here (stream = base + faction id). */
const BOT_STREAM_BASE = 1_000;

/** Scratch buffer for neighbor lookups; holds no state between calls. */
const scratch = new Int32Array(8);

/**
 * Adds a bot faction. Its first decision lands on a tick spread by its id, so
 * a crowd of bots doesn't all think on the same tick.
 */
export function addBot(world: World, name: string, homeGrid: GridId | null = null): Faction {
  const faction = addFaction(world, name, "bot");
  world.bots.push({
    faction: faction.id,
    homeGrid,
    rng: Rng.fromSeed(world.config.seed, BOT_STREAM_BASE + faction.id),
    nextDecisionTick: world.tick + (faction.id % B.decisionIntervalTicks),
  });
  return faction;
}

/**
 * Runs every bot whose decision tick has come. Bots act only through commands,
 * queued for the next tick, exactly like a human player.
 */
export const aiSystem: System = (world, ctx) => {
  for (const bot of world.bots) {
    if (bot.nextDecisionTick > ctx.tick) continue;
    bot.nextDecisionTick =
      ctx.tick + B.decisionIntervalTicks + bot.rng.nextInt(B.decisionJitterTicks + 1);
    const faction = world.factions[bot.faction]!;
    if (!faction.alive) continue;
    const command = faction.hasSpawned ? decide(world, bot, faction) : chooseSpawn(world, bot);
    if (command) queueCommand(world, command, ctx.tick + 1);
  }
};

/**
 * Sometimes builds on a random own tile: a first Spaceport (which starts
 * trade), or a Habitat; on a Corona tile, a Solar Siphon. Never a second Spaceport.
 */
function maybeBuild(world: World, bot: BotState, faction: Faction): Command | null {
  const ref = faction.tiles[bot.rng.nextInt(faction.tiles.length)]!;
  const grid = refGrid(ref);
  const tile = refTile(ref);
  if (tooCloseToStructure(world, grid, tile)) return null;
  if (isCorona(world, grid)) {
    const kind = "solarSiphon";
    if (!bot.rng.chance(B.buildSiphonChancePct, 100)) return null;
    if (faction.solars < buildCost(world, bot.faction, kind, grid)) return null;
    return { type: "build", faction: bot.faction, kind, grid, tile };
  }
  const hasPort = faction.owned[KIND_CODE.spaceport]! > 0;
  for (const kind of ["spaceport", "habitat"] as const) {
    if (kind === "spaceport" && hasPort) continue;
    const chance = kind === "spaceport" ? B.buildPortChancePct : B.buildHabitatChancePct;
    if (!bot.rng.chance(chance, 100)) continue;
    if (faction.solars < buildCost(world, bot.faction, kind, grid)) continue;
    return { type: "build", faction: bot.faction, kind, grid, tile };
  }
  return maybeSendSunBase(world, bot, faction);
}

/**
 * Sometimes sends a Sun Base ship from its finished Spaceport to a random
 * empty Corona tile, if it has no Sun Base yet and can afford one.
 */
function maybeSendSunBase(world: World, bot: BotState, faction: Faction): Command | null {
  const corona = world.corona;
  if (!corona || !bot.rng.chance(B.sunBaseChancePct, 100)) return null;
  if (faction.owned[KIND_CODE.sunBase]! > 0) return null;
  const port = firstOwned(world, bot.faction, "spaceport", true)?.id ?? -1;
  for (const ship of world.ships) {
    if (ship.owner === bot.faction && ship.kind === "sunBaseShip") return null;
  }
  if (port < 0 || faction.solars < buildCost(world, bot.faction, "sunBase", corona.id)) {
    return null;
  }
  const tile = bot.rng.nextInt(corona.size);
  if (corona.owner[tile] !== NEUTRAL || tooCloseToStructure(world, corona.id, tile)) return null;
  const ratioPct = bot.rng.nextRange(B.expandRatioMinPct, B.expandRatioMaxPct);
  return {
    type: "launch",
    faction: bot.faction,
    kind: "sunBaseShip",
    from: port,
    toGrid: corona.id,
    toTile: tile,
    ratioPct,
  };
}

/** Picks a random free, ownable tile on the bot's home body (or a random body). */
function chooseSpawn(world: World, bot: BotState): Command | null {
  for (let i = 0; i < B.spawnAttempts; i++) {
    const grid = world.grids[bot.homeGrid ?? bot.rng.nextInt(world.grids.length)]!;
    const tile = bot.rng.nextInt(grid.size);
    if (grid.isUsable(tile) && isOwnableTerrain(grid.terrain[tile]!) && grid.owner[tile] === 0) {
      return { type: "spawn", faction: bot.faction, grid: grid.id, tile };
    }
  }
  return null; // crowded: try again next decision
}

/**
 * The dumb bot: samples a few of its own tiles to see what it borders, then
 * mostly grabs neutral land, sometimes attacks a clearly weaker neighbor, and
 * never attacks anyone stronger.
 */
function decide(world: World, bot: BotState, faction: Faction): Command | null {
  if (inSpawnPhase(world) || faction.tiles.length === 0) return null;
  const build = maybeBuild(world, bot, faction);
  if (build) return build;
  if (faction.troops < B.minTroops) return null;
  let running = 0;
  for (const a of world.attacks) if (a.attacker === bot.faction) running++;
  if (running >= B.maxRunningAttacks) return null;

  let neutral: { grid: GridId; tile: number } | null = null;
  let weak: { grid: GridId; tile: number; troops: number } | null = null;

  for (let s = 0; s < B.sampleTiles; s++) {
    const ref = faction.tiles[bot.rng.nextInt(faction.tiles.length)]!;
    const grid = gridOf(world, refGrid(ref))!;
    // No troops on this front (the Corona has its own pool): look elsewhere.
    if (troopPool(world, faction, grid.id) < B.minCoronaTroops) continue;
    const n = grid.neighbors(refTile(ref), scratch);
    for (let i = 0; i < n; i++) {
      const tile = scratch[i]!;
      const owner = grid.owner[tile]! as FactionId;
      if (owner === bot.faction) continue;
      if (owner === NEUTRAL) {
        if (!neutral && isOwnableTerrain(grid.terrain[tile]!)) neutral = { grid: grid.id, tile };
        continue;
      }
      const other = world.factions[owner]!;
      const isWeaker = other.troops * 100 < faction.troops * B.weakerThanPct;
      if (other.alive && isWeaker && (!weak || other.troops < weak.troops)) {
        weak = { grid: grid.id, tile, troops: other.troops };
      }
    }
  }

  const attackWeak = weak && (!neutral || bot.rng.chance(B.attackChancePct, 100));
  if (weak && attackWeak) {
    const ratioPct = bot.rng.nextRange(B.attackRatioMinPct, B.attackRatioMaxPct);
    return { type: "attack", faction: bot.faction, grid: weak.grid, tile: weak.tile, ratioPct };
  }
  if (neutral) {
    const ratioPct = bot.rng.nextRange(B.expandRatioMinPct, B.expandRatioMaxPct);
    return {
      type: "attack",
      faction: bot.faction,
      grid: neutral.grid,
      tile: neutral.tile,
      ratioPct,
    };
  }
  return null;
}
