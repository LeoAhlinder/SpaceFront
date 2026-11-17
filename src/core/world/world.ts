import { BALANCE } from "../../data/balance";
import { CommandQueue } from "../commands/commandQueue";
import { DiscGrid } from "../grid/discGrid";
import type { FactionId, GridId } from "../ids";
import { factionId, gridId, MAX_FACTION_ID, NEUTRAL } from "../ids";
import type { TerrainMap } from "../map/terrainMap";
import { Rng } from "../math/rng";
import type { FrontierHeap } from "./frontierHeap";
import type { TileRef } from "./tileRef";

export type Difficulty = "easy" | "normal" | "hard" | "impossible";

export type FactionKind = "neutral" | "player" | "bot" | "nation";

/** One body in the match. */
export interface BodyConfig {
  readonly radius: number;
  /** Map to load terrain from (e.g. "earth"). Without one, the body is all plains. */
  readonly mapId?: string;
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
  /**
   * Every tile the faction owns, as TileRefs, in no particular order (but a
   * deterministic one). Lets AI and attacks look at a faction's land without
   * scanning whole grids. Kept in sync by setOwner.
   */
  readonly tiles: TileRef[];
  /** Target percent of population that are troops (1–100). */
  troopRatioPct: number;
}

/** AI state for one bot faction. */
export interface BotState {
  readonly faction: FactionId;
  /** The bot's own random stream, so bots never shift each other's numbers. */
  readonly rng: Rng;
  /** Next tick on which this bot decides. Spread out so bots don't all think at once. */
  nextDecisionTick: number;
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
  /** Per grid, per tile: the tile's index in its owner's `tiles` list (-1 if neutral). */
  readonly tileSlots: Int32Array[];
  /** Bot AI states, in creation order. */
  readonly bots: BotState[];
  /** Running attacks, in creation order. */
  attacks: Attack[];
  nextAttackId: number;
  /** Commands waiting for their tick. */
  readonly pending: CommandQueue;
}

/**
 * Builds the starting world. `maps` holds the decoded map data for every
 * `mapId` the config mentions (loading files is the host's job, not core's).
 */
export function createWorld(
  config: MatchConfig,
  maps: ReadonlyMap<string, TerrainMap> = new Map(),
): World {
  const grids = config.bodies.map((body, i) => createGrid(i, body, maps));
  const world: World = {
    tick: 0,
    config,
    rng: Rng.fromSeed(config.seed),
    grids,
    factions: [],
    tileSlots: grids.map((g) => new Int32Array(g.size).fill(-1)),
    bots: [],
    attacks: [],
    nextAttackId: 1,
    pending: new CommandQueue(),
  };
  addFaction(world, "Neutral", "neutral");
  return world;
}

function createGrid(index: number, body: BodyConfig, maps: ReadonlyMap<string, TerrainMap>) {
  const grid = new DiscGrid(gridId(index), body.radius);
  if (body.mapId !== undefined) {
    const map = maps.get(body.mapId);
    if (!map) throw new Error(`Map "${body.mapId}" was not provided`);
    if (map.radius !== body.radius) {
      throw new Error(`Map "${body.mapId}" has radius ${map.radius}, body has ${body.radius}`);
    }
    grid.applyTerrain(map.terrain);
  }
  return grid;
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
    tiles: [],
    troopRatioPct: BALANCE.population.defaultTroopRatioPct,
  };
  world.factions.push(faction);
  return faction;
}
