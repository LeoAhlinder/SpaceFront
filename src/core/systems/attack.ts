import { BALANCE } from "../../data/balance";
import type { TileGrid } from "../grid/tileGrid";
import { isOwnableTerrain, TERRAIN_COST_PCT } from "../grid/terrain";
import type { FactionId, GridId } from "../ids";
import { NEUTRAL } from "../ids";
import type { System } from "../tick";
import { isAllied } from "../world/diplomacy";
import { FrontierHeap } from "../world/frontierHeap";
import { gridModifier } from "../world/modifiers";
import { structuresOn } from "../world/structureIndex";
import { setOwner } from "../world/territory";
import { isIrradiated } from "./weapons";
import { refGrid, refTile } from "../world/tileRef";
import type { Attack, Faction, World } from "../world/world";
import { addTroops, coronaTiles, gridOf, isCorona, troopPool } from "../world/world";

const A = BALANCE.attack;

/** Scratch buffers. They never carry data between calls, so they hold no state. */
const scratch = new Int32Array(8);
const scratch2 = new Int32Array(8);

/**
 * Starts an attack from `attackerId` against whoever owns `focusTile`, using
 * `ratioPct` percent of the attacker's troops (in the Corona: of its Corona
 * troops). A second attack on the same target and grid adds its troops to
 * the running one.
 * Returns null on success or a reason it couldn't start.
 */
export function startAttack(
  world: World,
  attackerId: FactionId,
  gridId: GridId,
  focusTile: number,
  ratioPct: number,
): string | null {
  const attacker = world.factions[attackerId]!;
  const target = gridOf(world, gridId)!.owner[focusTile]! as FactionId;
  const troops = Math.floor((troopPool(world, attacker, gridId) * ratioPct) / 100);
  if (troops < 1) return "no troops";
  const reason = beginAttack(world, attackerId, gridId, focusTile, target, troops);
  if (reason === null) addTroops(world, attacker, gridId, -troops);
  return reason;
}

/**
 * Commits `troops` (already taken from wherever they came from) to an attack
 * on `target`'s land on this grid: merged into a running attack on the same
 * target, or a new one seeded from the attacker's border. Returns null on
 * success; on failure the caller still holds the troops.
 */
export function beginAttack(
  world: World,
  attackerId: FactionId,
  gridId: GridId,
  focusTile: number,
  target: FactionId,
  troops: number,
): string | null {
  const existing = world.attacks.find(
    (a) => a.attacker === attackerId && a.target === target && a.grid === gridId,
  );
  if (existing) {
    existing.troops += troops;
    existing.focusTile = focusTile;
    return null;
  }

  const grid = gridOf(world, gridId)!;
  const attack: Attack = {
    id: world.nextAttackId,
    attacker: attackerId,
    target,
    grid: gridId,
    troops,
    focusTile,
    frontier: new FrontierHeap(),
  };
  // Seed the frontier from the attacker's own tiles (not a whole-grid scan);
  // afterwards it is updated incrementally as tiles change hands. A target tile
  // next to several attacker tiles is pushed more than once; the extra entries
  // are skipped as stale when popped.
  for (const ref of world.factions[attackerId]!.tiles) {
    if (refGrid(ref) !== gridId) continue;
    const n = grid.neighbors(refTile(ref), scratch);
    for (let i = 0; i < n; i++) {
      const tile = scratch[i]!;
      if (isCandidate(grid, tile, target)) {
        attack.frontier.push(priority(world, grid, attack, tile), tile);
      }
    }
  }
  if (attack.frontier.size === 0) return "no shared border";

  world.nextAttackId += 1;
  world.attacks.push(attack);
  return null;
}

/** Spreads every running attack by up to its per-tick tile budget. */
export const attackSystem: System = (world) => {
  const kept: Attack[] = [];
  for (const attack of world.attacks) {
    if (step(world, attack)) kept.push(attack);
  }
  world.attacks = kept;
};

/** Advances one attack. Returns false when the attack is over. */
function step(world: World, attack: Attack): boolean {
  const attacker = world.factions[attack.attacker]!;
  if (!attacker.alive) return false; // eliminated: committed troops are lost

  const defender = attack.target === NEUTRAL ? null : world.factions[attack.target]!;
  if (defender && !defender.alive) return finish(world, attacker, attack);
  // Became allies: the war is over and the troops go home.
  if (isAllied(world, attack.attacker, attack.target)) return finish(world, attacker, attack);

  const grid = gridOf(world, attack.grid)!;
  const budget = Math.min(A.maxTilesPerTick, 1 + Math.floor(attack.troops / A.troopsPerExtraTile));

  for (let taken = 0; taken < budget;) {
    const tile = attack.frontier.pop();
    if (tile < 0) return finish(world, attacker, attack);
    // Entries go stale when tiles change hands; skip those.
    if (grid.owner[tile] !== attack.target || !bordersOwner(grid, tile, attack.attacker)) continue;

    const cost = tileCost(world, grid, attack, tile);
    if (attack.troops < cost) return finish(world, attacker, attack);
    attack.troops -= cost;
    if (defender) {
      const loss = Math.floor(
        (defenseDensity(world, defender, attack.grid) * A.defenderLossPct) / 100,
      );
      addTroops(
        world,
        defender,
        attack.grid,
        -Math.min(troopPool(world, defender, attack.grid), loss),
      );
    }
    setOwner(world, grid, tile, attack.attacker);
    extendFrontiers(world, grid, tile, attack.attacker);
    taken++;
    if (defender && !defender.alive) return finish(world, attacker, attack);
  }
  return true;
}

