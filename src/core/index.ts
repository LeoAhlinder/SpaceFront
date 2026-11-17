/**
 * Public API of the simulation. Code outside core imports only from this file
 * (and the client/shared folders only import *types* from it).
 */
export { TICK_MS } from "./constants";
export { assert, AssertionError } from "./debug";
export { DiscGrid } from "./grid/discGrid";
export { Terrain } from "./grid/terrain";
export type { TileGrid } from "./grid/tileGrid";
export { factionId, gridId, MAX_FACTION_ID, NEUTRAL } from "./ids";
export type { FactionId, GridId } from "./ids";
export * from "./math/fixed";
export { Rng } from "./math/rng";
export { ANGLE_FULL, ANGLE_HALF, ANGLE_QUARTER, fxCos, fxSin } from "./math/trig";
export { hashWorld } from "./serialize/hash";
export { runTick, runTicks, SYSTEMS } from "./tick";
export type { System, TickContext } from "./tick";
export { addFaction, createWorld } from "./world/world";
export type {
  BodyConfig,
  Difficulty,
  Faction,
  FactionKind,
  MatchConfig,
  World,
} from "./world/world";
