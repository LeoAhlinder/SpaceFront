/**
 * The solar system (GAMEPLAY_PLAN.md §2). Distances and orbit times are
 * compressed for play: orbit radii are roughly log-scaled, and one Earth orbit
 * takes 9,000 ticks (15 minutes). Outer orbits are slower (Kepler-like).
 *
 * Space units are integers; the whole system fits in about ±9,500 units.
 * Angles are core angle units (4096 per turn).
 */

export type BodyKind = "star" | "planet" | "moon" | "gasGiant" | "belt";

/** How a generated map looks: share of each terrain (percent; the rest is plains). */
export interface TerrainProfile {
  /** Share of the map that is unownable (seas on rocky worlds, void in the belt). */
  readonly waterPct: number;
  readonly highlandsPct: number;
  readonly mountainsPct: number;
  readonly icePct: number;
  /** Many small islands instead of continents (the asteroid belt). */
  readonly islands?: boolean;
}

/** Percent multipliers for a world's land (100 = normal; omitted = 100). */
export interface WorldModifiers {
  /** Worker income from land here. */
  readonly incomePct?: number;
  /** Population growth from land here. */
  readonly growthPct?: number;
  /** Cost for attackers to take enemy land here. */
  readonly defensePct?: number;
  /** Cost of structures built here. */
  readonly buildCostPct?: number;
}

export interface BodyDef {
  readonly id: string;
  readonly name: string;
  readonly kind: BodyKind;
  /** Body it orbits; omitted means it orbits the Sun (or is the Sun). */
  readonly parent?: string;
  /** Orbit radius in space units around the parent (0 for the Sun). */
  readonly orbitRadius: number;
  /** Ticks per full orbit (0 = doesn't move). */
  readonly orbitTicks: number;
  /** Starting angle in angle units (0–4095). */
  readonly phase: number;
  /** Size of the body in the system view, in space units. */
  readonly radius: number;
  /** Ships must keep at least this far from the center (Sun's heat zone, gas giants). 0 = none. */
  readonly avoidRadius: number;
  /** Gameplay modifiers in percent (100 = normal) for land on this body. */
  readonly modifiers?: WorldModifiers;
  /** Landable bodies have a flat map. */
  readonly map?: {
    readonly width: number;
    readonly height: number;
    /** Map files in public/maps/<mapId>/. */
    readonly mapId: string;
    /** For generated maps (everything but Earth). */
    readonly terrain?: TerrainProfile;
  };
}

const rock = (water: number, high: number, mount: number, ice = 0): TerrainProfile => ({
  waterPct: water,
  highlandsPct: high,
  mountainsPct: mount,
  icePct: ice,
});

