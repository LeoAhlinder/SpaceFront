import { BALANCE } from "../../data/balance";
import { CommandQueue } from "../commands/commandQueue";
import { DiscGrid } from "../grid/discGrid";
import type { FactionId, GridId } from "../ids";
import { factionId, gridId, MAX_FACTION_ID, NEUTRAL } from "../ids";
import { Rng } from "../math/rng";
import type { FrontierHeap } from "./frontierHeap";

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
  /** True once the faction has placed its starting territory. */
  hasSpawned: boolean;
  troops: number;
  workers: number;
  solars: number;
  tileCount: number;
  /** Target percent of population that are troops (1–100). */
  troopRatioPct: number;
}

/** A running attack: troops spreading into one target's land on one grid. */
export interface Attack {
  readonly id: number;
  readonly attacker: FactionId;
  /** Owner being attacked; NEUTRAL for expanding into empty land. */
  readonly target: FactionId;
  readonly grid: GridId;
  /** Troops still committed to this attack. */
  troops: number;
  /** The tile the player clicked; the attack is pulled toward it. */
  focusTile: number;
  /** Target tiles bordering the attacker, cheapest first. */
  readonly frontier: FrontierHeap;
}

/**
 * The complete simulation state: the single source of truth (ARCHITECTURE.md §4.3).
 * Units, structures, the Corona and alliances are added by the milestones that
 * need them.
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
  /** Running attacks, in creation order. */
  attacks: Attack[];
  nextAttackId: number;
  /** Commands waiting for their tick. */
  readonly pending: CommandQueue;
}

export function createWorld(config: MatchConfig): World {
  const world: World = {
    tick: 0,
    config,
    rng: Rng.fromSeed(config.seed),
    grids: config.bodies.map((body, i) => new DiscGrid(gridId(i), body.radius)),
    factions: [],
    attacks: [],
    nextAttackId: 1,
    pending: new CommandQueue(),
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
    hasSpawned: false,
    troops: 0,
    workers: 0,
    solars: 0,
    tileCount: 0,
    troopRatioPct: BALANCE.population.defaultTroopRatioPct,
  };
  world.factions.push(faction);
  return faction;
}
