import { BALANCE } from "../../data/balance";

/**
 * Terrain type per tile (stored in a Uint8Array). Expansion costs come from
 * BALANCE.terrainCostPct.
 */
export const Terrain = {
  /** Outside a body. Can never be owned. */
  Space: 0,
  /** Water on Earth (and later icy seas). Can't be owned. */
  Ocean: 1,
  Plains: 2,
  Highlands: 3,
  Mountains: 4,
  Ice: 5,
} as const;

export type Terrain = (typeof Terrain)[keyof typeof Terrain];

const C = BALANCE.terrainCostPct;

/** Cost multiplier (percent) indexed by Terrain value. 0 = not ownable. */
export const TERRAIN_COST_PCT: readonly number[] = [
  C.space,
  C.ocean,
  C.plains,
  C.highlands,
  C.mountains,
  C.ice,
];

/** True if tiles of this terrain can be owned by a faction. */
export function isOwnableTerrain(terrain: number): boolean {
  return (TERRAIN_COST_PCT[terrain] ?? 0) > 0;
}
