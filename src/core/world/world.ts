import { BALANCE } from "../../data/balance";
import { CommandQueue } from "../commands/commandQueue";
import { PolarGrid } from "../grid/polarGrid";
import { RectGrid } from "../grid/rectGrid";
import { isOwnableTerrain } from "../grid/terrain";
import type { TileGrid } from "../grid/tileGrid";
import type { FactionId, GridId } from "../ids";
import { factionId, gridId, MAX_FACTION_ID, NEUTRAL } from "../ids";
import type { TerrainMap } from "../map/terrainMap";
import { Rng } from "../math/rng";
import type { Point } from "../space/space";
import type { DifficultyId } from "../../data/difficulty";
import type { NationState } from "../ai/nation";
import type { Diplomacy, GameEvent } from "./diplomacy";
import { createDiplomacy } from "./diplomacy";
import type { FrontierHeap } from "./frontierHeap";
import type { TileRef } from "./tileRef";

export type Difficulty = DifficultyId;

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
  /**
   * Adds the Corona around the Sun (a PolarGrid, sized by BALANCE.corona) as
   * the grid after the last body. Default false (tests of single maps).
   */
  readonly corona?: boolean;
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
  /**
   * Troops in the Corona: a separate pool, since troops don't grow there. Fed
   * by landers and Sun Bases, drained by heat, spent on Corona attacks.
   */
  coronaTroops: number;
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
  /**
   * Economy bonuses in percent (100 = none): nations get theirs from the
   * difficulty (data/difficulty.ts); players and bots have none.
   */
  readonly bonus: FactionBonus;
  /** Marked as a traitor (for breaking an alliance) until this tick; 0 = never. */
  traitorUntil: number;
  /**
   * Structures owned per kind (STRUCTURE_KINDS index), finished or not, and
   * the finished ones. Kept in sync with `world.structures` by
   * world/structureIndex.ts, so build costs don't scan every structure.
   */
  readonly owned: number[];
  readonly finished: number[];
}

