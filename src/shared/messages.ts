/**
 * Every message between the client (main thread) and the simulation worker.
 * Types only: no logic lives in shared/.
 */
import type {
  Command,
  Difficulty,
  DiplomacySnapshot,
  FactionKind,
  TickDelta,
  WorldSnapshot,
} from "../core";

/** What the player picked in the menu. The worker turns it into a MatchConfig. */
export interface MatchSetup {
  readonly seed: number;
  /** Kept for future map choices; a match is always the solar system for now. */
  readonly mapId: "sol";
  readonly botCount: number;
  readonly playerName: string;
  /** Which nations and colonies play, and how smart they are (data/difficulty.ts). */
  readonly difficulty: Difficulty;
  /** Dev builds only (`?solars=N` in the URL): the player's starting Solars. */
  readonly devStartSolars?: number;
  /** The tutorial: no nations, a few bots, no spawn phase, some starting Solars. */
  readonly tutorial?: boolean;
}

/** A player command and the tick it was queued on: one entry of a replay. */
export interface ReplayCommand {
  readonly tick: number;
  readonly command: Command;
}

/**
 * A replay (ARCHITECTURE.md §9): the match setup (seed and config) and every
 * command the player gave. AI commands aren't stored: the AI runs inside the
 * deterministic simulation and makes the same choices again.
 */
export interface ReplayLog {
  readonly format: "spacefront-replay";
  readonly version: number;
  readonly setup: MatchSetup;
  readonly commands: readonly ReplayCommand[];
  /** The last tick recorded, and the world's hash there (to detect a replay gone out of sync). */
  readonly endTick: number;
  readonly endHash: number;
}

/** What a save or replay list shows about one entry. */
export interface MatchSummary {
  readonly tick: number;
  readonly difficulty: Difficulty;
  readonly tutorial: boolean;
  /** The player's share of the land, in percent. */
  readonly landPct: number;
}

/** Client → worker. */
export type ClientMessage =
  | { readonly type: "start"; readonly setup: MatchSetup }
  | { readonly type: "pause"; readonly paused: boolean }
  | { readonly type: "command"; readonly command: Command }
  /** Asks for a save of the running match (answered with saveData). */
  | { readonly type: "save"; readonly requestId: number }
  /** Asks for the running match's replay so far (answered with replayData). */
  | { readonly type: "getReplay"; readonly requestId: number }
  /** Continues a saved match (answered with init, or error). */
  | { readonly type: "load"; readonly data: Uint8Array }
  /** Plays a replay (answered with init; the player can't give commands). */
  | { readonly type: "watchReplay"; readonly data: Uint8Array }
  /** Simulation speed: 1 = normal (replays only). */
  | { readonly type: "setSpeed"; readonly speed: number };

/** Static data sent once when a match starts. */
export interface MatchInit {
  readonly playerId: number;
  readonly spawnPhaseTicks: number;
  /** Ownable land tiles in the world; owning winLandPct percent of them wins. */
  readonly ownableTiles: number;
  readonly winLandPct: number;
  /** Body maps, indexed by grid id. */
  readonly grids: readonly GridInit[];
  /** The Corona around the Sun (its grid id comes right after the bodies), or null. */
  readonly corona: CoronaInit | null;
  readonly factions: readonly FactionInit[];
  /** Alliances at the start (colonies are allied with their home nation). */
  readonly diplomacy: DiplomacySnapshot;
  readonly difficulty: Difficulty;
  /** The tick the match is at (0 for a new match; later for a loaded save or replay). */
  readonly tick: number;
  /** Structures, ships and fallout already there (a loaded save). */
  readonly snapshot: WorldSnapshot;
  /** The player's troops-vs-workers setting. */
  readonly troopRatioPct: number;
  /** True while watching a replay: nothing the player does is sent. */
  readonly replay: boolean;
  readonly tutorial: boolean;
}

/** The Corona's polar grid: tile = ring × sectors + sector, ring 0 innermost. */
export interface CoronaInit {
  readonly id: number;
  readonly rings: number;
  readonly sectors: number;
  /** Rings in the inner band; the next `middleRings` are the middle band, the rest outer. */
  readonly innerRings: number;
  readonly middleRings: number;
  readonly owner: Uint16Array;
}

export interface GridInit {
  readonly id: number;
  /** Solar-system body this map belongs to (data/bodies.ts). */
  readonly bodyId: string;
  readonly width: number;
  readonly height: number;
  /** Terrain per tile (copied, so the worker's world stays private). */
  readonly terrain: Uint8Array;
  readonly owner: Uint16Array;
}

export interface FactionInit {
  readonly id: number;
  readonly name: string;
  readonly kind: FactionKind;
  /** Nations and colonies: the nation id in data/nations.ts (colors and tier come from there). */
  readonly nationId?: string;
  /** Colonies: the home nation's faction id. */
  readonly homeId?: number;
}

/** Worker → client. */
export type WorkerMessage =
  | { readonly type: "init"; readonly init: MatchInit }
  | { readonly type: "tick"; readonly delta: TickDelta }
  | { readonly type: "error"; readonly message: string }
  | {
      readonly type: "saveData";
      readonly requestId: number;
      readonly data: Uint8Array;
      readonly summary: MatchSummary;
    }
  | {
      readonly type: "replayData";
      readonly requestId: number;
      readonly data: Uint8Array;
      readonly summary: MatchSummary;
    }
  /** A replay reached its last recorded tick; `inSync` is false if its hash didn't match. */
  | { readonly type: "replayEnded"; readonly inSync: boolean };