/** Ends an attack and returns its unused troops to the attacker's pool for that map. */
function finish(world: World, attacker: Faction, attack: Attack): false {
  addTroops(world, attacker, attack.grid, attack.troops);
  attack.troops = 0;
  return false;
}

/**
 * The defender's troops per tile on this map's side of the war: the main
 * pool over its land, or in the Corona its Corona troops over its Corona tiles.
 */
function defenseDensity(world: World, defender: Faction, grid: number): number {
  if (isCorona(world, grid)) {
    return Math.floor(defender.coronaTroops / Math.max(1, coronaTiles(world, defender)));
  }
  return Math.floor(
    defender.troops / Math.max(1, defender.tileCount - coronaTiles(world, defender)),
  );
}

/** Troops it costs to take `tile` in this attack (more for a traitor). */
function tileCost(world: World, grid: TileGrid, attack: Attack, tile: number): number {
  const terrainPct = TERRAIN_COST_PCT[grid.terrain[tile]!]!;
  let base: number = A.neutralCost;
  if (attack.target !== NEUTRAL) {
    const defender = world.factions[attack.target]!;
    const density = defenseDensity(world, defender, grid.id);
    base = A.enemyBaseCost + Math.floor((density * A.enemyDensityPct) / 100);
    base = Math.floor((base * gridModifier(world, grid.id, "defensePct")) / 100);
    if (isShielded(world, grid, tile, attack.target)) {
      base = Math.floor((base * BALANCE.shield.defensePct) / 100);
    }
  }
  if (isIrradiated(world, grid.id, tile)) {
    base = Math.floor((base * BALANCE.weapons.antimatterWarhead.falloutCostPct) / 100);
  }
  if (world.factions[attack.attacker]!.traitorUntil > world.tick) {
    base = Math.floor((base * BALANCE.diplomacy.traitorAttackCostPct) / 100);
  }
  return Math.max(1, Math.floor((base * terrainPct) / 100));
}

/**
 * After `owner` takes `tile`, the tiles around it may now border `owner`.
 * Adds them to the frontier of each of `owner`'s attacks on this grid whose
 * target owns them.
 */
export function extendFrontiers(
  world: World,
  grid: TileGrid,
  tile: number,
  owner: FactionId,
): void {
  const n = grid.neighbors(tile, scratch);
  for (const attack of world.attacks) {
    if (attack.attacker !== owner || attack.grid !== grid.id) continue;
    for (let i = 0; i < n; i++) {
      const next = scratch[i]!;
      if (isCandidate(grid, next, attack.target)) {
        attack.frontier.push(priority(world, grid, attack, next), next);
      }
    }
  }
}

/**
 * Lower is taken sooner. Cheap terrain first, pulled toward the clicked tile,
 * preferring tiles mostly surrounded by the attacker (fills gaps), with random
 * jitter for a natural-looking edge.
 */
function priority(world: World, grid: TileGrid, attack: Attack, tile: number): number {
  const n = grid.neighbors(tile, scratch2);
  let owned = 0;
  for (let i = 0; i < n; i++) if (grid.owner[scratch2[i]!] === attack.attacker) owned++;
  return (
    TERRAIN_COST_PCT[grid.terrain[tile]!]! +
    grid.distance(tile, attack.focusTile) * A.focusWeight -
    owned * A.ownedNeighborWeight +
    world.rng.nextInt(A.priorityJitter)
  );
}

/** True if a finished Shield Generator of `owner` covers `tile` (BALANCE.shield.radius). */
export function isShielded(world: World, grid: TileGrid, tile: number, owner: number): boolean {
  for (const id of structuresOn(world, grid.id, "shieldGenerator")) {
    const s = world.structures[id]!;
    if (s.owner !== owner || s.buildTicksLeft > 0) continue;
    if (grid.distance(s.tile, tile) <= BALANCE.shield.radius) return true;
  }
  return false;
}

function isCandidate(grid: TileGrid, tile: number, target: FactionId): boolean {
  return (
    grid.owner[tile] === target && grid.isUsable(tile) && isOwnableTerrain(grid.terrain[tile]!)
  );
}

function bordersOwner(grid: TileGrid, tile: number, owner: FactionId): boolean {
  const n = grid.neighbors(tile, scratch2);
  for (let i = 0; i < n; i++) if (grid.owner[scratch2[i]!] === owner) return true;
  return false;
}
