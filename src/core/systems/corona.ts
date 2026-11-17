import { BALANCE } from "../../data/balance";
import type { PolarGrid } from "../grid/polarGrid";
import { BAND_KEYS } from "../grid/polarGrid";
import type { FactionId } from "../ids";
import { NEUTRAL } from "../ids";
import type { System } from "../tick";
import { addStructure, structuresOn } from "../world/structureIndex";
import { setOwner } from "../world/territory";
import type { Ship, Structure, World } from "../world/world";
import { tooCloseToStructure } from "./structures";

const C = BALANCE.corona;
const SB = BALANCE.sunBase;
const SS = BALANCE.solarSiphon;

/** Scratch buffers, overwritten on every use; they hold no state between calls. */
let reached = new Uint8Array(0);
let queue = new Int32Array(0);
const near = new Int32Array(4);

/**
 * A Sun Base ship arrives. If its tile is still empty (or already its
 * owner's) and no structure was built too close meanwhile, it becomes a
 * finished Sun Base: it claims the neutral tiles within
 * BALANCE.sunBase.claimRadius steps and its troops become Corona troops.
 * Otherwise the ship is lost with its troops (the Solars are spent).
 */
export function foundSunBase(world: World, ship: Ship): void {
  const grid = world.corona;
  const faction = world.factions[ship.owner]!;
  if (!grid || !faction.alive) return;
  const owner = grid.owner[ship.toTile]!;
  if (owner !== NEUTRAL && owner !== ship.owner) return;
  if (tooCloseToStructure(world, grid.id, ship.toTile)) return;

  const base: Structure = {
    id: world.structures.length,
    kind: "sunBase",
    owner: ship.owner,
    grid: grid.id,
    tile: ship.toTile,
    buildTicksLeft: 0,
    nextTradeTick: world.tick + BALANCE.structures.spaceport.tradeIntervalTicks,
    readyTick: 0,
    hp: 1,
    destroyed: false,
  };
  addStructure(world, base);
  claimAround(world, grid, ship.toTile, ship.owner);
  faction.coronaTroops += ship.troops;
}

/** Claims the base tile and the neutral tiles within claimRadius steps of it. */
function claimAround(world: World, grid: PolarGrid, center: number, owner: FactionId): void {
  setOwner(world, grid, center, owner);
  const r = SB.claimRadius;
  const ring = grid.ring(center);
  const sector = grid.sector(center);
  for (let dr = -r; dr <= r; dr++) {
    const reach = r - Math.abs(dr);
    for (let ds = -reach; ds <= reach; ds++) {
      const tile = grid.index(ring + dr, sector + ds);
      if (tile >= 0 && grid.owner[tile] === NEUTRAL) setOwner(world, grid, tile, owner);
    }
  }
}

/**
 * Solars per tick, in thousandths, from a faction's finished siphons counted
 * per band (inner, middle, outer). Siphons are ranked best band first; the
 * n-th pays 100 − n × diminishStepPct percent (at least diminishMinPct), so
 * each extra siphon pays a bit less.
 */
export function siphonIncomeMilli(perBand: readonly number[]): number {
  let milli = 0;
  let n = 0;
  for (let band = 0; band < BAND_KEYS.length; band++) {
    const output = SS.baseIncome * SS.bandPct[BAND_KEYS[band]!]; // ☉ × 100
    for (let i = 0; i < (perBand[band] ?? 0); i++, n++) {
      const pct = Math.max(SS.diminishMinPct, 100 - n * SS.diminishStepPct);
      milli += Math.floor((output * pct) / 10);
    }
  }
  return milli;
}

/**
 * The Corona's slow work, every BALANCE.corona.intervalTicks ticks:
 * 1. Sun Bases train Corona troops (up to a cap per base).
 * 2. Heat drains Corona troops, in proportion to how many of a faction's
 *    Corona tiles lie in the hot bands (inner strongest).
 * 3. Corona tiles not connected (through their owner's tiles) to one of the
 *    owner's Sun Bases decay back to neutral, a few per interval.
 * A faction left with no Corona tiles loses its Corona troops.
 *
 * Scans the whole Corona grid once per interval. That's a small, fixed grid
 * (BALANCE.corona.rings × sectors), not a body map.
 */
export const coronaSystem: System = (world, ctx) => {
  const grid = world.corona;
  if (!grid || ctx.tick % C.intervalTicks !== 0) return;
  const factions = world.factions.length;

  // 1. Training, and the bases the connectivity search starts from.
  const bases = new Int32Array(factions);
  if (reached.length !== grid.size) {
    reached = new Uint8Array(grid.size);
    queue = new Int32Array(grid.size);
  }
  reached.fill(0);
  let tail = 0;
  for (const id of structuresOn(world, grid.id, "sunBase")) {
    const s = world.structures[id]!;
    if (s.owner === NEUTRAL) continue;
    bases[s.owner] = bases[s.owner]! + 1;
    if (reached[s.tile] === 0) {
      reached[s.tile] = 1;
      queue[tail++] = s.tile;
    }
  }
  for (let id = 1; id < factions; id++) {
    const f = world.factions[id]!;
    const n = bases[id]!;
    if (n === 0 || !f.alive) continue;
    const cap = n * SB.troopCapPerBase;
    if (f.coronaTroops < cap) f.coronaTroops = Math.min(cap, f.coronaTroops + n * SB.trainTroops);
  }

  // 2. Which tiles are connected to a base of their owner (flood fill from every base).
  for (let head = 0; head < tail; head++) {
    const tile = queue[head]!;
    const owner = grid.owner[tile];
    const n = grid.neighbors(tile, near);
    for (let i = 0; i < n; i++) {
      const next = near[i]!;
      if (reached[next] === 0 && grid.owner[next] === owner) {
        reached[next] = 1;
        queue[tail++] = next;
      }
    }
  }

  // 3. Count tiles per band, and release cut-off tiles in index order.
  const band = new Int32Array(factions * 3);
  const decayed = new Int32Array(factions);
  for (let tile = 0; tile < grid.size; tile++) {
    const owner = grid.owner[tile]!;
    if (owner === NEUTRAL) continue;
    if (reached[tile] === 0 && decayed[owner]! < C.decayTilesPerInterval) {
      decayed[owner] = decayed[owner]! + 1;
      setOwner(world, grid, tile, NEUTRAL);
      continue;
    }
    const b = owner * 3 + grid.band(tile);
    band[b] = band[b]! + 1;
  }

  // 4. Heat.
  const H = C.heatDrainPermille;
  for (let id = 1; id < factions; id++) {
    const f = world.factions[id]!;
    if (f.coronaTroops === 0) continue;
    const total = band[id * 3]! + band[id * 3 + 1]! + band[id * 3 + 2]!;
    if (total === 0) {
      f.coronaTroops = 0; // nowhere left to stand
      continue;
    }
    const heat =
      band[id * 3]! * H.inner + band[id * 3 + 1]! * H.middle + band[id * 3 + 2]! * H.outer;
    f.coronaTroops -= Math.floor((f.coronaTroops * heat) / (total * 1000));
  }
};