export const SOLAR_SYSTEM: readonly BodyDef[] = [
  {
    id: "sun",
    name: "Sun",
    kind: "star",
    orbitRadius: 0,
    orbitTicks: 0,
    phase: 0,
    radius: 320,
    avoidRadius: 650,
  },
  {
    id: "mercury",
    name: "Mercury",
    kind: "planet",
    orbitRadius: 1150,
    orbitTicks: 3_000,
    phase: 300,
    radius: 45,
    avoidRadius: 0,
    modifiers: { growthPct: 80, incomePct: 110 },
    map: { width: 240, height: 120, mapId: "mercury", terrain: rock(8, 30, 15) },
  },
  {
    id: "venus",
    name: "Venus",
    kind: "planet",
    orbitRadius: 1750,
    orbitTicks: 5_500,
    phase: 1500,
    radius: 65,
    avoidRadius: 0,
    modifiers: { growthPct: 75, defensePct: 140 },
    map: { width: 480, height: 240, mapId: "venus", terrain: rock(5, 35, 12) },
  },
  {
    id: "earth",
    name: "Earth",
    kind: "planet",
    orbitRadius: 2500,
    orbitTicks: 9_000,
    phase: 0,
    radius: 70,
    avoidRadius: 0,
    modifiers: { growthPct: 120 },
    map: { width: 800, height: 386, mapId: "earth" },
  },
  {
    id: "moon",
    name: "Moon",
    kind: "moon",
    parent: "earth",
    orbitRadius: 200,
    orbitTicks: 1_800,
    phase: 1000,
    radius: 25,
    avoidRadius: 0,
    modifiers: { buildCostPct: 70 },
    map: { width: 200, height: 100, mapId: "moon", terrain: rock(0, 30, 10) },
  },
  {
    id: "mars",
    name: "Mars",
    kind: "planet",
    orbitRadius: 3300,
    orbitTicks: 13_700,
    phase: 2600,
    radius: 55,
    avoidRadius: 0,
    map: { width: 400, height: 200, mapId: "mars", terrain: rock(6, 25, 10, 4) },
  },
  {
    id: "belt",
    name: "Asteroid Belt",
    kind: "belt",
    orbitRadius: 4200,
    orbitTicks: 19_600,
    phase: 3600,
    radius: 60,
    avoidRadius: 0,
    modifiers: { incomePct: 125, growthPct: 85 },
    map: {
      width: 360,
      height: 180,
      mapId: "belt",
      terrain: { waterPct: 70, highlandsPct: 25, mountainsPct: 15, icePct: 5, islands: true },
    },
  },
  {
    id: "jupiter",
    name: "Jupiter",
    kind: "gasGiant",
    orbitRadius: 5400,
    orbitTicks: 28_600,
    phase: 700,
    radius: 160,
    avoidRadius: 220,
  },
  {
    id: "io",
    name: "Io",
    kind: "moon",
    parent: "jupiter",
    orbitRadius: 300,
    orbitTicks: 1_200,
    phase: 0,
    radius: 22,
    avoidRadius: 0,
    modifiers: { incomePct: 150, growthPct: 85 },
    map: { width: 150, height: 75, mapId: "io", terrain: rock(0, 30, 20) },
  },
  {
    id: "europa",
    name: "Europa",
    kind: "moon",
    parent: "jupiter",
    orbitRadius: 380,
    orbitTicks: 1_700,
    phase: 1000,
    radius: 20,
    avoidRadius: 0,
    modifiers: { growthPct: 130 },
    map: { width: 140, height: 70, mapId: "europa", terrain: rock(0, 10, 5, 60) },
  },
  {
    id: "ganymede",
    name: "Ganymede",
    kind: "moon",
    parent: "jupiter",
    orbitRadius: 470,
    orbitTicks: 2_400,
    phase: 2000,
    radius: 28,
    avoidRadius: 0,
    map: { width: 200, height: 100, mapId: "ganymede", terrain: rock(0, 25, 10, 25) },
  },
  {
    id: "callisto",
    name: "Callisto",
    kind: "moon",
    parent: "jupiter",
    orbitRadius: 560,
    orbitTicks: 3_200,
    phase: 3000,
    radius: 26,
    avoidRadius: 0,
    map: { width: 180, height: 90, mapId: "callisto", terrain: rock(0, 20, 15, 30) },
  },
  {
    id: "saturn",
    name: "Saturn",
    kind: "gasGiant",
    orbitRadius: 6700,
    orbitTicks: 39_500,
    phase: 1900,
    radius: 140,
    avoidRadius: 200,
  },
  {
    id: "titan",
    name: "Titan",
    kind: "moon",
    parent: "saturn",
    orbitRadius: 420,
    orbitTicks: 2_800,
    phase: 500,
    radius: 28,
    avoidRadius: 0,
    modifiers: { incomePct: 115, growthPct: 110 },
    map: { width: 200, height: 100, mapId: "titan", terrain: rock(15, 20, 8, 10) },
  },
  {
    id: "enceladus",
    name: "Enceladus",
    kind: "moon",
    parent: "saturn",
    orbitRadius: 300,
    orbitTicks: 1_500,
    phase: 2500,
    radius: 14,
    avoidRadius: 0,
    map: { width: 80, height: 40, mapId: "enceladus", terrain: rock(0, 10, 5, 70) },
  },
  {
    id: "uranus",
    name: "Uranus",
    kind: "gasGiant",
    orbitRadius: 8000,
    orbitTicks: 51_500,
    phase: 3100,
    radius: 100,
    avoidRadius: 150,
  },
  {
    id: "neptune",
    name: "Neptune",
    kind: "gasGiant",
    orbitRadius: 9200,
    orbitTicks: 63_500,
    phase: 400,
    radius: 100,
    avoidRadius: 150,
  },
  {
    id: "triton",
    name: "Triton",
    kind: "moon",
    parent: "neptune",
    orbitRadius: 260,
    orbitTicks: 2_000,
    phase: 1500,
    radius: 16,
    avoidRadius: 0,
    modifiers: { incomePct: 130, growthPct: 80 },
    map: { width: 100, height: 50, mapId: "triton", terrain: rock(0, 15, 10, 50) },
  },
];

/** Bodies with a map, in system order. In a solar-system match, grid i is the i-th of these. */
export const LANDABLE_BODIES: readonly BodyDef[] = SOLAR_SYSTEM.filter((b) => b.map);

export function bodyById(id: string): BodyDef {
  const body = SOLAR_SYSTEM.find((b) => b.id === id);
  if (!body) throw new Error(`Unknown body "${id}"`);
  return body;
}

/** A modifier of a body (100 when not set). */
export function modifierOf(body: BodyDef | undefined, key: keyof WorldModifiers): number {
  return body?.modifiers?.[key] ?? 100;
}

export type StructureCostKind = "spaceport" | "habitat" | "sunBase" | "solarSiphon";

/**
 * Solars to build a structure: the base cost, plus costStepPct percent for
 * each one of that kind the faction already owns, times the world's
 * buildCostPct. Shared by the simulation and the client's build menu.
 */
export function structureCost(
  base: number,
  stepPct: number,
  owned: number,
  worldPct: number,
): number {
  return Math.floor((((base * (100 + owned * stepPct)) / 100) * worldPct) / 100);
}
