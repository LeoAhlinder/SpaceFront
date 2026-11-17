import { NEUTRAL } from "../ids";
import type { FactionId } from "../ids";
import type { Structure, StructureKind, World } from "./world";
import { STRUCTURE_KINDS } from "./world";

/**
 * Keeps the derived structure lookups in sync with `world.structures`:
 * `world.structureAt`, `world.structureIndex` (ids per grid and kind) and
 * every faction's `owned` / `finished` counts. Every change to a structure's
 * existence, owner or construction goes through here, so nothing has to scan
 * all structures (thousands of Habitats late in a match).
 */

/** A structure kind's index in STRUCTURE_KINDS (and in the per-kind arrays). */
export const KIND_CODE = Object.fromEntries(STRUCTURE_KINDS.map((k, i) => [k, i])) as Record<
  StructureKind,
  number
>;

/** Ids of the structures of a kind on a grid, in id order (destroyed ones excluded). */
export function structuresOn(world: World, grid: number, kind: StructureKind): readonly number[] {
  return world.structureIndex[grid]![KIND_CODE[kind]]!;
}

/** Adds a new structure (its id must be the next index) to the world and every lookup. */
export function addStructure(world: World, s: Structure): void {
  world.structures.push(s);
  world.structureAt[s.grid]![s.tile] = s.id;
  world.structureIndex[s.grid]![KIND_CODE[s.kind]]!.push(s.id);
  const owner = world.factions[s.owner]!;
  const code = KIND_CODE[s.kind];
  owner.owned[code] = owner.owned[code]! + 1;
  if (s.buildTicksLeft === 0) owner.finished[code] = owner.finished[code]! + 1;
  world.log?.structures.push(s.id);
}

/** A structure finished construction. */
export function markFinished(world: World, s: Structure): void {
  const owner = world.factions[s.owner]!;
  const code = KIND_CODE[s.kind];
  owner.finished[code] = owner.finished[code]! + 1;
}

/** A structure changes hands (captured with its tile, or its tile turned neutral). */
export function transferStructure(world: World, s: Structure, to: FactionId): void {
  const code = KIND_CODE[s.kind];
  const from = world.factions[s.owner]!;
  const next = world.factions[to]!;
  from.owned[code] = from.owned[code]! - 1;
  next.owned[code] = next.owned[code]! + 1;
  if (s.buildTicksLeft === 0) {
    from.finished[code] = from.finished[code]! - 1;
    next.finished[code] = next.finished[code]! + 1;
  }
  s.owner = to;
  world.log?.structures.push(s.id);
}

/**
 * Destroys a structure (by a weapon or a Warship): it leaves the map and
 * every lookup. It stays in `world.structures` (ids are indexes) as a
 * neutral, destroyed entry.
 */
export function destroyStructure(world: World, s: Structure): void {
  if (s.destroyed) return;
  transferStructure(world, s, NEUTRAL);
  const code = KIND_CODE[s.kind];
  const neutral = world.factions[NEUTRAL]!;
  neutral.owned[code] = neutral.owned[code]! - 1;
  if (s.buildTicksLeft === 0) neutral.finished[code] = neutral.finished[code]! - 1;
  const list = world.structureIndex[s.grid]![code]!;
  list.splice(list.indexOf(s.id), 1);
  world.structureAt[s.grid]![s.tile] = -1;
  s.destroyed = true;
  s.buildTicksLeft = 0;
  s.nextTradeTick = -1;
  s.hp = 0;
}

/**
 * The lowest-id structure of a kind that `faction` owns (finished only, if
 * asked), or null. Looks only at that kind's lists.
 */
export function firstOwned(
  world: World,
  faction: number,
  kind: StructureKind,
  finishedOnly: boolean,
): Structure | null {
  const code = KIND_CODE[kind];
  const f = world.factions[faction]!;
  if ((finishedOnly ? f.finished[code] : f.owned[code]) === 0) return null;
  let best: Structure | null = null;
  for (const perKind of world.structureIndex) {
    for (const id of perKind[code]!) {
      if (best && id > best.id) break;
      const s = world.structures[id]!;
      if (s.owner !== faction || (finishedOnly && s.buildTicksLeft > 0)) continue;
      best = s;
      break;
    }
  }
  return best;
}

/** Every structure of a kind `faction` owns, in id order. */
export function ownedOfKind(world: World, faction: number, kind: StructureKind): Structure[] {
  const code = KIND_CODE[kind];
  const out: Structure[] = [];
  if (world.factions[faction]!.owned[code] === 0) return out;
  for (const perKind of world.structureIndex) {
    for (const id of perKind[code]!) {
      const s = world.structures[id]!;
      if (s.owner === faction) out.push(s);
    }
  }
  return out.sort((a, b) => a.id - b.id);
}
