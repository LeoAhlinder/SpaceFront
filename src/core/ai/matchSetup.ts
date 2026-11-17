import type { DifficultyId } from "../../data/difficulty";
import { DIFFICULTIES } from "../../data/difficulty";
import type { NationDef, NationTier } from "../../data/nations";
import { colonyName, NATIONS } from "../../data/nations";
import { gridId } from "../ids";
import type { MapRegion } from "../map/terrainMap";
import { Rng } from "../math/rng";
import type { Faction, World } from "../world/world";
import { addNation } from "./nation";

/** RNG stream for picking which nations and colonies take part. */
const SETUP_STREAM = 11;

const TIERS: readonly NationTier[] = [1, 2, 3];

/**
 * Adds the nations and colonies of a difficulty (data/difficulty.ts) to a
 * solar-system match: the right number of countries per tier, picked by the
 * match seed, each spawning at its country on Earth, then colonies of the
 * biggest space powers on the allowed worlds. `earthRegions` are the Earth
 * map's regions (keyed by ISO code). Call before anyone has spawned.
 * Returns the added factions, nations first, then colonies.
 */
export function addNations(
  world: World,
  difficulty: DifficultyId,
  earthRegions: readonly MapRegion[],
): Faction[] {
  const d = DIFFICULTIES[difficulty];
  const earth = world.gridBodies.indexOf("earth");
  if (earth < 0) throw new Error("Nations need Earth in the match");
  const rng = Rng.fromSeed(world.config.seed, SETUP_STREAM);
  const regions = new Map(earthRegions.map((r) => [r.code, r]));

  const picked: { def: NationDef; faction: Faction }[] = [];
  for (const tier of TIERS) {
    const pool: NationDef[] = NATIONS.filter((n) => n.tier === tier && regions.has(n.region));
    shuffle(pool, rng);
    for (const def of pool.slice(0, d.nations[tier])) {
      const faction = addNation(world, def.name, {
        nationId: def.id,
        tier,
        profile: d.profiles[tier],
        homeGrid: gridId(earth),
        spawnTile: regions.get(def.region)!.spawnTile,
      });
      picked.push({ def, faction });
    }
  }

  // Colonies: round-robin over the nations (Tier 1 first), each taking its
  // next favorite world the difficulty allows, until there are enough.
  const added = picked.map((p) => p.faction);
  const allowed = (body: string) =>
    (d.colonyBodies as readonly string[]).includes(body) && world.gridBodies.includes(body);
  const options = picked.map((p) => p.def.colonies.filter(allowed));
  let colonies = 0;
  for (let round = 0; colonies < d.colonies; round++) {
    let any = false;
    for (let i = 0; i < picked.length && colonies < d.colonies; i++) {
      const body = options[i]![round];
      if (body === undefined) continue;
      any = true;
      const { def, faction } = picked[i]!;
      added.push(
        addNation(world, colonyName(def, body), {
          nationId: def.id,
          tier: def.tier,
          profile: d.profiles[def.tier],
          homeGrid: gridId(world.gridBodies.indexOf(body)),
          spawnTile: -1,
          home: faction.id,
        }),
      );
      colonies++;
    }
    if (!any) break; // every nation is out of options
  }
  return added;
}

/** Fisher–Yates shuffle with the given stream. */
function shuffle<T>(items: T[], rng: Rng): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}