/** Percent multipliers on a faction's economy (100 = normal). */
export interface FactionBonus {
  /** Population growth. */
  growthPct: number;
  /** All Solars income except trade. */
  incomePct: number;
  /** Construction time (below 100 builds faster). */
  buildTimePct: number;
  /** Extra steps of land claimed at spawn. */
  spawnRadius: number;
  /** Starting troops and workers. */
  startPopPct: number;
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

/** Every structure kind, in a fixed order (their index is the kind's code). */
export const STRUCTURE_KINDS = [
  "spaceport",
  "habitat",
  "sunBase",
  "solarSiphon",
  "shieldGenerator",
  "orbitalDefense",
  "launchSilo",
] as const;

export type StructureKind = (typeof STRUCTURE_KINDS)[number];

/** A building on a map. Captured along with its tile. */
export interface Structure {
  readonly id: number;
  readonly kind: StructureKind;
  owner: FactionId;
  readonly grid: GridId;
  readonly tile: number;
  /** Ticks until it works; 0 = finished. */
  buildTicksLeft: number;
  /** Spaceports and Sun Bases: the tick its next Freighter leaves (-1 until finished). */
  nextTradeTick: number;
  /** Launch Silos: the tick it can fire again. Orbital Defense: the tick it can shoot again. */
  readyTick: number;
  /** Hit points (only Solar Siphons can be shot at; weapons destroy any structure). */
  hp: number;
  /**
   * Destroyed by a weapon or Warship. Ids are array indexes, so a destroyed
   * structure stays in `world.structures` (owned by NEUTRAL, off the map).
   */
  destroyed: boolean;
}

export type WeaponKind = "kineticStrike" | "antimatterWarhead";

/** Ships that fly a precomputed route and arrive. Weapons in flight are ships too. */
export type ShipKind = "troopLander" | "freighter" | "sunBaseShip" | WeaponKind;

/** A spacecraft in flight. Its whole route is planned at launch. */
export interface Ship {
  readonly id: number;
  readonly kind: ShipKind;
  readonly owner: FactionId;
  /** Troops aboard; a damaged lander loses troops with its hit points. */
  troops: number;
  /** Hit points left (BALANCE.hp); at 0 it is destroyed. */
  hp: number;
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
 * A Warship: moves freely through space (it has no route), patrols an area
 * and shoots hostile ships and Solar Siphons (systems/combat.ts). Positions
 * are integer space units.
 */
export interface Warship {
  readonly id: number;
  readonly owner: FactionId;
  x: number;
  y: number;
  /** Center of the patrol area: a fixed point, or the guarded world's position. */
  patrolX: number;
  patrolY: number;
  /** A grid whose body it guards (the patrol area follows the body), or -1. */
  guardGrid: number;
  /** Where it is heading right now. */
  wayX: number;
  wayY: number;
  hp: number;
}

/** Irradiated land left by an Antimatter Warhead (slow to retake, no building). */
export interface Fallout {
  readonly grid: GridId;
  readonly tile: number;
  readonly radius: number;
  readonly untilTick: number;
}

/** Something to draw for a moment: a shot, a ship blowing up, a weapon impact. Never hashed. */
export type CombatEffect =
  | {
      readonly kind: "beam";
      readonly owner: number;
      readonly fromX: number;
      readonly fromY: number;
      readonly toX: number;
      readonly toY: number;
    }
  | { readonly kind: "blast"; readonly x: number; readonly y: number; readonly size: number }
  | {
      readonly kind: "impact";
      readonly weapon: WeaponKind;
      readonly grid: number;
      readonly tile: number;
      readonly radius: number;
    };

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
  /** Diplomacy and other events for the UI, in the order they happened. */
  readonly events: GameEvent[];
  /** Shots, blasts and impacts to draw. */
  readonly effects: CombatEffect[];
}

/**
 * The complete simulation state: the single source of truth (ARCHITECTURE.md §4.3).
 */
export interface World {
  /** Number of ticks completed so far. */
  tick: number;
  readonly config: MatchConfig;
  readonly rng: Rng;
  /** One grid per body, indexed by GridId. The Corona is not in here (see `corona`). */
  readonly grids: RectGrid[];
  /**
   * The Corona around the Sun, or null in matches without one. Its GridId is
   * grids.length, so per-grid arrays (tileSlots, structureAt, gridTiles) have
   * one more entry than `grids`. Use gridOf() to look up any grid by id.
   */
  readonly corona: PolarGrid | null;
  /** Indexed by FactionId. Index 0 is the neutral faction. */
  readonly factions: Faction[];
  /** Per grid, per tile: the tile's index in its owner's `tiles` list (-1 if neutral). */
  readonly tileSlots: Int32Array[];
  /** Bot AI states, in creation order. */
  readonly bots: BotState[];
  /** Nation (and colony) AI states, in creation order. */
  readonly nations: NationState[];
  /** Alliances, alliance requests and embargoes. */
  readonly diplomacy: Diplomacy;
  /** Running attacks, in creation order. */
  attacks: Attack[];
  nextAttackId: number;
  /** Body id per grid (null for maps outside the solar system, e.g. in tests). */
  readonly gridBodies: readonly (string | null)[];
  /** All structures; a structure's id is its index (destroyed ones stay). */
  readonly structures: Structure[];
  /** Per grid, per tile: id of the structure there, or -1. */
  readonly structureAt: Int32Array[];
  /**
   * Per grid, per structure kind (STRUCTURE_KINDS index): ids of the
   * structures there, in id order. Derived from `structures` (see
   * world/structureIndex.ts), so lookups don't scan every structure.
   */
  readonly structureIndex: number[][][];
  /** Ships in flight, in launch order. */
  ships: Ship[];
  /** Warships in space, in launch order. They share ship ids. */
  warships: Warship[];
  nextShipId: number;
  /** Irradiated areas, oldest first. */
  fallout: Fallout[];
  /** Commands waiting for their tick. */
  readonly pending: CommandQueue;
  /** Ownable land tiles across all body grids (not the Corona), for the win condition. */
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
  const C = BALANCE.corona;
  const corona = config.corona
    ? new PolarGrid(gridId(grids.length), C.rings, C.sectors, C.innerRings, C.middleRings)
    : null;
  const all: TileGrid[] = corona ? [...grids, corona] : grids;
  const world: World = {
    tick: 0,
    config,
    rng: Rng.fromSeed(config.seed),
    grids,
    corona,
    factions: [],
    tileSlots: all.map((g) => new Int32Array(g.size).fill(-1)),
    bots: [],
    nations: [],
    diplomacy: createDiplomacy(),
    attacks: [],
    nextAttackId: 1,
    gridBodies: config.bodies.map((b) => b.bodyId ?? null),
    structures: [],
    structureAt: all.map((g) => new Int32Array(g.size).fill(-1)),
    structureIndex: all.map(() => STRUCTURE_KINDS.map(() => [])),
    ships: [],
    warships: [],
    nextShipId: 1,
    fallout: [],
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

/** Any grid by id: a body's map, or the Corona. Undefined for unknown ids. */
export function gridOf(world: World, id: number): TileGrid | undefined {
  return world.grids[id] ?? (world.corona?.id === id ? world.corona : undefined);
}

/** True if `grid` is the Corona. */
export function isCorona(world: World, grid: number): boolean {
  return world.corona !== null && world.corona.id === grid;
}

/** Tiles a faction owns in the Corona. */
export function coronaTiles(world: World, faction: Faction): number {
  return world.corona ? faction.gridTiles[world.corona.id]! : 0;
}

/**
 * Tiles a faction owns on bodies (everything but the Corona). Population,
 * income modifiers and the win condition count only these.
 */
export function landTiles(world: World, faction: Faction): number {
  return faction.tileCount - coronaTiles(world, faction);
}

/** The troop pool that pays for action on `grid`: the Corona's own, or the faction's main one. */
export function troopPool(world: World, faction: Faction, grid: number): number {
  return isCorona(world, grid) ? faction.coronaTroops : faction.troops;
}

/** Adds (or with a negative n, removes) troops in the pool for `grid`. */
export function addTroops(world: World, faction: Faction, grid: number, n: number): void {
  if (isCorona(world, grid)) faction.coronaTroops += n;
  else faction.troops += n;
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
    coronaTroops: 0,
    solars: 0,
    solarsMilli: 0,
    tileCount: 0,
    gridTiles: world.tileSlots.map(() => 0),
    tiles: [],
    troopRatioPct: BALANCE.population.defaultTroopRatioPct,
    bonus: { growthPct: 100, incomePct: 100, buildTimePct: 100, spawnRadius: 0, startPopPct: 100 },
    traitorUntil: 0,
    owned: STRUCTURE_KINDS.map(() => 0),
    finished: STRUCTURE_KINDS.map(() => 0),
  };
  world.factions.push(faction);
  return faction;
}
