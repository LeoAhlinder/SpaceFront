/**
 * Difficulty levels (GAMEPLAY_PLAN.md §4): which nations show up, how many
 * colonies they have, and how smart and strong their AI is. Every number is
 * an integer; "Pct" is percent (100 = ×1).
 */
import type { NationTier } from "./nations";

export type DifficultyId = "easy" | "normal" | "hard" | "impossible";

/**
 * How a nation's utility AI weighs its options (ARCHITECTURE.md §4.8). Picked
 * from the nation's tier and the match difficulty.
 */
export interface AiProfile {
  /** 0–100: how much it likes attacking neighbors over peaceful expansion. */
  readonly aggression: number;
  /** 0–100: preference for structures (Spaceports, Habitats, siphons). */
  readonly builder: number;
  /** 0–100: preference for leaving home: landers to other worlds, Sun Bases. 0 = never. */
  readonly spacefaring: number;
  /** 0–100: chance to keep an alliance when tempted to break it; also how readily it accepts one. */
  readonly loyalty: number;
  /** Decides every reactionTicks + 0..reactionTicks/2 ticks. */
  readonly reactionTicks: number;
  /**
   * Only sends troops out (attacks, landers) while its population is above
   * this percent of its cap. Growth is fastest a bit below half the cap, so
   * smart profiles keep it there and spend only the surplus.
   */
  readonly spendAbovePopPct: number;
  /** Most attacks it runs at once. */
  readonly maxAttacks: number;
  /** Attacks factions whose troop density is below this percent of its own. */
  readonly attackWeakerThanPct: number;
  /** Percent of the attack troops it commits per attack (min, max). */
  readonly attackRatioMinPct: number;
  readonly attackRatioMaxPct: number;
  /** Ally against, and attack, whoever leads once they hold leaderSharePct of the land. */
  readonly gangUpOnLeader: boolean;
  /** Asks its allies to join its wars (with an "attack" signal) and answers theirs. */
  readonly coordinated: boolean;
  /** Sends landers at enemy Solar Siphons and Sun Bases (capturing them with the tile). */
  readonly raidsSiphons: boolean;
  /** 0–100: preference for Shield Generators and Orbital Defense Platforms. 0 = never. */
  readonly defense: number;
  /** 0–100: preference for Warships (guarding its siphons and worlds, hunting siphons). 0 = never. */
  readonly warships: number;
  /** 0–100: preference for Launch Silos, Kinetic Strikes and Antimatter Warheads. 0 = never. */
  readonly weapons: number;
  /** Fires Kinetic Strikes at enemy Solar Siphons (needs `weapons`). */
  readonly strikesSiphons: boolean;
  /** Economy bonuses for the nation (100 = none). buildTimePct < 100 builds faster. */
  readonly bonus: {
    readonly growthPct: number;
    readonly incomePct: number;
    readonly buildTimePct: number;
  };
}

export interface DifficultyDef {
  readonly id: DifficultyId;
  readonly name: string;
  readonly description: string;
  /** How many nations of each tier spawn on Earth. */
  readonly nations: Readonly<Record<NationTier, number>>;
  /** How many colonies spawn on other worlds (on the bodies below). */
  readonly colonies: number;
  readonly colonyBodies: readonly string[];
  readonly profiles: Readonly<Record<NationTier, AiProfile>>;
}

/**
 * Tier 1 plays the full profile. Tier 2 is a bit less spacefaring; Tier 3
 * plays like a stronger bot: it builds less and rarely leaves home.
 */
function tiered(p: AiProfile): Record<NationTier, AiProfile> {
  return {
    1: p,
    2: { ...p, spacefaring: Math.floor((p.spacefaring * 3) / 4) },
    3: {
      ...p,
      builder: Math.floor(p.builder / 2),
      spacefaring: Math.floor(p.spacefaring / 4),
      raidsSiphons: false,
      defense: Math.floor(p.defense / 2),
      warships: 0,
      weapons: 0,
      strikesSiphons: false,
    },
  };
}

