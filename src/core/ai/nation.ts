import { BALANCE } from "../../data/balance";
import type { AiProfile } from "../../data/difficulty";
import type { NationTier } from "../../data/nations";
import { queueCommand } from "../commands/applyCommands";
import type { Command, SignalCommand } from "../commands/commands";
import { isOwnableTerrain } from "../grid/terrain";
import type { FactionId, GridId } from "../ids";
import { NEUTRAL } from "../ids";
import { Rng } from "../math/rng";
import { populationCap } from "../systems/population";
import { buildCost, tooCloseToStructure } from "../systems/structures";
import type { System } from "../tick";
import {
  alliesOf,
  hasRequest,
  isAllied,
  isTraitor,
  pairKey,
  setIndependent,
} from "../world/diplomacy";
import { refGrid, refTile } from "../world/tileRef";
import type { Faction, Structure, World } from "../world/world";
import {
  addFaction,
  coronaTiles,
  gridOf,
  inSpawnPhase,
  isCorona,
  landTiles,
  troopPool,
} from "../world/world";

const N = BALANCE.nation;

/** RNG stream ids for nations start here (stream = base + faction id). */
const NATION_STREAM_BASE = 5_000;

/** Scratch buffer for neighbor lookups; holds no state between calls. */
const scratch = new Int32Array(8);

/** AI state of one nation or colony (ARCHITECTURE.md §4.8). */
export interface NationState {
  readonly faction: FactionId;
  /** Nation id in data/nations.ts (a colony has its home nation's id). */
  readonly nationId: string;
  readonly tier: NationTier;
  /** How it weighs its options; from the difficulty and tier (data/difficulty.ts). */
  readonly profile: AiProfile;
  /** A colony's home nation while it still follows it; NEUTRAL when independent (or on Earth). */
  home: FactionId;
  /** Where it spawns: its country on Earth, or its colony's world. */
  readonly homeGrid: GridId;
  /** The country's spawn tile, or -1 for a random spot (colonies). */
  readonly spawnTile: number;
  /** The nation's own random stream, so it never shifts anyone else's numbers. */
  readonly rng: Rng;
  nextDecisionTick: number;
  /** Faction id → grudge. Betrayals leave big ones, attacks small ones; they fade slowly. */
  readonly grudges: Map<number, number>;
  /** An ally asked it to attack this faction (until focusUntil); NEUTRAL if none. */
  focus: FactionId;
  focusUntil: number;
  /** An ally that called for help, or a faction that offered peace, since its last decision. */
  helpFrom: FactionId;
  peaceFrom: FactionId;
  /** The last war it asked its allies to join, so it asks only once. */
  calledTarget: FactionId;
}

export interface NationOptions {
  readonly nationId: string;
  readonly tier: NationTier;
  readonly profile: AiProfile;
  readonly homeGrid: GridId;
  readonly spawnTile: number;
  /** For colonies: the home nation (they start allied). */
  readonly home?: FactionId;
}

/**
 * Adds a nation (or colony) faction with its AI. Its economy bonuses come
 * from the profile, its head start from its tier (colonies start like Tier 3).
 * A colony starts allied with its home nation.
 */
export function addNation(world: World, name: string, options: NationOptions): Faction {
  const { profile, tier } = options;
  const home = options.home ?? NEUTRAL;
  const faction = addFaction(world, name, "nation");
  const startTier: NationTier = home === NEUTRAL ? tier : 3;
  faction.bonus.growthPct = profile.bonus.growthPct;
  faction.bonus.incomePct = profile.bonus.incomePct;
  faction.bonus.buildTimePct = profile.bonus.buildTimePct;
  faction.bonus.spawnRadius = N.spawnRadiusBonus[startTier];
  faction.bonus.startPopPct = N.startPopPct[startTier];
  world.nations.push({
    faction: faction.id,
    nationId: options.nationId,
    tier,
    profile,
    home,
    homeGrid: options.homeGrid,
    spawnTile: options.spawnTile,
    rng: Rng.fromSeed(world.config.seed, NATION_STREAM_BASE + faction.id),
    nextDecisionTick: world.tick + (faction.id % profile.reactionTicks),
    grudges: new Map(),
    focus: NEUTRAL,
    focusUntil: 0,
    helpFrom: NEUTRAL,
    peaceFrom: NEUTRAL,
    calledTarget: NEUTRAL,
  });
  if (home !== NEUTRAL) world.diplomacy.alliances.add(pairKey(home, faction.id));
  return faction;
}

