import { DiscGrid } from "../grid/discGrid";
import type { FactionId } from "../ids";
import { factionId, gridId, MAX_FACTION_ID, NEUTRAL } from "../ids";
import { Rng } from "../math/rng";

export type Difficulty = "easy" | "normal" | "hard" | "impossible";

export type FactionKind = "neutral" | "player" | "bot" | "nation";

/** One body in the match. Replaced by real map data in M0.4. */
export interface BodyConfig {
  readonly radius: number;
}

/** Everything needed to start a match. Plain JSON, so it can be saved and sent. */
export interface MatchConfig {
  readonly seed: number;
  readonly difficulty: Difficulty;
  readonly bodies: readonly BodyConfig[];
}

/** A player, bot or nation. All numbers are integers. */
export interface Faction {
  readonly id: FactionId;
  readonly name: string;
  readonly kind: FactionKind;
  alive: boolean;
  troops: number;
  workers: number;
  solars: number;
  tileCount: number;
}

/**
 * The complete simulation state: the single source of truth (ARCHITECTURE.md §4.3).
 * Units, structures, the Corona, attacks, alliances and the command queue are
 * added by the milestones that need them.
 */
export interface World {
  /** Number of ticks completed so far. */
  tick: number;
  readonly config: MatchConfig;
  readonly rng: Rng;
  /** One grid per body, indexed by GridId. */
  readonly grids: DiscGrid[];
  /** Indexed by FactionId. Index 0 is the neutral faction. */
  readonly factions: Faction[];
}

export function createWorld(config: MatchConfig): World {
  const world: World = {
    tick: 0,
    config,
    rng: Rng.fromSeed(config.seed),
    grids: config.bodies.map((body, i) => new DiscGrid(gridId(i), body.radius)),
    factions: [],
  };
  addFaction(world, "Neutral", "neutral");
  return world;
}

/** Adds a faction with the next free id and returns it. */
export function addFaction(world: World, name: string, kind: FactionKind): Faction {
  const id = world.factions.length;
  if (id > MAX_FACTION_ID) throw new RangeError("Too many factions");
  if (kind === "neutral" && id !== NEUTRAL) throw new Error("Only faction 0 may be neutral");
  const faction: Faction = {
    id: factionId(id),
    name,
    kind,
    alive: kind !== "neutral",
    troops: 0,
    workers: 0,
    solars: 0,
    tileCount: 0,
  };
  world.factions.push(faction);
  return faction;
}
