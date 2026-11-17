import { BALANCE } from "../../data/balance";
import { CommandQueue } from "../commands/commandQueue";
import { RectGrid } from "../grid/rectGrid";
import { isOwnableTerrain } from "../grid/terrain";
import type { FactionId, GridId } from "../ids";
import { factionId, gridId, MAX_FACTION_ID, NEUTRAL } from "../ids";
import type { TerrainMap } from "../map/terrainMap";
import { Rng } from "../math/rng";
import type { Point } from "../space/space";
import type { FrontierHeap } from "./frontierHeap";
import type { TileRef } from "./tileRef";

export type Difficulty = "easy" | "normal" | "hard" | "impossible";

export type FactionKind = "neutral" | "player" | "bot" | "nation";

/** One body in the match. */
export interface BodyConfig {
  /** Flat map size in tiles. */
  readonly width: number;
  readonly height: number;
  /** Map to load terrain from (e.g. "earth"). Without one, the body is all plains. */
  readonly mapId?: string;
  /**
   * The solar-system body (data/bodies.ts) this map belongs to. Needed for
   * flights between bodies; maps without one can only be reached from themselves.
   */
  readonly bodyId?: string;
}

/** Everything needed to start a match. Plain JSON, so it can be saved and sent. */
export interface MatchConfig {
  readonly seed: number;
  readonly difficulty: Difficulty;
  readonly bodies: readonly BodyConfig[];
  /**
   * Ticks at the start when factions may only spawn: no attacks and no
   * population growth. Default 0 (tests); real matches use BALANCE.match.
   */
  readonly spawnPhaseTicks?: number;
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
  /** Solars (☉), the only currency. */
  solars: number;
  /** Fractional Solars carried between ticks, in thousandths (0–999). */
  solarsMilli: number;
  tileCount: number;
  /** Tiles owned on each grid (index = GridId); kept in sync by setOwner. */
  readonly gridTiles: number[];
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
  /** The map the bot spawns on, or null for a random one. */
  readonly homeGrid: GridId | null;
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

export type StructureKind = "spaceport" | "habitat";

/** A building on a map. Captured along with its tile. */
export interface Structure {
  readonly id: number;
  readonly kind: StructureKind;
  owner: FactionId;
  readonly grid: GridId;
  readonly tile: number;
  /** Ticks until it works; 0 = finished. */
  buildTicksLeft: number;
  /** Spaceports: the tick its next Freighter leaves (-1 until finished). */
  nextTradeTick: number;
}

export type ShipKind = "troopLander" | "freighter";

/** A spacecraft in flight. Its whole route is planned at launch. */
export interface Ship {
  readonly id: number;
  readonly kind: ShipKind;
  readonly owner: FactionId;
  readonly troops: number;
  readonly fromGrid: GridId;
  readonly fromTile: number;
  readonly toGrid: GridId;
  readonly toTile: number;
  /** Freighters: the Spaceport they deliver to (-1 for landers). */
  readonly toStructure: number;
  readonly launchTick: number;
  readonly arriveTick: number;
  /** Route through space (empty for a hop within one map). */
  readonly waypoints: readonly Point[];
}

/**
 * What changed since the host last drained it (see core/delta). Null on the
 * world means nobody is listening, so nothing is recorded. Not game state:
 * never hashed or saved.
 */
export interface ChangeLog {
  readonly tiles: TileRef[];
  readonly structures: number[];
  readonly shipsLaunched: number[];
  readonly shipsLanded: number[];
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
  readonly grids: RectGrid[];
  /** Indexed by FactionId. Index 0 is the neutral faction. */
  readonly factions: Faction[];
  /** Per grid, per tile: the tile's index in its owner's `tiles` list (-1 if neutral). */
  readonly tileSlots: Int32Array[];
  /** Bot AI states, in creation order. */
  readonly bots: BotState[];
  /** Running attacks, in creation order. */
  attacks: Attack[];
  nextAttackId: number;
  /** Body id per grid (null for maps outside the solar system, e.g. in tests). */
  readonly gridBodies: readonly (string | null)[];
  /** All structures; a structure's id is its index. */
  readonly structures: Structure[];
  /** Per grid, per tile: id of the structure there, or -1. */
  readonly structureAt: Int32Array[];
  /** Ships in flight, in launch order. */
  ships: Ship[];
  nextShipId: number;
  /** Commands waiting for their tick. */
  readonly pending: CommandQueue;
  /** Ownable land tiles across all grids, for the win condition. Fixed at creation. */
  readonly ownableTiles: number;
  /** The faction that won, or null while the match is running. */
  winner: FactionId | null;
  /** Change log for the host (see ChangeLog); null when nobody listens. */
  log: ChangeLog | null;
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
    gridBodies: config.bodies.map((b) => b.bodyId ?? null),
    structures: [],
    structureAt: grids.map((g) => new Int32Array(g.size).fill(-1)),
    ships: [],
    nextShipId: 1,
    pending: new CommandQueue(),
    ownableTiles: grids.reduce((sum, g) => sum + countOwnable(g), 0),
    winner: null,
    log: null,
  };
  addFaction(world, "Neutral", "neutral");
  return world;
}

function countOwnable(grid: RectGrid): number {
  let n = 0;
  for (let i = 0; i < grid.size; i++) if (isOwnableTerrain(grid.terrain[i]!)) n++;
  return n;
}

/** True while the match is still in its spawn phase. */
export function inSpawnPhase(world: World): boolean {
  return world.tick < (world.config.spawnPhaseTicks ?? 0);
}

function createGrid(index: number, body: BodyConfig, maps: ReadonlyMap<string, TerrainMap>) {
  const grid = new RectGrid(gridId(index), body.width, body.height);
  if (body.mapId !== undefined) {
    const map = maps.get(body.mapId);
    if (!map) throw new Error(`Map "${body.mapId}" was not provided`);
    if (map.width !== body.width || map.height !== body.height) {
      throw new Error(
        `Map "${body.mapId}" is ${map.width}×${map.height}, body is ${body.width}×${body.height}`,
      );
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
    solarsMilli: 0,
    tileCount: 0,
    gridTiles: world.grids.map(() => 0),
    tiles: [],
    troopRatioPct: BALANCE.population.defaultTroopRatioPct,
  };
  world.factions.push(faction);
  return faction;
}
