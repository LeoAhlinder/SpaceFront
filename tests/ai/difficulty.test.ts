/**
 * AI-vs-AI matches for every difficulty (CODING_STANDARDS.md §8, "AI"): the
 * full solar system with the difficulty's nations and colonies, 40 bots and
 * a scripted simple player (tests/support/scriptedPlayer.ts) spawned in
 * Uzbekistan, for 3,000 ticks (5 minutes of game time).
 *
 * Checks the M3 goal as far as tests can: nations get clearly stronger and
 * more aggressive with the difficulty, a simple player survives and grows on
 * Easy but is crushed on Impossible, and everything stays deterministic and
 * cheap.
 */
import { describe, expect, it } from "vitest";
import type { Difficulty, World } from "../../src/core";
import {
  drainDelta,
  hashWorld,
  landTiles,
  NEUTRAL,
  runTick,
  trackChanges,
  WARSHIP_STRIDE,
} from "../../src/core";
import { DIFFICULTIES, DIFFICULTY_IDS } from "../../src/data/difficulty";
import { nationById } from "../../src/data/nations";
import { addScriptedPlayer } from "../support/scriptedPlayer";
import { populate, solarWorld } from "../support/solarMatch";

const TICKS = 3_000;
const SEED = 42;
/** Uzbekistan: central Asia, between several possible nations. */
const PLAYER_REGION = "860";

interface Result {
  world: World;
  msPerTick: number;
  /** Nations' (and colonies') share of all land, percent. */
  nationLandPct: number;
  /** Wars (attacks on other factions) started by nations, per nation. */
  warsPerNation: number;
  /** Tiles nations took from other factions (not empty land), per nation. */
  conqueredPerNation: number;
  /** Troop Landers launched by nations, and those aimed at the Corona (siphon raids). */
  landers: number;
  raids: number;
  sunBaseShips: number;
  alliances: number;
  betrayals: number;
  signals: number;
  /** M4: defenses built, Warships bought, weapons fired by nations (and strikes at siphons). */
  shields: number;
  platforms: number;
  silos: number;
  warships: number;
  kinetic: number;
  antimatter: number;
  siphonStrikes: number;
  intercepted: number;
  playerLand: number;
  playerAlive: boolean;
  hashes: number[];
}

