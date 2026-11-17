/**
 * The real-world countries that play as nations (GAMEPLAY_PLAN.md §4).
 *
 * Each nation spawns on Earth at its country's spawn tile (the Earth map's
 * regions.json is keyed by ISO 3166-1 numeric codes). Space powers can also
 * have colonies on other worlds, which start allied with their home nation.
 * Which nations show up, and how many colonies, depends on the difficulty
 * (data/difficulty.ts).
 */

/** 1 = space superpower, 2 = space nation, 3 = everyone else ("stronger bots with a flag"). */
export type NationTier = 1 | 2 | 3;

export interface NationDef {
  /** Stable id, used in saves and setup. */
  readonly id: string;
  readonly name: string;
  /** Short name for colonies and tight UI, e.g. "USA" → "USA Mars Colony". */
  readonly short: string;
  readonly tier: NationTier;
  /** Territory color, 0xRRGGBB. Colonies use a lighter shade of it. */
  readonly color: number;
  /** Earth region (ISO numeric code in public/maps/earth/regions.json) the nation spawns in. */
  readonly region: string;
  /** Bodies it may found colonies on, most likely first. Empty for most of Tier 3. */
  readonly colonies: readonly string[];
}

const ALL_MOONS = ["io", "europa", "ganymede", "callisto", "titan", "enceladus", "triton"];