/** The AI state of a nation faction, if it is one. */
export function nationOf(world: World, faction: number): NationState | undefined {
  return world.nations.find((n) => n.faction === faction);
}

/**
 * Runs every nation whose decision tick has come. Like bots, nations act
 * only through commands queued for the next tick. Decisions are staggered by
 * faction id and jittered, so the cost per tick stays flat.
 */
export const nationSystem: System = (world, ctx) => {
  let leader: FactionId | null = null;
  for (const n of world.nations) {
    if (n.nextDecisionTick > ctx.tick) continue;
    const p = n.profile;
    n.nextDecisionTick = ctx.tick + p.reactionTicks + n.rng.nextInt((p.reactionTicks >> 1) + 1);
    const faction = world.factions[n.faction]!;
    if (!faction.alive) continue;
    if (!faction.hasSpawned) {
      const spawn = chooseSpawn(world, n);
      if (spawn) queueCommand(world, spawn, ctx.tick + 1);
      continue;
    }
    if (inSpawnPhase(world) || faction.tiles.length === 0) continue;
    leader ??= findLeader(world);
    for (const command of think(world, n, faction, leader)) {
      queueCommand(world, command, ctx.tick + 1);
    }
  }
};

/**
 * A signal from another faction reaches a nation (called when the signal
 * command applies). It only changes what the nation will consider at its
 * next decision.
 */
export function receiveSignal(world: World, command: SignalCommand): void {
  const n = nationOf(world, command.to);
  if (!n) return;
  const from = command.faction;
  switch (command.signal) {
    case "attack":
      if (!isAllied(world, from, n.faction)) return;
      if (command.about === n.faction || command.about === NEUTRAL) return;
      if (isAllied(world, n.faction, command.about)) return;
      n.focus = command.about;
      n.focusUntil = world.tick + N.focusTicks;
      return;
    case "help":
      if (isAllied(world, from, n.faction)) n.helpFrom = from;
      return;
    case "peace":
      n.peaceFrom = from;
      return;
  }
}

/**
 * The faction everyone should worry about: most land, with at least
 * leaderSharePct of all land and clearly ahead of the runner-up. NEUTRAL if
 * nobody stands out.
 */
export function findLeader(world: World): FactionId {
  let best: Faction | null = null;
  let bestLand = 0;
  let second = 0;
  for (const f of world.factions) {
    if (!f.alive || f.kind === "neutral") continue;
    const land = landTiles(world, f);
    if (land > bestLand) {
      second = bestLand;
      bestLand = land;
      best = f;
    } else if (land > second) second = land;
  }
  if (!best) return NEUTRAL;
  if (bestLand * 100 < world.ownableTiles * N.leaderSharePct) return NEUTRAL;
  if (bestLand * 100 < second * N.leaderMarginPct) return NEUTRAL;
  return best.id;
}

/** A free tile in the nation's country (near its spawn tile), or anywhere on a colony's world. */
function chooseSpawn(world: World, n: NationState): Command | null {
  const grid = world.grids[n.homeGrid]!;
  const free = (tile: number) =>
    tile >= 0 &&
    tile < grid.size &&
    grid.isUsable(tile) &&
    isOwnableTerrain(grid.terrain[tile]!) &&
    grid.owner[tile] === NEUTRAL;
  const spawn = (tile: number): Command => ({
    type: "spawn",
    faction: n.faction,
    grid: grid.id,
    tile,
  });
  if (n.spawnTile >= 0) {
    if (free(n.spawnTile)) return spawn(n.spawnTile);
    const x = n.spawnTile % grid.width;
    const y = Math.floor(n.spawnTile / grid.width);
    const r = N.spawnSearchRadius;
    for (let i = 0; i < N.spawnAttempts; i++) {
      const tx = x + n.rng.nextRange(-r, r);
      const ty = y + n.rng.nextRange(-r, r);
      if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height) continue;
      if (free(ty * grid.width + tx)) return spawn(ty * grid.width + tx);
    }
  }
  for (let i = 0; i < N.spawnAttempts; i++) {
    const tile = n.rng.nextInt(grid.size);
    if (free(tile)) return spawn(tile);
  }
  return null; // crowded: try again next decision
}