function play(difficulty: Difficulty, ticks = TICKS): Result {
  const world = solarWorld(SEED, difficulty);
  const player = addScriptedPlayer(world, PLAYER_REGION);
  populate(world, 40);
  trackChanges(world);
  const nations = new Set<number>(world.nations.map((n) => n.faction));
  const r = {
    landers: 0,
    raids: 0,
    sunBaseShips: 0,
    alliances: 0,
    betrayals: 0,
    signals: 0,
    wars: 0,
    conquered: 0,
    shields: 0,
    platforms: 0,
    silos: 0,
    warships: 0,
    kinetic: 0,
    antimatter: 0,
    siphonStrikes: 0,
    intercepted: 0,
  };
  const seenStructures = new Set<number>();
  const seenWarships = new Set<number>();
  // Owners as of the last tick, to see whom each changed tile was taken from.
  const owners = [...world.grids.map((g) => g.owner.slice()), world.corona!.owner.slice()];
  const hashes: number[] = [];
  let lastAttack = 0;
  const start = performance.now();
  for (let t = 0; t < ticks; t++) {
    player.act(world);
    runTick(world);
    for (const a of world.attacks) {
      if (a.id <= lastAttack) continue;
      lastAttack = a.id;
      if (nations.has(a.attacker) && a.target !== NEUTRAL) r.wars++;
    }
    const delta = drainDelta(world);
    for (let i = 0; i < delta.tiles.length; i += 3) {
      const grid = owners[delta.tiles[i]!]!;
      const tile = delta.tiles[i + 1]!;
      const owner = delta.tiles[i + 2]!;
      if (nations.has(owner) && grid[tile] !== NEUTRAL) r.conquered++;
      grid[tile] = owner;
    }
    for (const s of delta.shipsLaunched) {
      if (!nations.has(s.owner)) continue;
      if (s.kind === "sunBaseShip") r.sunBaseShips++;
      if (s.kind !== "troopLander") continue;
      r.landers++;
      if (s.toGrid === world.corona!.id) r.raids++;
    }
    for (const sv of delta.structures) {
      if (seenStructures.has(sv.id) || !nations.has(sv.owner)) continue;
      seenStructures.add(sv.id);
      if (sv.kind === "shieldGenerator") r.shields++;
      if (sv.kind === "orbitalDefense") r.platforms++;
      if (sv.kind === "launchSilo") r.silos++;
    }
    for (let i = 0; i < delta.warships.length; i += WARSHIP_STRIDE) {
      const id = delta.warships[i]!;
      if (seenWarships.has(id) || !nations.has(delta.warships[i + 1]!)) continue;
      seenWarships.add(id);
      r.warships++;
    }
    for (const e of delta.events) {
      if (e.kind === "weaponIntercepted") r.intercepted++;
      if (e.kind === "weaponLaunched" && nations.has(e.by)) {
        if (e.weapon === "antimatterWarhead") r.antimatter++;
        else r.kinetic++;
        if (e.grid === world.corona!.id) r.siphonStrikes++;
      }
      if (e.kind === "allied") r.alliances++;
      if (e.kind === "allianceBroken" && nations.has(e.by)) r.betrayals++;
      if (e.kind === "signal" && nations.has(e.from)) r.signals++;
    }
    if (world.tick % 500 === 0) hashes.push(hashWorld(world));
  }
  const msPerTick = (performance.now() - start) / ticks;
  let land = 0;
  for (const n of world.nations) land += landTiles(world, world.factions[n.faction]!);
  return {
    world,
    msPerTick,
    nationLandPct: (land * 100) / world.ownableTiles,
    warsPerNation: r.wars / nations.size,
    conqueredPerNation: r.conquered / nations.size,
    ...r,
    playerLand: landTiles(world, player.faction),
    playerAlive: player.faction.alive,
    hashes,
  };
}

