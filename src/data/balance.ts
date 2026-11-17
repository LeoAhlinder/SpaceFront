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
    /** Owning this percent of all ownable land wins (the Corona doesn't count). */
    winLandPct: 80,
    /** Bots in a default single-player match. */
    defaultBotCount: 40,
  },

  /** The tutorial match: a quiet solar system with a few bots and no nations. */
  tutorial: {
    botCount: 8,
    /** Starting Solars, so the first Spaceport comes quickly. */
    startSolars: 2_000,
  },

  spawn: {
    /** Tiles within this many steps of the spawn tile are claimed. */
    radius: 4,
    troops: 2_000,
    workers: 1_000,
    /** Solars every faction starts with. */
    solars: 500,
  },

  /** Solars (☉), the only currency (GAMEPLAY_PLAN.md §5). See docs/BALANCE.md for pacing. */
  economy: {
    /** Solars per tick = workers × this / 1000 (× the worlds' income modifiers). */
    workerIncomePermille: 2,
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
    /** Chance per decision to build a Spaceport (if it has none and can afford it). */
    buildPortChancePct: 10,
    /** Chance per decision to build a Habitat (if it can afford it). */
    buildHabitatChancePct: 5,
    /** Chance per decision to send a Sun Base ship (with a Spaceport, no Sun Base yet, and the Solars). */
    sunBaseChancePct: 2,
    /** Bots only attack in the Corona with at least this many Corona troops. */
    minCoronaTroops: 100,
    /** Chance per decision to build a Solar Siphon when it picked one of its Corona tiles. */
    buildSiphonChancePct: 30,
    attackRatioMinPct: 30,
    attackRatioMaxPct: 50,
  },

  /** Alliances, gifts and embargoes (GAMEPLAY_PLAN.md §9). */
  diplomacy: {
    /** An alliance request can be accepted for this long (30 s). */
    requestTicks: 300,
    /** Breaking an alliance marks you a traitor for this long (2 min). */
    traitorTicks: 1_200,
    /** A traitor's attacks cost this percent of the normal troops. */
    traitorAttackCostPct: 130,
  },

  /**
   * Nation AI tuning shared by every difficulty. How aggressive, spacefaring
   * etc. a nation is comes from its AiProfile (data/difficulty.ts).
   */
  nation: {
    /** Own tiles sampled per decision to find neighbors. */
    sampleTiles: 24,
    /** Random tiles tried around the country's spawn tile (within the radius) if it is taken. */
    spawnAttempts: 60,
    spawnSearchRadius: 15,
    /** Extra spawn radius and starting population (percent) per tier. */
    spawnRadiusBonus: { 1: 3, 2: 2, 3: 1 },
    startPopPct: { 1: 250, 2: 175, 3: 125 },
    /** Below this many troops a nation doesn't attack or launch. */
    minTroops: 400,
    /** Percent of troops sent when expanding into neutral land. */
    expandRatioMinPct: 20,
    expandRatioMaxPct: 40,
    /** Random jitter added to every action's score, so equal options alternate. */
    scoreJitter: 20,
    /** Landers need this many troops at home, and carry attackRatio percent of them. */
    landerMinTroops: 2_500,
    /** Random tiles tried per lander decision when looking for a target on another world. */
    landerTargetAttempts: 24,
    /** Corona tiles tried when picking a spot for a Sun Base (the innermost free one wins). */
    sunBaseTargetAttempts: 24,
    /** Most Sun Bases a nation keeps (in flight or founded): spacefaring / this, at least 1. */
    spacefaringPerSunBase: 30,
    /** Raids on enemy siphons send at least this many troops. */
    raidMinTroops: 1_500,
    /** Most allies a nation wants. */
    maxAllies: 3,
    /** Chance per decision (percent) to ask someone for an alliance. */
    allyRequestChancePct: 6,
    /** The leader is ganged up on once it holds this percent of all land… */
    leaderSharePct: 3,
    /** …and at least this percent of the runner-up's land. */
    leaderMarginPct: 130,
    /** Grudge added against whoever betrays the nation, and per decision per attack on it. */
    betrayalGrudge: 300,
    attackedGrudge: 4,
    /** Grudges shrink by this much every decision; the most a grudge from attacks can reach. */
    grudgeDecay: 1,
    maxAttackGrudge: 60,
    /** Ignores its allies' "attack them" calls after this long (1 min). */
    focusTicks: 600,
    /** Percent of its troops a loyal nation sends an ally that calls for help. */
    helpGiftPct: 15,
    /** Grudge against a faction whose weapon hit the nation's land. */
    weaponGrudge: 120,
    /** Most Warships a nation keeps: warships preference / this, at least 1. */
    warshipsPerShip: 20,
    /** After buying a Warship, a nation waits this long before buying another (90 s). */
    warshipCooldownTicks: 900,
    /** Most Orbital Defense Platforms per world, and Shield Generators per 1,000 own tiles. */
    defensesPerWorld: 1,
    shieldsPerKiloTile: 2,
    /** Orbital Defense goes up on worlds where the nation holds at least this many tiles. */
    defendWorldTiles: 500,
    /** Solars a nation keeps after buying a weapon or silo (so it still builds). */
    weaponReserve: 2_000,
  },

  structures: {
    /** No two structures closer than this many steps (Manhattan) on a map. */
    minSpacing: 6,
    /** Each structure of a kind you already own makes the next one cost this percent more. */
    costStepPct: 50,
    spaceport: {
      cost: 1_000,
      buildTicks: 50,
      /** A finished Spaceport sends a Freighter every interval + 0..jitter ticks. */
      tradeIntervalTicks: 200,
      tradeJitterTicks: 100,
    },
    habitat: {
      cost: 800,
      buildTicks: 40,
      /** Extra population cap per finished Habitat. */
      popCap: 3_000,
      /** Extra Solars per tick per finished Habitat. */
      income: 2,
    },
    /** Flown in by a Sun Base ship (paid at launch); acts as a Spaceport and trains corona troops. */
    sunBase: {
      cost: 5_000,
      buildTicks: 0,
    },
    /** An outer-band siphon pays back its first price in about 40 s, like a Habitat; inner in 13 s. */
    solarSiphon: {
      cost: 20_000,
      buildTicks: 60,
    },
    /** Raises the troop cost of attacking its owner's land nearby (see `shield`). */
    shieldGenerator: {
      cost: 3_000,
      buildTicks: 50,
    },
    /** Shoots hostile ships and warheads near its world (see `orbitalDefense`). */
    orbitalDefense: {
      cost: 6_000,
      buildTicks: 80,
    },
    /** Fires Kinetic Strikes and Antimatter Warheads (see `weapons`). */
    launchSilo: {
      cost: 8_000,
      buildTicks: 100,
    },
  },

  /** Hit points of things that can be shot (GAMEPLAY_PLAN.md §6–§8). */
  hp: {
    troopLander: 120,
    freighter: 60,
    sunBaseShip: 150,
    warship: 300,
    kineticStrike: 40,
    antimatterWarhead: 80,
    /** Solar Siphons are the only structures Warships shoot at. */
    solarSiphon: 400,
  },

  /** Space combat: Warships, Orbital Defense Platforms, the spatial hash. */
  combat: {
    /** Targeting and firing run every this many ticks; movement every tick. */
    intervalTicks: 5,
    /** Spatial hash cell size in space units (at least the longest detection range). */
    cellSize: 500,
    /** A patrol point must lie within this distance of the Sun. */
    maxPatrolDistance: 11_000,
  },

  warship: {
    /** Launched from a Spaceport or Sun Base; the price rises with each one owned. */
    cost: 5_000,
    costStepPct: 50,
    /** Space units per tick (landers fly 8, Freighters 10). */
    speed: 9,
    /** Sees (and chases) hostile ships this far away, fires within fireRange. */
    detectRange: 400,
    fireRange: 160,
    /** Damage per shot; one shot per combat interval. */
    damage: 20,
    /** Wanders within this distance of its patrol point. */
    patrolRadius: 250,
  },

  orbitalDefense: {
    /** Shoots hostile ships and warheads within this many space units of its world. */
    range: 300,
    /** Damage per shot to weapons, and to ships and Warships (it is built against warheads). */
    damage: 40,
    shipDamage: 10,
    /** Ticks between shots. */
    reloadTicks: 10,
  },

  shield: {
    /** Land of its owner within this many steps of a finished Shield Generator… */
    radius: 10,
    /** …costs attackers this percent of the normal troops (several shields don't stack). */
    defensePct: 200,
  },

  weapons: {
    /** Space units per tick, and tiles per tick for strikes on the silo's own world. */
    speed: 14,
    tilesPerTick: 6,
    /** A silo reloads for this long after firing. */
    siloReloadTicks: 300,
    kineticStrike: {
      /** Paid per shot (no rising price: weapons are used up). */
      cost: 4_000,
      /** Steps from the impact tile: structures are destroyed and troops killed. */
      radius: 2,
      /** Troops killed per tile hit: flat, plus this percent of the owner's troops per tile. */
      killPerTile: 60,
      killDensityPct: 300,
    },
    antimatterWarhead: {
      cost: 25_000,
      /** Steps from the impact tile: territory turns neutral and structures are destroyed. */
      radius: 10,
      /** The owner also loses this percent of its troops per tile for each tile wiped. */
      killDensityPct: 200,
      /** The wiped area stays irradiated this long (5 minutes)… */
      falloutTicks: 3_000,
      /** …while taking a tile there costs this percent of the troops, and nothing can be built. */
      falloutCostPct: 400,
    },
  },

  trade: {
    /** Solars each side earns per delivered Freighter: base + route length × perUnit / 1000. */
    base: 60,
    perUnitPermille: 60,
    /** Tile hops on one map count this many space units per tile. */
    unitsPerTile: 4,
    /** Freighter speed in space units per tick. */
    freighterSpeed: 10,
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

  /**
   * The Corona: claimable space around the Sun (GAMEPLAY_PLAN.md §5). A polar
   * grid of rings × sectors between the Sun's heat zone and Mercury's orbit.
   * Ring 0 is the innermost. See docs/BALANCE.md for the intended economy.
   */
  corona: {
    rings: 24,
    sectors: 256,
    /** Rings 0..innerRings-1 are the inner band, the next middleRings the middle band. */
    innerRings: 8,
    middleRings: 8,
    /** Space units from the Sun's center: just outside the heat zone, inside Mercury's orbit. */
    innerRadius: 700,
    outerRadius: 1060,
    /** The corona system runs its slow work (training, heat, decay) every this many ticks. */
    intervalTicks: 10,
    /**
     * Heat drain per interval, per band: this share (per
     * thousand) of the corona troops standing on that band's tiles is lost.
     */
    heatDrainPermille: { inner: 20, middle: 8, outer: 0 },
    /** Corona tiles cut off from every Sun Base of their owner turn neutral, this many per interval. */
    decayTilesPerInterval: 3,
  },

  sunBase: {
    /** Tiles within this many steps of the landing tile are claimed (only neutral ones). */
    claimRadius: 3,
    /** Corona troops each finished Sun Base trains per corona interval… */
    trainTroops: 20,
    /** …until the faction's corona troops reach this many per Sun Base. */
    troopCapPerBase: 1_500,
  },

  solarSiphon: {
    /** Solars per tick of one siphon in the outer band; the bands multiply it. */
    baseIncome: 50,
    /** Output multiplier (percent) per band. */
    bandPct: { inner: 300, middle: 200, outer: 100 },
    /**
     * Diminishing returns: a faction's siphons are ranked best band first, and
     * the n-th (0-based) pays 100 − n × stepPct percent, but at least minPct.
     */
    diminishStepPct: 15,
    diminishMinPct: 25,
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