const JUPITER_MOONS = ["io", "europa", "ganymede", "callisto"];

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    name: "Easy",
    description: "6 smaller nations, few colonies. Passive, slow to build.",
    nations: { 1: 0, 2: 1, 3: 5 },
    colonies: 1,
    colonyBodies: ["moon", "mars"],
    profiles: tiered({
      aggression: 15,
      builder: 25,
      spacefaring: 10,
      loyalty: 90,
      reactionTicks: 30,
      spendAbovePopPct: 0,
      maxAttacks: 1,
      attackWeakerThanPct: 50,
      attackRatioMinPct: 15,
      attackRatioMaxPct: 30,
      gangUpOnLeader: false,
      coordinated: false,
      raidsSiphons: false,
      defense: 0,
      warships: 0,
      weapons: 0,
      strikesSiphons: false,
      bonus: { growthPct: 75, incomePct: 100, buildTimePct: 100 },
    }),
  },
  normal: {
    id: "normal",
    name: "Normal",
    description: "12 nations with 1–2 space powers. Expand steadily and defend.",
    nations: { 1: 2, 2: 3, 3: 7 },
    colonies: 3,
    colonyBodies: ["moon", "mars", "venus", "europa", "titan"],
    profiles: tiered({
      aggression: 35,
      builder: 50,
      spacefaring: 30,
      loyalty: 75,
      reactionTicks: 20,
      spendAbovePopPct: 8,
      maxAttacks: 2,
      attackWeakerThanPct: 70,
      attackRatioMinPct: 25,
      attackRatioMaxPct: 45,
      gangUpOnLeader: false,
      coordinated: false,
      raidsSiphons: false,
      defense: 30,
      warships: 15,
      weapons: 0,
      strikesSiphons: false,
      bonus: { growthPct: 100, incomePct: 100, buildTimePct: 100 },
    }),
  },
  hard: {
    id: "hard",
    name: "Hard",
    description: "20 nations, every space power, colonies on Mars, the Moon and Jupiter's moons.",
    nations: { 1: 5, 2: 7, 3: 8 },
    colonies: 8,
    colonyBodies: ["moon", "mars", ...JUPITER_MOONS],
    profiles: tiered({
      aggression: 60,
      builder: 70,
      spacefaring: 55,
      loyalty: 55,
      reactionTicks: 12,
      spendAbovePopPct: 30,
      maxAttacks: 3,
      attackWeakerThanPct: 90,
      attackRatioMinPct: 35,
      attackRatioMaxPct: 60,
      gangUpOnLeader: true,
      coordinated: false,
      raidsSiphons: false,
      defense: 50,
      warships: 40,
      weapons: 40,
      strikesSiphons: false,
      bonus: { growthPct: 115, incomePct: 115, buildTimePct: 100 },
    }),
  },
  impossible: {
    id: "impossible",
    name: "Impossible",
    description: "30 nations, colonies everywhere, coordinated invasions and siphon raids.",
    nations: { 1: 5, 2: 10, 3: 15 },
    colonies: 16,
    colonyBodies: [
      "mercury",
      "venus",
      "moon",
      "mars",
      "belt",
      ...JUPITER_MOONS,
      "titan",
      "enceladus",
      "triton",
    ],
    profiles: tiered({
      aggression: 80,
      builder: 85,
      spacefaring: 75,
      loyalty: 40,
      reactionTicks: 8,
      spendAbovePopPct: 35,
      maxAttacks: 4,
      attackWeakerThanPct: 110,
      attackRatioMinPct: 45,
      attackRatioMaxPct: 75,
      gangUpOnLeader: true,
      coordinated: true,
      raidsSiphons: true,
      defense: 70,
      warships: 60,
      weapons: 60,
      strikesSiphons: true,
      bonus: { growthPct: 135, incomePct: 135, buildTimePct: 60 },
    }),
  },
} as const satisfies Record<DifficultyId, DifficultyDef>;

export const DIFFICULTY_IDS: readonly DifficultyId[] = ["easy", "normal", "hard", "impossible"];
