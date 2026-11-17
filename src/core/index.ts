/**
 * Public API of the simulation. Code outside core imports only from this file
 * (and the client/shared folders only import *types* from it).
 */
export { applyCommands, queueCommand } from "./commands/applyCommands";
export type { AttackCommand, Command, SetRatioCommand, SpawnCommand } from "./commands/commands";
export { validateCommand } from "./commands/validate";
export { TICK_MS } from "./constants";
export { assert, AssertionError } from "./debug";
export { DiscGrid } from "./grid/discGrid";
export { isOwnableTerrain, Terrain, TERRAIN_COST_PCT } from "./grid/terrain";
export type { TileGrid } from "./grid/tileGrid";
export { factionId, gridId, MAX_FACTION_ID, NEUTRAL } from "./ids";
export type { FactionId, GridId } from "./ids";
export * from "./math/fixed";
export { Rng } from "./math/rng";
export { ANGLE_FULL, ANGLE_HALF, ANGLE_QUARTER, fxCos, fxSin } from "./math/trig";
export { hashWorld } from "./serialize/hash";
export { attackSystem, startAttack } from "./systems/attack";
export { populationCap, populationSystem } from "./systems/population";
export { runTick, runTicks, SYSTEMS } from "./tick";
export type { RejectedCommand, System, TickContext } from "./tick";
export { eliminate, setOwner } from "./world/territory";
export { addFaction, createWorld } from "./world/world";
export type {
  Attack,
  BodyConfig,
  Difficulty,
  Faction,
  FactionKind,
  MatchConfig,
  World,
} from "./world/world";