/** One option the nation is weighing, with its utility score. */
interface Option {
  score: number;
  command: Command | null;
}

/**
 * One decision: remember who attacked it, answer diplomacy, then score every
 * kind of action (expand, attack a neighbor, build, launch a lander, send a
 * Sun Base, raid a siphon) and take the best.
 */
function think(world: World, n: NationState, me: Faction, leader: FactionId): Command[] {
  const out: Command[] = [];
  remember(world, n);
  if (n.home !== NEUTRAL && !world.factions[n.home]!.alive) setIndependent(world, n.faction);
  if (n.focus !== NEUTRAL && (n.focusUntil < world.tick || !world.factions[n.focus]!.alive)) {
    n.focus = NEUTRAL;
  }

  const diplomacy = decideDiplomacy(world, n, me, leader);
  if (diplomacy) out.push(diplomacy);

  const best: Option = { score: 0, command: null };
  const consider = (score: number, command: Command | null) => {
    if (command === null) return;
    const s = score + n.rng.nextInt(N.scoreJitter + 1);
    if (s > best.score) {
      best.score = s;
      best.command = command;
    }
  };
  // Troops only go out while the population is above the profile's floor.
  const pop = me.troops + me.workers;
  const cap = populationCap(landTiles(world, me), habitatsOf(world, n.faction));
  const canSpend = pop * 100 >= cap * n.profile.spendAbovePopPct;
  if (canSpend) considerLand(world, n, me, leader, consider);
  considerBuild(world, n, me, consider);
  considerSpace(world, n, me, leader, canSpend, consider);

  const command = best.command;
  if (command) {
    out.push(command);
    callAllies(world, n, command, out);
  }
  return out;
}

/** Finished Habitats a faction owns. */
function habitatsOf(world: World, faction: number): number {
  let n = 0;
  for (const s of world.structures) {
    if (s.owner === faction && s.kind === "habitat" && s.buildTicksLeft === 0) n++;
  }
  return n;
}

/** Grudges fade a little every decision; every attack on the nation adds a small one. */
function remember(world: World, n: NationState): void {
  for (const [id, grudge] of n.grudges) {
    if (grudge <= N.grudgeDecay) n.grudges.delete(id);
    else n.grudges.set(id, grudge - N.grudgeDecay);
  }
  for (const a of world.attacks) {
    if (a.target !== n.faction) continue;
    const grudge = n.grudges.get(a.attacker) ?? 0;
    if (grudge < N.maxAttackGrudge) {
      n.grudges.set(a.attacker, Math.min(N.maxAttackGrudge, grudge + N.attackedGrudge));
    }
  }
}

/** True if the nation would accept `other` as an ally right now. */
function wouldAlly(world: World, n: NationState, other: number, leader: FactionId): boolean {
  const f = world.factions[other];
  if (!f || !f.alive || f.kind === "bot" || f.kind === "neutral" || other === n.faction) {
    return false;
  }
  if (isAllied(world, n.faction, other)) return false;
  if (n.home === other) return true;
  if (isTraitor(world, other) || (n.grudges.get(other) ?? 0) > N.maxAttackGrudge / 2) return false;
  if (n.profile.gangUpOnLeader && other === leader) return false;
  if (alliesOf(world, n.faction).length >= N.maxAllies) return false;
  return n.rng.chance(n.profile.loyalty, 100);
}

/**
 * At most one diplomatic act per decision: help an ally that asked, answer a
 * peace offer, accept a request, betray an ally (the leader, or a weak one on
 * aggressive profiles), or ask someone new for an alliance.
 */
