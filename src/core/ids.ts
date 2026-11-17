/**
 * Branded id types. They are plain numbers at runtime, but the compiler stops
 * a FactionId from being passed where a GridId is expected.
 */
export type FactionId = number & { readonly __brand: "FactionId" };
export type GridId = number & { readonly __brand: "GridId" };

/** Faction id 0 is always "nobody": unowned tiles belong to it. */
export const NEUTRAL = 0 as FactionId;

/** Highest faction id that fits in a tile's Uint16 owner slot. */
export const MAX_FACTION_ID = 0xffff;

export function factionId(n: number): FactionId {
  if (!Number.isInteger(n) || n < 0 || n > MAX_FACTION_ID) {
    throw new RangeError(`Invalid faction id ${n}`);
  }
  return n as FactionId;
}

export function gridId(n: number): GridId {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`Invalid grid id ${n}`);
  return n as GridId;
}
