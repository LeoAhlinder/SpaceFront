/**
 * Terrain type per tile (stored in a Uint8Array). Expansion costs per terrain
 * live in data/balance.ts once the attack system exists (M0.3).
 */
export const Terrain = {
  /** Outside a body. Can never be owned. */
  Space: 0,
  /** Water on Earth (and later icy seas). Can't be owned on Earth. */
  Ocean: 1,
  Plains: 2,
  Highlands: 3,
  Mountains: 4,
  Ice: 5,
} as const;

export type Terrain = (typeof Terrain)[keyof typeof Terrain];