function decideDiplomacy(
  world: World,
  n: NationState,
  me: Faction,
  leader: FactionId,
): Command | null {
  const self = n.faction;
  const p = n.profile;
  if (n.helpFrom !== NEUTRAL) {
    const to = n.helpFrom;
    n.helpFrom = NEUTRAL;
    const troops = Math.floor((me.troops * N.helpGiftPct) / 100);
    if (isAllied(world, self, to) && troops > 0 && n.rng.chance(p.loyalty, 100)) {
      return { type: "gift", faction: self, to, solars: 0, troops };
    }
  }
  if (n.peaceFrom !== NEUTRAL) {
    const from = n.peaceFrom;
    n.peaceFrom = NEUTRAL;
    if (wouldAlly(world, n, from, leader)) return allyCommand(world, self, from);
  }
  for (const [key, until] of world.diplomacy.requests) {
    if (until < world.tick || key % 0x10000 !== self) continue;
    const from = Math.floor(key / 0x10000) as FactionId;
    if (wouldAlly(world, n, from, leader)) {
      return { type: "ally", faction: self, other: from, action: "accept" };
    }
  }

  const allies = alliesOf(world, self);
  for (const ally of allies) {
    if (ally === n.home || nationOf(world, ally)?.home === self) continue; // family stays
    const other = world.factions[ally]!;
    const temptedByLeader = p.gangUpOnLeader && ally === leader;
    const temptedByWeakness =
      p.aggression > 50 && other.troops * 4 < me.troops && n.rng.chance(1, 20);
    if ((temptedByLeader || temptedByWeakness) && !n.rng.chance(p.loyalty, 100)) {
      return { type: "ally", faction: self, other: ally, action: "break" };
    }
  }

  if (allies.length < N.maxAllies && n.rng.chance(N.allyRequestChancePct, 100)) {
    const other = world.factions[1 + n.rng.nextInt(world.factions.length - 1)]!;
    const fine =
      other.alive &&
      other.hasSpawned &&
      other.kind !== "bot" &&
      other.id !== self &&
      !isAllied(world, self, other.id) &&
      !hasRequest(world, self, other.id) &&
      !isTraitor(world, other.id) &&
      !(p.gangUpOnLeader && other.id === leader) &&
      (n.grudges.get(other.id) ?? 0) === 0;
    if (fine) return allyCommand(world, self, other.id);
  }
  return null;
}

function allyCommand(world: World, self: FactionId, other: FactionId): Command {
  const action = hasRequest(world, other, self) ? "accept" : "request";
  return { type: "ally", faction: self, other, action };
}

/** Troops per tile a faction defends `grid` with (its Corona pool there). */
function density(world: World, f: Faction, grid: number): number {
  if (isCorona(world, grid)) return Math.floor(f.coronaTroops / Math.max(1, coronaTiles(world, f)));
  return Math.floor(f.troops / Math.max(1, landTiles(world, f)));
}

type Consider = (score: number, command: Command | null) => void;

/**
 * Expansion and wars on the nation's own borders: samples its own tiles to
 * find neutral land and neighbors, then scores expanding and attacking each
 * neighbor (weaker ones, grudges, the leader and allies' targets first).
 */
function considerLand(
  world: World,
  n: NationState,
  me: Faction,
  leader: FactionId,
  consider: Consider,
): void {
  const p = n.profile;
  let running = 0;
  for (const a of world.attacks) if (a.attacker === n.faction) running++;
  if (running >= p.maxAttacks) return;

  let neutral: { grid: GridId; tile: number } | null = null;
  let enemy: { grid: GridId; tile: number; score: number } | null = null;
  for (let s = 0; s < N.sampleTiles; s++) {
    const ref = me.tiles[n.rng.nextInt(me.tiles.length)]!;
    const grid = gridOf(world, refGrid(ref))!;
    const pool = troopPool(world, me, grid.id);
    if (pool < (isCorona(world, grid.id) ? BALANCE.bot.minCoronaTroops : N.minTroops)) continue;
    const count = grid.neighbors(refTile(ref), scratch);
    for (let i = 0; i < count; i++) {
      const tile = scratch[i]!;
      const owner = grid.owner[tile]! as FactionId;
      if (owner === n.faction) continue;
      if (owner === NEUTRAL) {
        if (!neutral && isOwnableTerrain(grid.terrain[tile]!)) neutral = { grid: grid.id, tile };
        continue;
      }
      if (isAllied(world, n.faction, owner)) continue;
      const score = warScore(world, n, me, owner, grid.id, leader);
      if (score > (enemy?.score ?? 0)) enemy = { grid: grid.id, tile, score };
    }
  }

  if (neutral) {
    consider(50 + ((100 - p.aggression) >> 2), {
      type: "attack",
      faction: n.faction,
      grid: neutral.grid,
      tile: neutral.tile,
      ratioPct: n.rng.nextRange(N.expandRatioMinPct, N.expandRatioMaxPct),
    });
  }
  if (enemy) {
    // With no empty land left, war is the only way to grow.
    consider(enemy.score + (neutral ? 0 : 25), {
      type: "attack",
      faction: n.faction,
      grid: enemy.grid,
      tile: enemy.tile,
      ratioPct: n.rng.nextRange(p.attackRatioMinPct, p.attackRatioMaxPct),
    });
  }
}

