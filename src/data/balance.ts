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
