import { BALANCE } from "../data/balance";
import { LANDABLE_BODIES } from "../data/bodies";
import type { GridId, MatchConfig, TerrainMap, World } from "../core";
import {
  addBot,
  addFaction,
  addNations,
  coronaTiles,
  createWorld,
  diplomacySnapshot,
  isOwnableTerrain,
  Rng,
  snapshotViews,
} from "../core";
import type { MatchInit, MatchSetup, MatchSummary } from "../shared/messages";

/** A match as the host runs it: the world and which faction the player is. */
export interface Match {
  readonly world: World;
  readonly playerId: number;
  readonly setup: MatchSetup;
}

/** Every map a solar-system match needs, by map id. */
export const MAP_IDS = LANDABLE_BODIES.map((b) => b.map!.mapId);

/**
 * Builds a new match from the menu's setup: every landable body (grid i =
 * LANDABLE_BODIES[i]) and the Corona, the player, the difficulty's nations
 * and colonies, then bots. Deterministic for a setup, which replays rely on.
 */
export function buildMatch(setup: MatchSetup, maps: ReadonlyMap<string, TerrainMap>): Match {
  const config: MatchConfig = {
    seed: setup.seed,
    difficulty: setup.difficulty,
    bodies: LANDABLE_BODIES.map((b) => ({
      width: b.map!.width,
      height: b.map!.height,
      mapId: b.map!.mapId,
      bodyId: b.id,
    })),
    corona: true,
    // The tutorial lets the player read before spawning: no timed spawn phase.
    spawnPhaseTicks: setup.tutorial ? 0 : BALANCE.match.spawnPhaseTicks,
  };
  const world = createWorld(config, maps);
  const player = addFaction(world, setup.playerName, "player");
  // Dev builds only (?solars=N): a head start for play-testing late-game features.
  if (setup.devStartSolars !== undefined) player.solars = setup.devStartSolars;
  if (setup.tutorial) player.solars = BALANCE.tutorial.startSolars;
  const earth = maps.get("earth");
  if (earth && !setup.tutorial) addNations(world, setup.difficulty, earth.regions);
  const botCount = setup.tutorial ? BALANCE.tutorial.botCount : setup.botCount;
  botHomes(world, botCount, setup.seed).forEach((grid, i) => addBot(world, `Bot ${i + 1}`, grid));
  return { world, playerId: player.id, setup };
}

/** The client's start-up data for a match (new, loaded or replayed). */
export function matchInit(match: Match, replay: boolean): MatchInit {
  const { world, playerId, setup } = match;
  return {
    playerId,
    spawnPhaseTicks: world.config.spawnPhaseTicks ?? 0,
    ownableTiles: world.ownableTiles,
    winLandPct: BALANCE.match.winLandPct,
    grids: world.grids.map((g) => ({
      id: g.id,
      bodyId: world.gridBodies[g.id] ?? "",
      width: g.width,
      height: g.height,
      terrain: g.terrain.slice(),
      owner: g.owner.slice(),
    })),
    corona: world.corona && {
      id: world.corona.id,
      rings: world.corona.rings,
      sectors: world.corona.sectors,
      innerRings: world.corona.innerRings,
      middleRings: world.corona.middleRings,
      owner: world.corona.owner.slice(),
    },
    factions: world.factions.slice(1).map((f) => {
      const nation = world.nations.find((n) => n.faction === f.id);
      return {
        id: f.id,
        name: f.name,
        kind: f.kind,
        ...(nation && { nationId: nation.nationId }),
        ...(nation && nation.home !== 0 && { homeId: nation.home }),
      };
    }),
    diplomacy: diplomacySnapshot(world),
    difficulty: setup.difficulty,
    tick: world.tick,
    snapshot: snapshotViews(world),
    troopRatioPct: world.factions[playerId]?.troopRatioPct ?? 60,
    replay,
    tutorial: setup.tutorial === true,
  };
}

/** What save and replay lists show about a match. */
export function matchSummary(match: Match): MatchSummary {
  const { world, playerId, setup } = match;
  const player = world.factions[playerId];
  const land = player ? player.tileCount - coronaTiles(world, player) : 0;
  return {
    tick: world.tick,
    difficulty: setup.difficulty,
    tutorial: setup.tutorial === true,
    landPct: world.ownableTiles > 0 ? Math.round((land / world.ownableTiles) * 1000) / 10 : 0,
  };
}

/**
 * Home maps for `count` bots: one on every body first, so no world starts
 * empty, then the rest spread by how much land each body has.
 */
export function botHomes(world: World, count: number, seed: number): GridId[] {
  const rng = Rng.fromSeed(seed, 7);
  const land = world.grids.map((g) => {
    let n = 0;
    for (let t = 0; t < g.size; t++) if (isOwnableTerrain(g.terrain[t]!)) n++;
    return n;
  });
  const total = land.reduce((a, b) => a + b, 0);
  const homes: GridId[] = [];
  for (let i = 0; i < count; i++) {
    if (i < world.grids.length) {
      homes.push(world.grids[i]!.id);
      continue;
    }
    let pick = rng.nextInt(total);
    let g = 0;
    while (pick >= land[g]!) pick -= land[g++]!;
    homes.push(world.grids[g]!.id);
  }
  return homes;
}