/**
 * How much the nation wants war with `target` (0 = not at all): weaker
 * targets, grudges, the leader (when ganging up) and allies' targets score
 * higher. Stronger targets are only attacked for a reason.
 */
function warScore(
  world: World,
  n: NationState,
  me: Faction,
  target: FactionId,
  grid: number,
  leader: FactionId,
): number {
  const p = n.profile;
  const other = world.factions[target]!;
  if (!other.alive) return 0;
  const weak = density(world, other, grid) * 100 < density(world, me, grid) * p.attackWeakerThanPct;
  let reason = Math.min(100, n.grudges.get(target) ?? 0);
  if (p.gangUpOnLeader && target === leader) reason += 40;
  if (target === n.focus) reason += 50;
  if (other.kind === "bot") reason += 10;
  if (!weak && reason < 30) return 0;
  return (p.aggression >> 1) + reason + (weak ? 20 : 0);
}

/** Builds on a random own tile: a Spaceport where it has none, Habitats, siphons in the Corona. */
function considerBuild(world: World, n: NationState, me: Faction, consider: Consider): void {
  const p = n.profile;
  if (p.builder === 0) return;
  const ref = me.tiles[n.rng.nextInt(me.tiles.length)]!;
  const grid = refGrid(ref);
  const tile = refTile(ref);
  if (tooCloseToStructure(world, grid, tile)) return;
  const build = (kind: "spaceport" | "habitat" | "solarSiphon"): Command | null =>
    me.solars >= buildCost(world, n.faction, kind, grid)
      ? { type: "build", faction: n.faction, kind, grid, tile }
      : null;
  if (isCorona(world, grid)) {
    consider(p.builder + 40, build("solarSiphon"));
    return;
  }
  let portHere = false;
  let ports = 0;
  for (const s of world.structures) {
    if (s.owner !== n.faction || s.kind !== "spaceport") continue;
    ports++;
    if (s.grid === grid) portHere = true;
  }
  if (!portHere) consider(p.builder + (ports === 0 ? 40 : 15), build("spaceport"));
  else consider((p.builder >> 1) + 10, build("habitat"));
}

/**
 * Leaving home: Troop Landers to other worlds (empty land, or a weak enemy),
 * Sun Base ships into the Corona, and raids on enemy siphons and Sun Bases.
 */
