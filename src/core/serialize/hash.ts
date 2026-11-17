import { assert } from "../debug";
import type { FactionKind, World } from "../world/world";

/**
 * A 32-bit fingerprint of the whole simulation state.
 *
 * Two worlds with equal hashes are (almost certainly) identical. Used by the
 * determinism tests now and for desync detection in multiplayer later. Every
 * piece of state in `World` must be fed in here; when you add state, add it.
 */
export function hashWorld(world: World): number {
  const h = new Hasher();
  h.int(world.tick);
  h.int(world.config.seed);
  h.words(world.rng.state);

  h.int(world.factions.length);
  for (const f of world.factions) {
    h.int(f.id);
    h.string(f.name);
    h.int(FACTION_KIND_CODE[f.kind]);
    h.int(f.alive ? 1 : 0);
    h.int(f.hasSpawned ? 1 : 0);
    h.int(f.troopRatioPct);
    h.int(f.troops);
    h.int(f.workers);
    h.int(f.coronaTroops);
    h.int(f.solars);
    h.int(f.solarsMilli);
    h.int(f.tileCount);
  }

  h.int(world.grids.length);
  for (const g of world.grids) {
    h.int(g.id);
    h.int(g.width);
    h.int(g.height);
    h.words(g.owner);
    h.words(g.terrain);
  }
  const corona = world.corona;
  h.int(corona ? 1 : 0);
  if (corona) {
    h.int(corona.id);
    h.int(corona.rings);
    h.int(corona.sectors);
    h.int(corona.innerRings);
    h.int(corona.middleRings);
    h.words(corona.owner);
    h.words(corona.terrain);
  }

  h.int(world.nextAttackId);
  h.int(world.attacks.length);
  for (const a of world.attacks) {
    h.int(a.id);
    h.int(a.attacker);
    h.int(a.target);
    h.int(a.grid);
    h.int(a.troops);
    h.int(a.focusTile);
    h.ints(a.frontier.priorities);
    h.ints(a.frontier.tiles);
  }

  h.int(world.winner ?? -1);

  h.int(world.structures.length);
  for (const s of world.structures) {
    h.int(s.id);
    h.string(s.kind);
    h.int(s.owner);
    h.int(s.grid);
    h.int(s.tile);
    h.int(s.buildTicksLeft);
    h.int(s.nextTradeTick);
  }

  h.int(world.nextShipId);
  h.int(world.ships.length);
  for (const ship of world.ships) {
    h.int(ship.id);
    h.string(ship.kind);
    h.int(ship.owner);
    h.int(ship.troops);
    h.int(ship.fromGrid);
    h.int(ship.fromTile);
    h.int(ship.toGrid);
    h.int(ship.toTile);
    h.int(ship.toStructure);
    h.int(ship.launchTick);
    h.int(ship.arriveTick);
    h.int(ship.waypoints.length);
    for (const p of ship.waypoints) {
      h.int(p.x);
      h.int(p.y);
    }
  }
  h.int(world.bots.length);
  for (const b of world.bots) {
    h.int(b.faction);
    h.words(b.rng.state);
    h.int(b.nextDecisionTick);
  }

  // Not hashed: world.pending (queued commands are input, not state), and the
  // faction tile lists / tileSlots (derived from the owner arrays; their order
  // only matters through outcomes, which the hash already covers).
  return h.digest();
}

const FACTION_KIND_CODE: Record<FactionKind, number> = {
  neutral: 0,
  player: 1,
  bot: 2,
  nation: 3,
};

/** Incremental 32-bit hash (murmur3-style mixing). */
class Hasher {
  private h = 0x811c9dc5;

  /** Mixes one uint32 word. */
  private mix(word: number): void {
    let k = Math.imul(word >>> 0, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    this.h ^= k;
    this.h = (this.h << 13) | (this.h >>> 19);
    this.h = (Math.imul(this.h, 5) + 0xe6546b64) | 0;
  }

  /** Any safe integer. Non-integers in state are a determinism bug, so they throw. */
  int(n: number): void {
    assert(Number.isSafeInteger(n), `hashWorld: non-integer state value ${n}`);
    this.mix(n >>> 0); // low 32 bits
    this.mix(Math.floor(n / 0x1_0000_0000) | 0); // high bits
  }

  words(array: ArrayLike<number>): void {
    this.mix(array.length);
    for (let i = 0; i < array.length; i++) this.mix(array[i]!);
  }

  /** A list of safe integers (may be negative or above 32 bits). */
  ints(array: readonly number[]): void {
    this.mix(array.length);
    for (const n of array) this.int(n);
  }

  string(s: string): void {
    this.mix(s.length);
    for (let i = 0; i < s.length; i++) this.mix(s.charCodeAt(i));
  }

  digest(): number {
    let h = this.h;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }
}
