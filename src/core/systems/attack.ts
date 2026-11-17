import { BALANCE } from "../../data/balance";
import type { TileGrid } from "../grid/tileGrid";
import { isOwnableTerrain, TERRAIN_COST_PCT } from "../grid/terrain";
import type { FactionId, GridId } from "../ids";
import { NEUTRAL } from "../ids";
import type { System } from "../tick";
import { FrontierHeap } from "../world/frontierHeap";
import { setOwner } from "../world/territory";
import type { Attack, World } from "../world/world";

const A = BALANCE.attack;

/** Scratch buffers. They never carry data between calls, so they hold no state. */
const scratch = new Int32Array(8);
const scratch2 = new Int32Array(8);

/**
 * Starts an attack from `attackerId` against whoever owns `focusTile`, using
 * `ratioPct` percent of the attacker's troops. A second attack on the same
 * target and grid adds its troops to the running one.
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
  const grid = world.grids[gridId]!;
  const target = grid.owner[focusTile]! as FactionId;
  const troops = Math.floor((attacker.troops * ratioPct) / 100);
  if (troops < 1) return "no troops";

  const existing = world.attacks.find(
    (a) => a.attacker === attackerId && a.target === target && a.grid === gridId,
  );
  if (existing) {
    attacker.troops -= troops;
    existing.troops += troops;
    existing.focusTile = focusTile;
    return null;
  }

  const attack: Attack = {
    id: world.nextAttackId,
    attacker: attackerId,
    target,
    grid: gridId,
    troops,
    focusTile,
    frontier: new FrontierHeap(),
  };
  // One full scan when the attack starts; afterwards the frontier is updated
  // incrementally as tiles change hands.
  for (let tile = 0; tile < grid.size; tile++) {
    if (isCandidate(grid, tile, target) && bordersOwner(grid, tile, attackerId)) {
      attack.frontier.push(priority(world, grid, attack, tile), tile);
    }
  }
  if (attack.frontier.size === 0) return "no shared border";

  world.nextAttackId += 1;
  attacker.troops -= troops;
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
  if (defender && !defender.alive) return finish(attacker, attack);

  const grid = world.grids[attack.grid]!;
  const budget = Math.min(A.maxTilesPerTick, 1 + Math.floor(attack.troops / A.troopsPerExtraTile));

  for (let taken = 0; taken < budget;) {
    const tile = attack.frontier.pop();
    if (tile < 0) return finish(attacker, attack);
    // Entries go stale when tiles change hands; skip those.
    if (grid.owner[tile] !== attack.target || !bordersOwner(grid, tile, attack.attacker)) continue;

    const cost = tileCost(world, grid, attack, tile);
    if (attack.troops < cost) return finish(attacker, attack);
    attack.troops -= cost;
    if (defender) {
      const density = Math.floor(defender.troops / Math.max(1, defender.tileCount));
      const loss = Math.floor((density * A.defenderLossPct) / 100);
      defender.troops -= Math.min(defender.troops, loss);
    }
    setOwner(world, grid, tile, attack.attacker);
    extendFrontiers(world, grid, tile, attack.attacker);
    taken++;
    if (defender && !defender.alive) return finish(attacker, attack);
  }
  return true;
}

/** Ends an attack and returns its unused troops to the attacker. */
function finish(attacker: World["factions"][number], attack: Attack): false {
  attacker.troops += attack.troops;
  attack.troops = 0;
  return false;
}

/** Troops it costs to take `tile` in this attack. */
function tileCost(world: World, grid: TileGrid, attack: Attack, tile: number): number {
  const terrainPct = TERRAIN_COST_PCT[grid.terrain[tile]!]!;
  let base: number = A.neutralCost;
  if (attack.target !== NEUTRAL) {
    const defender = world.factions[attack.target]!;
    const density = Math.floor(defender.troops / Math.max(1, defender.tileCount));
    base = A.enemyBaseCost + Math.floor((density * A.enemyDensityPct) / 100);
  }
  return Math.max(1, Math.floor((base * terrainPct) / 100));
}

/**
 * After `owner` takes `tile`, the tiles around it may now border `owner`.
 * Adds them to the frontier of each of `owner`'s attacks on this grid whose
 * target owns them.
 */
function extendFrontiers(world: World, grid: TileGrid, tile: number, owner: FactionId): void {
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