function considerSpace(
  world: World,
  n: NationState,
  me: Faction,
  leader: FactionId,
  canSpend: boolean,
  consider: Consider,
): void {
  const p = n.profile;
  if (p.spacefaring === 0) return;
  let port: Structure | null = null;
  for (const s of world.structures) {
    if (s.owner === n.faction && s.kind === "spaceport" && s.buildTicksLeft === 0) {
      port = s;
      break;
    }
  }
  if (!port) return;
  const launch = (
    kind: "troopLander" | "sunBaseShip",
    toGrid: GridId,
    toTile: number,
    ratioPct: number,
  ): Command => ({
    type: "launch",
    faction: n.faction,
    kind,
    from: port.id,
    toGrid,
    toTile,
    ratioPct,
  });
  const ratio = () => n.rng.nextRange(p.attackRatioMinPct, p.attackRatioMaxPct);

  // A lander to another world.
  if (canSpend && me.troops >= N.landerMinTroops && world.grids.length > 1) {
    const grid = world.grids[n.rng.nextInt(world.grids.length)]!;
    if (grid.id !== port.grid) {
      for (let i = 0; i < N.landerTargetAttempts; i++) {
        const tile = n.rng.nextInt(grid.size);
        if (!grid.isUsable(tile) || !isOwnableTerrain(grid.terrain[tile]!)) continue;
        const owner = grid.owner[tile]! as FactionId;
        if (owner === n.faction || isAllied(world, n.faction, owner)) continue;
        if (owner === NEUTRAL) {
          const newWorld = me.gridTiles[grid.id] === 0 ? 25 : 0;
          consider(p.spacefaring + newWorld, launch("troopLander", grid.id, tile, ratio()));
          break;
        }
        const war = warScore(world, n, me, owner, grid.id, leader);
        if (war > 0) {
          consider((p.spacefaring + war) >> 1, launch("troopLander", grid.id, tile, ratio()));
          break;
        }
      }
    }
  }

  const corona = world.corona;
  if (!corona) return;

  // A Sun Base, as deep in the Corona as it can find room.
  let bases = 0;
  for (const s of world.structures) if (s.owner === n.faction && s.kind === "sunBase") bases++;
  for (const ship of world.ships) {
    if (ship.owner === n.faction && ship.kind === "sunBaseShip") bases++;
  }
  const maxBases = Math.max(1, Math.floor(p.spacefaring / N.spacefaringPerSunBase));
  if (bases < maxBases && me.solars >= buildCost(world, n.faction, "sunBase", corona.id)) {
    let best = -1;
    for (let i = 0; i < N.sunBaseTargetAttempts; i++) {
      const tile = n.rng.nextInt(corona.size);
      if (corona.owner[tile] !== NEUTRAL || tooCloseToStructure(world, corona.id, tile)) continue;
      if (best < 0 || corona.ring(tile) < corona.ring(best)) best = tile;
    }
    if (best >= 0) {
      const ratioPct = n.rng.nextRange(N.expandRatioMinPct, N.expandRatioMaxPct);
      consider(p.spacefaring + 30, launch("sunBaseShip", corona.id, best, ratioPct));
    }
  }

  // A raid: land on an enemy siphon or Sun Base to take it with its tile.
  if (canSpend && p.raidsSiphons && me.troops >= N.raidMinTroops) {
    const target = raidTarget(world, n, leader);
    if (target) {
      consider(60 + (p.aggression >> 2), launch("troopLander", target.grid, target.tile, ratio()));
    }
  }
}

/** An enemy siphon (or Sun Base) worth raiding: the leader's first, else any non-ally's. */
function raidTarget(world: World, n: NationState, leader: FactionId): Structure | null {
  let pick: Structure | null = null;
  const count = world.structures.length;
  if (count === 0) return null;
  const start = n.rng.nextInt(count);
  for (let k = 0; k < count; k++) {
    const s = world.structures[(start + k) % count]!;
    if (s.kind !== "solarSiphon" && s.kind !== "sunBase") continue;
    if (s.owner === NEUTRAL || s.owner === n.faction || isAllied(world, n.faction, s.owner)) {
      continue;
    }
    if (s.owner === leader) return s;
    pick ??= s;
  }
  return pick;
}

/**
 * Coordinated profiles ask every ally to join a new war (an "attack"
 * signal), once per target.
 */
function callAllies(world: World, n: NationState, command: Command, out: Command[]): void {
  if (!n.profile.coordinated) return;
  let target: number;
  if (command.type === "attack") target = gridOf(world, command.grid)!.owner[command.tile]!;
  else if (command.type === "launch" && command.kind === "troopLander") {
    target = gridOf(world, command.toGrid)!.owner[command.toTile]!;
  } else return;
  if (target === NEUTRAL || target === n.calledTarget) return;
  if (world.factions[target]!.kind === "bot") return;
  n.calledTarget = target as FactionId;
  for (const ally of alliesOf(world, n.faction)) {
    out.push({
      type: "signal",
      faction: n.faction,
      to: ally,
      signal: "attack",
      about: target as FactionId,
    });
  }
}
