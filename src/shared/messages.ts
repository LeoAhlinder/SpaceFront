/**
 * Every message between the client (main thread) and the simulation worker.
 * Types only: no logic lives in shared/.
 */
import type { Command, FactionKind, TickDelta } from "../core";

/** What the player picked in the menu. The worker turns it into a MatchConfig. */
export interface MatchSetup {
  readonly seed: number;
  /** Kept for future map choices; a match is always the solar system for now. */
  readonly mapId: "sol";
  readonly botCount: number;
  readonly playerName: string;
}

/** Client → worker. */
export type ClientMessage =
  | { readonly type: "start"; readonly setup: MatchSetup }
  | { readonly type: "pause"; readonly paused: boolean }
  | { readonly type: "command"; readonly command: Command };

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
}

/** Worker → client. */
export type WorkerMessage =
  | { readonly type: "init"; readonly init: MatchInit }
  | { readonly type: "tick"; readonly delta: TickDelta }
  | { readonly type: "error"; readonly message: string };
