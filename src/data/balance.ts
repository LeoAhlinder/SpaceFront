/**
 * Every tunable gameplay number lives here (docs/CODING_STANDARDS.md §6).
 * Systems read from this object; they never hard-code numbers.
 *
 * All values are integers. "Pct" means percent (100 = ×1), "Permille" means
 * per thousand (1000 = ×1).
 */
export const BALANCE = {
  /** Simulation ticks per second. */
  ticksPerSecond: 10,

  match: {
    /** Spawn phase at the start of a match: 10 seconds to pick a spot. */
    spawnPhaseTicks: 100,
    /** Owning this percent of all ownable land wins (Corona excluded later). */
    winLandPct: 80,
    /** Bots in a default single-player match. */
    defaultBotCount: 40,
  },

  spawn: {
    /** Tiles within this many steps of the spawn tile are claimed. */
    radius: 4,
    troops: 2_000,
    workers: 1_000,
  },

  population: {
    /** Population cap = base + tiles × perTile. */
    capBase: 5_000,
    capPerTile: 50,
    /** Growth per tick = (growthBase + pop × growthPermille / 1000) × (cap − pop) / cap. */
    growthBase: 10,
    growthPermille: 3,
    /** Above the cap, the population shrinks by this share of the excess per tick. */
    overCapDecayPermille: 10,
    /** Default share of population that are troops (the rest are workers). */
    defaultTroopRatioPct: 60,
    /** Each tick, up to this share of the population moves between troops and workers. */
    rebalancePermille: 10,
  },

  attack: {
    /** Troops it costs to take one neutral plains tile. */
    neutralCost: 8,
    /** Troops it costs to take one enemy plains tile, before the defender's density. */
    enemyBaseCost: 12,
    /** Extra cost per tile: defender troops-per-tile × this / 100. */
    enemyDensityPct: 120,
    /** Defender loses defender troops-per-tile × this / 100 for each tile taken. */
    defenderLossPct: 80,
    /** Tiles taken per tick = 1 + attack troops / this (capped). */
    troopsPerExtraTile: 200,
    maxTilesPerTick: 40,
    /** Frontier priority: random jitter range, pull toward the clicked tile, gap filling. */
    priorityJitter: 60,
    focusWeight: 2,
    ownedNeighborWeight: 40,
  },

  /** The dumb bots that fill every body (GAMEPLAY_PLAN.md §4). */
  bot: {
    /** A bot decides every interval + 0..jitter ticks. */
    decisionIntervalTicks: 10,
    decisionJitterTicks: 5,
    /** Random tiles tried per decision when looking for a spawn spot. */
    spawnAttempts: 50,
    /** Own tiles sampled per decision to find neighbors (instead of scanning all land). */
    sampleTiles: 16,
    /** Below this many troops a bot waits. */
    minTroops: 300,
    /** Max attacks a bot runs at once. */
    maxRunningAttacks: 2,
    /** Percent of troops sent when expanding into neutral land. */
    expandRatioMinPct: 20,
    expandRatioMaxPct: 40,
    /** Only attack a faction whose troops are below this percent of the bot's. */
    weakerThanPct: 70,
    /** Chance per decision to attack a weaker neighbor while neutral land remains. */
    attackChancePct: 25,
    attackRatioMinPct: 30,
    attackRatioMaxPct: 50,
  },

  structures: {
    /** Ticks to finish building a Spaceport (no Solar cost until M2). */
    spaceportBuildTicks: 50,
    /** No two structures closer than this many steps (Manhattan) on a map. */
    minSpacing: 6,
  },

  ships: {
    /** Troop Lander speed in space units per tick (Earth→Mars ≈ 10–70 s). */
    landerSpeed: 8,
    /** Same-planet hops (e.g. across an ocean) cover this many tiles per tick. */
    landerTilesPerTick: 3,
    /** No flight is shorter than this. */
    minFlightTicks: 10,
    /** Detours pass obstacles at this percent of their avoid radius. */
    avoidMarginPct: 115,
    /** Troops it costs to secure the landing tile. */
    landingCost: 10,
  },

  /** Expansion cost multiplier per terrain, in percent. 0 = can't be owned. */
  terrainCostPct: {
    space: 0,
    ocean: 0,
    plains: 100,
    highlands: 150,
    mountains: 250,
    ice: 175,
  },
} as const satisfies BalanceTable;

interface BalanceTable {
  readonly [key: string]: number | BalanceTable;
}
