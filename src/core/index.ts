/**
 * Public API of the simulation. Code outside core imports only from this file
 * (and the client/shared folders only import *types* from it).
 */
export { addBot, aiSystem } from "./ai/bot";
export { addNations } from "./ai/matchSetup";
export { addNation, findLeader, nationOf, nationSystem, receiveSignal } from "./ai/nation";
export type { NationOptions, NationState } from "./ai/nation";
export { applyCommands, queueCommand } from "./commands/applyCommands";
export type {
  AllyCommand,
  AttackCommand,
  BuildCommand,
  Command,
  EmbargoCommand,
  FireWeaponCommand,
  GiftCommand,
  LaunchCommand,
  LaunchWarshipCommand,
  PatrolArea,
  PatrolCommand,
  SetRatioCommand,
  SignalCommand,
  SpawnCommand,
} from "./commands/commands";
export { validateCommand } from "./commands/validate";
export { TICK_MS } from "./constants";
export {
  diplomacySnapshot,
  drainDelta,
  FACTION_STATS_STRIDE,
  trackChanges,
  WARSHIP_STRIDE,
} from "./delta/delta";
export type { DiplomacySnapshot, ShipView, StructureView, TickDelta } from "./delta/delta";
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
  pointAlong,
  stepToward,
} from "./space/space";
export type { Endpoint, Flight, Point } from "./space/space";
export { attackSystem, beginAttack, isShielded, startAttack } from "./systems/attack";
export {
  applyLaunchWarship,
  applyPatrol,
  combatSystem,
  shipPosition,
  warshipCost,
} from "./systems/combat";
export { applyFireWeapon, impact, isIrradiated } from "./systems/weapons";
export { tilesWithin } from "./grid/area";
export { SpatialHash } from "./space/spatialHash";
export {
  addStructure,
  destroyStructure,
  firstOwned,
  KIND_CODE,
  ownedOfKind,
  structuresOn,
} from "./world/structureIndex";
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
export {
  alliesOf,
  breakAlliance,
  hasEmbargo,
  hasRequest,
  isAllied,
  isTraitor,
  makeAlliance,
  requestAlliance,
  setIndependent,
} from "./world/diplomacy";
export type { Diplomacy, GameEvent, SignalKind } from "./world/diplomacy";
export { eliminate, setOwner } from "./world/territory";
export { refGrid, refTile, tileRef } from "./world/tileRef";
export type { TileRef } from "./world/tileRef";
export {
  addFaction,
  addTroops,
  coronaTiles,
  STRUCTURE_KINDS,
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
  CombatEffect,
  Difficulty,
  Faction,
  FactionBonus,
  FactionKind,
  Fallout,
  MatchConfig,
  Ship,
  ShipKind,
  Structure,
  StructureKind,
  Warship,
  WeaponKind,
  World,
} from "./world/world";