describe("AI-vs-AI matches per difficulty (3,000 ticks)", () => {
  const results = new Map<Difficulty, Result>(DIFFICULTY_IDS.map((d) => [d, play(d)]));
  const get = (d: Difficulty) => results.get(d)!;

  it("reports", () => {
    for (const [d, r] of results) {
      console.log(
        `${d}: ${r.msPerTick.toFixed(2)} ms/tick; ${r.world.nations.length} nations hold ` +
          `${r.nationLandPct.toFixed(1)}% of the land; ${r.warsPerNation.toFixed(1)} wars and ` +
          `${r.conqueredPerNation.toFixed(0)} tiles conquered per nation, ` +
          `${r.landers} landers (${r.raids} raids), ${r.sunBaseShips} Sun Base ships, ` +
          `${r.alliances} alliances, ${r.betrayals} betrayals, ${r.signals} signals; ` +
          `M4: ${r.shields} shields, ${r.platforms} platforms, ${r.silos} silos, ` +
          `${r.warships} warships, ${r.kinetic} kinetic (${r.siphonStrikes} at siphons), ` +
          `${r.antimatter} antimatter, ${r.intercepted} intercepted; ` +
          `player ${r.playerAlive ? "alive" : "dead"} with ${r.playerLand} tiles`,
      );
    }
  });

  it("sets up the difficulty's nations and colonies", () => {
    for (const d of DIFFICULTY_IDS) {
      const { world } = get(d);
      const def = DIFFICULTIES[d];
      const earthNations = world.nations.filter((n) => n.home === NEUTRAL && n.spawnTile >= 0);
      for (const tier of [1, 2, 3] as const) {
        const count = earthNations.filter((n) => nationById(n.nationId).tier === tier).length;
        expect(count, `${d} tier ${tier}`).toBe(def.nations[tier]);
      }
      const colonies = world.nations.filter((n) => n.spawnTile < 0);
      expect(colonies.length).toBeGreaterThan(0);
      expect(colonies.length).toBeLessThanOrEqual(def.colonies);
      for (const c of colonies) {
        const body = world.gridBodies[c.homeGrid]!;
        expect(def.colonyBodies as readonly string[]).toContain(body);
      }
    }
  });

  it("nations get stronger with the difficulty", () => {
    const land = (d: Difficulty) => get(d).nationLandPct;
    expect(land("easy")).toBeLessThan(land("normal"));
    expect(land("normal")).toBeLessThan(land("hard"));
    expect(land("impossible")).toBeGreaterThan(land("normal"));
    expect(land("easy")).toBeLessThan(20);
    expect(land("hard")).toBeGreaterThan(50);
  });

  it("nations get more aggressive with the difficulty", () => {
    const conquered = (d: Difficulty) => get(d).conqueredPerNation;
    expect(conquered("easy") * 3).toBeLessThan(conquered("normal"));
    expect(conquered("normal") * 2).toBeLessThan(conquered("hard"));
    expect(conquered("impossible")).toBeGreaterThan(conquered("normal"));
    expect(get("easy").warsPerNation).toBeLessThan(get("impossible").warsPerNation);
    // Betrayals, coordinated calls and siphon raids belong to the hard levels.
    expect(get("easy").betrayals + get("normal").betrayals).toBe(0);
    expect(get("impossible").betrayals).toBeGreaterThan(0);
    expect(get("impossible").signals).toBeGreaterThan(0);
    expect(get("hard").raids).toBe(0);
    expect(get("impossible").raids).toBeGreaterThan(0);
    // Everyone uses space: landers and Sun Bases on every difficulty.
    for (const d of DIFFICULTY_IDS) {
      expect(get(d).landers, d).toBeGreaterThan(0);
      expect(get(d).sunBaseShips, d).toBeGreaterThan(0);
      expect(get(d).alliances, d).toBeGreaterThan(0);
    }
  });

  it("uses M4's defenses, Warships and weapons by difficulty", () => {
    const easy = get("easy");
    const normal = get("normal");
    const hard = get("hard");
    const impossible = get("impossible");
    // Easy never bothers; Normal defends but doesn't arm.
    expect(easy.shields + easy.platforms + easy.silos + easy.warships).toBe(0);
    expect(normal.shields + normal.platforms).toBeGreaterThan(0);
    expect(normal.silos + normal.kinetic + normal.antimatter).toBe(0);
    // Hard and Impossible build silos, buy Warships and fire both weapons.
    for (const r of [hard, impossible]) {
      expect(r.silos).toBeGreaterThan(0);
      expect(r.warships).toBeGreaterThan(0);
      expect(r.kinetic).toBeGreaterThan(0);
      expect(r.antimatter).toBeGreaterThan(0);
      expect(r.intercepted).toBeGreaterThan(0); // Orbital Defense earns its keep
    }
    // Only Impossible fires Kinetic Strikes at siphons.
    expect(hard.siphonStrikes).toBe(0);
    expect(impossible.siphonStrikes).toBeGreaterThan(0);
  });

  it("a simple player survives and grows on Easy, but not on Impossible", () => {
    const easy = get("easy");
    const impossible = get("impossible");
    expect(easy.playerAlive).toBe(true);
    expect(easy.playerLand).toBeGreaterThan(4_000); // from about 80 tiles at spawn
    expect(impossible.playerLand).toBeLessThan(easy.playerLand / 10);
  });

  it("stays cheap: well inside the 100 ms tick budget", () => {
    for (const d of DIFFICULTY_IDS) expect(get(d).msPerTick, d).toBeLessThan(5);
  });

  it("is deterministic with nations, colonies and diplomacy", () => {
    expect(play("impossible", 1_500).hashes).toEqual(get("impossible").hashes.slice(0, 3));
  });
});
