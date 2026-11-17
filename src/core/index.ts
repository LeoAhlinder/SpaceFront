/**
 * Public API of the simulation. Code outside core imports only from this file
 * (and the client/shared folders only import *types* from it).
 */
export { addBot, aiSystem } from "./ai/bot";
export { applyCommands, queueCommand } from "./commands/applyCommands";
export type {
  AttackCommand,
  BuildCommand,
  Command,
  LaunchCommand,
  SetRatioCommand,
  SpawnCommand,
} from "./commands/commands";
export { validateCommand } from "./commands/validate";
export { TICK_MS } from "./constants";
export { drainDelta, FACTION_STATS_STRIDE, trackChanges } from "./delta/delta";
export type { ShipView, StructureView, TickDelta } from "./delta/delta";
export { assert, AssertionError } from "./debug";
export { Band, BAND_KEYS, PolarGrid } from "./grid/polarGrid";
export { RectGrid } from "./grid/rectGrid";
export { isOwnableTerrain, Terrain, TERRAIN_COST_PCT } from "./grid/terrain";
export type { TileGrid } from "./grid/tileGrid";
export { factionId, gridId, MAX_FACTION_ID, NEUTRAL } from "./ids";
export type { FactionId, GridId } from "./ids";
export { decodeTerrain, encodeTerrain, loadTerrainMap } from "./map/terrainMap";
export type { MapRegion, TerrainMap } from "./map/terrainMap";
export * from "./math/fixed";
export { Rng } from "./math/rng";
export { ANGLE_FULL, ANGLE_HALF, ANGLE_QUARTER, fxCos, fxSin } from "./math/trig";
export { hashWorld } from "./serialize/hash";
export {
  bodyPosition,
  coronaArc,
  coronaTilePoint,
  distance,
  isqrt,
  pathLength,
  planFlight,
} from "./space/space";
export type { Endpoint, Flight, Point } from "./space/space";
export { attackSystem, beginAttack, startAttack } from "./systems/attack";
export { coronaSystem, foundSunBase, siphonIncomeMilli } from "./systems/corona";
export { applyLaunch, endpointOf, planRoute, shipSystem } from "./systems/ships";
export type { Route } from "./systems/ships";
export {
  applyBuild,
  buildCost,
  constructionSystem,
  tooCloseToStructure,
} from "./systems/structures";
export { incomeSystem } from "./systems/income";
export { deliver, isPort, tradeSystem } from "./systems/trade";
export { finishedCounts, gridModifier, weightedModifier } from "./world/modifiers";
export { populationCap, populationSystem } from "./systems/population";
export { victorySystem } from "./systems/victory";
export { runTick, runTicks, SYSTEMS } from "./tick";
export type { RejectedCommand, System, TickContext } from "./tick";
export { eliminate, setOwner } from "./world/territory";
export { refGrid, refTile, tileRef } from "./world/tileRef";
export type { TileRef } from "./world/tileRef";
export {
  addFaction,
  addTroops,
  coronaTiles,
  createWorld,
  gridOf,
  inSpawnPhase,
  isCorona,
  landTiles,
  troopPool,
} from "./world/world";
export type {
  Attack,
  BodyConfig,
  BotState,
  ChangeLog,
  Difficulty,
  Faction,
  FactionKind,
  MatchConfig,
  Ship,
  ShipKind,
  Structure,
  StructureKind,
  World,
} from "./world/world";
