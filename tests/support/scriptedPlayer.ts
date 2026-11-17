/**
 * A scripted stand-in for a new human player, for AI tests: it spawns at a
 * country's spawn tile on Earth, keeps expanding into empty land, fights back
 * at its weakest neighbor once the land runs out (keeping about a troop per
 * tile at home), and builds a Spaceport and
 * then Habitats when it can afford them. It never launches ships or uses
 * diplomacy: about what someone does in their first matches.
 */
import type { Command, Faction, FactionId, GridId, World } from "../../src/core";
import {
  addFaction,
  buildCost,
  isOwnableTerrain,
  NEUTRAL,
  queueCommand,
  refGrid,
  refTile,
  tooCloseToStructure,
} from "../../src/core";
import { SOLAR_MAPS } from "./solarMatch";

const THINK_EVERY = 10;
const scratch = new Int32Array(8);

export interface ScriptedPlayer {
  readonly faction: Faction;
  /** Queues this tick's commands (call before every runTick). */
  readonly act: (world: World) => void;
}

/** Adds a player faction that will spawn in the Earth region with this ISO code. */
export function addScriptedPlayer(world: World, regionCode: string): ScriptedPlayer {
  const faction = addFaction(world, "Scripted player", "player");
  const earth = world.gridBodies.indexOf("earth") as GridId;
  const region = SOLAR_MAPS.get("earth")!.regions.find((r) => r.code === regionCode)!;
  const id = faction.id;
  const act = (world: World) => {
    if (world.tick % THINK_EVERY !== 0 || !faction.alive) return;
    const command = faction.hasSpawned
      ? decide(world, faction)
      : ({ type: "spawn", faction: id, grid: earth, tile: region.spawnTile } as Command);
    if (command) queueCommand(world, command);
  };
  return { faction, act };
}

function decide(world: World, me: Faction): Command | null {
  if (me.tiles.length === 0) return null;
  const id = me.id;
  // Build: a Spaceport first, then Habitats, on a random own tile.
  const ref = me.tiles[world.tick % me.tiles.length]!;
  const grid = refGrid(ref);
  const tile = refTile(ref);
  const hasPort = world.structures.some((s) => s.owner === id && s.kind === "spaceport");
  const kind = hasPort ? "habitat" : "spaceport";
  if (
    me.solars >= buildCost(world, id, kind, grid) &&
    !tooCloseToStructure(world, grid, tile) &&
    grid < world.grids.length
  ) {
    return { type: "build", faction: id, kind, grid, tile };
  }
  // Keeps about one troop per tile at home, so it isn't an easy target.
  if (me.troops < Math.max(300, me.tiles.length)) return null;
  if (world.attacks.filter((a) => a.attacker === id).length >= 2) return null;
  let neutral: { grid: GridId; tile: number } | null = null;
  let weakest: { grid: GridId; tile: number; troops: number } | null = null;
  for (let s = 0; s < 32; s++) {
    const r = me.tiles[(world.tick * 7 + s * 131) % me.tiles.length]!;
    const g = world.grids[refGrid(r)];
    if (!g) continue;
    const n = g.neighbors(refTile(r), scratch);
    for (let i = 0; i < n; i++) {
      const t = scratch[i]!;
      const owner = g.owner[t]! as FactionId;
      if (owner === id) continue;
      if (owner === NEUTRAL) {
        if (isOwnableTerrain(g.terrain[t]!)) neutral ??= { grid: g.id, tile: t };
        continue;
      }
      const other = world.factions[owner]!;
      if (!weakest || other.troops < weakest.troops) {
        weakest = { grid: g.id, tile: t, troops: other.troops };
      }
    }
  }
  if (neutral) return { type: "attack", faction: id, ...neutral, ratioPct: 25 };
  if (weakest && weakest.troops < me.troops) {
    return { type: "attack", faction: id, grid: weakest.grid, tile: weakest.tile, ratioPct: 40 };
  }
  return null;
}