export const NATIONS = [
  // Tier 1: space superpowers.
  {
    id: "usa",
    name: "United States",
    short: "USA",
    tier: 1,
    color: 0x3c6ee6,
    region: "840",
    colonies: ["mars", "moon", "europa", "titan", "belt", "callisto"],
  },
  {
    id: "china",
    name: "China",
    short: "China",
    tier: 1,
    color: 0xe0342c,
    region: "156",
    colonies: ["moon", "mars", "ganymede", "venus", "io", "enceladus"],
  },
  {
    id: "russia",
    name: "Russia",
    short: "Russia",
    tier: 1,
    color: 0x8c3c8c,
    region: "643",
    colonies: ["venus", "moon", "mars", "callisto", "triton"],
  },
  {
    id: "esa",
    name: "European Union",
    short: "ESA",
    tier: 1,
    color: 0x2a3cb4,
    // No EU region on the map: the EU spawns at Brussels (Belgium).
    region: "056",
    colonies: ["europa", "mars", "titan", "mercury", "ganymede"],
  },
  {
    id: "india",
    name: "India",
    short: "India",
    tier: 1,
    color: 0xf08c1e,
    region: "356",
    colonies: ["moon", "mars", "mercury", "io"],
  },
  // Tier 2: space nations.
  {
    id: "japan",
    name: "Japan",
    short: "Japan",
    tier: 2,
    color: 0xf04678,
    region: "392",
    colonies: ["titan", "moon", "belt"],
  },
  {
    id: "uk",
    name: "United Kingdom",
    short: "UK",
    tier: 2,
    color: 0x1e3c78,
    region: "826",
    colonies: ["callisto", "belt"],
  },
  {
    id: "france",
    name: "France",
    short: "France",
    tier: 2,
    color: 0x5a82dc,
    region: "250",
    colonies: ["ganymede", "mercury"],
  },
  {
    id: "germany",
    name: "Germany",
    short: "Germany",
    tier: 2,
    color: 0x505050,
    region: "276",
    colonies: ["io", "enceladus"],
  },
  {
    id: "brazil",
    name: "Brazil",
    short: "Brazil",
    tier: 2,
    color: 0x28a03c,
    region: "076",
    colonies: ["venus", "triton"],
  },
  {
    id: "southKorea",
    name: "South Korea",
    short: "Korea",
    tier: 2,
    color: 0x6e5af0,
    region: "410",
    colonies: ["belt", "moon"],
  },
  {
    id: "canada",
    name: "Canada",
    short: "Canada",
    tier: 2,
    color: 0xc81e1e,
    region: "124",
    colonies: ["enceladus", "callisto"],
  },
  {
    id: "australia",
    name: "Australia",
    short: "Australia",
    tier: 2,
    color: 0xe6be28,
    region: "036",
    colonies: ["mars", "triton"],
  },
  {
    id: "israel",
    name: "Israel",
    short: "Israel",
    tier: 2,
    color: 0x78b4f0,
    region: "376",
    colonies: ["moon"],
  },
  {
    id: "uae",
    name: "United Arab Emirates",
    short: "UAE",
    tier: 2,
    color: 0x14825a,
    region: "784",
    colonies: ["mars"],
  },
  // Tier 3: everyone else, playing like stronger bots with a name and a flag.
  ...[
    ["mexico", "Mexico", "484", 0x006847],
    ["argentina", "Argentina", "032", 0x74acdf],
    ["indonesia", "Indonesia", "360", 0xb43c3c],
    ["turkey", "Turkey", "792", 0xc8102e],
    ["saudiArabia", "Saudi Arabia", "682", 0x1e7832],
    ["iran", "Iran", "364", 0x3c9650],
    ["egypt", "Egypt", "818", 0xc8a03c],
    ["nigeria", "Nigeria", "566", 0x46b450],
    ["southAfrica", "South Africa", "710", 0xe6a01e],
    ["kazakhstan", "Kazakhstan", "398", 0x28b4c8],
    ["pakistan", "Pakistan", "586", 0x0a6432],
    ["ukraine", "Ukraine", "804", 0xf0d200],
    ["spain", "Spain", "724", 0xd23c14],
    ["italy", "Italy", "380", 0x50aa50],
    ["poland", "Poland", "616", 0xdc5a6e],
    ["sweden", "Sweden", "752", 0x2864aa],
    ["mongolia", "Mongolia", "496", 0xa03246],
    ["algeria", "Algeria", "012", 0x2d9b64],
    ["ethiopia", "Ethiopia", "231", 0x8cb428],
    ["kenya", "Kenya", "404", 0x965a32],
    ["drCongo", "DR Congo", "180", 0x3ca0dc],
    ["peru", "Peru", "604", 0xbe3c50],
    ["colombia", "Colombia", "170", 0xf0c828],
    ["chile", "Chile", "152", 0x3250b4],
    ["thailand", "Thailand", "764", 0x6e46a0],
    ["vietnam", "Vietnam", "704", 0xd25028],
    ["norway", "Norway", "578", 0xb42850],
    ["newZealand", "New Zealand", "554", 0x283c64],
  ].map(([id, name, region, color]) => ({
    id: id as string,
    name: name as string,
    short: name as string,
    tier: 3 as const,
    color: color as number,
    region: region as string,
    colonies: [] as readonly string[],
  })),
] as const satisfies readonly NationDef[];

/** How a colony on each body is named: "<short> <label>", e.g. "China Lunar Base". */
export const COLONY_LABELS: Readonly<Record<string, string>> = {
  mercury: "Mercury Station",
  venus: "Venus Outpost",
  moon: "Lunar Base",
  mars: "Mars Colony",
  belt: "Belt Mining Co.",
  io: "Io Foundry",
  europa: "Europa Station",
  ganymede: "Ganymede Colony",
  callisto: "Callisto Base",
  titan: "Titan Outpost",
  enceladus: "Enceladus Station",
  triton: "Triton Outpost",
};

/** Every body a colony can be on (all landable bodies but Earth). */
export const COLONY_BODIES: readonly string[] = [
  "mercury",
  "venus",
  "moon",
  "mars",
  "belt",
  ...ALL_MOONS,
];

export function nationById(id: string): NationDef {
  const nation = NATIONS.find((n) => n.id === id);
  if (!nation) throw new Error(`Unknown nation "${id}"`);
  return nation;
}

export function colonyName(nation: NationDef, body: string): string {
  return `${nation.short} ${COLONY_LABELS[body] ?? "Colony"}`;
}
