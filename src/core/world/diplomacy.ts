import { BALANCE } from "../../data/balance";
import type { FactionId } from "../ids";
import { NEUTRAL } from "../ids";
import type { WeaponKind, World } from "./world";

/**
 * Who is allied with whom, pending alliance requests and embargoes
 * (GAMEPLAY_PLAN.md §9). Keys are plain numbers so lookups in hot code
 * (attacks, trade) stay cheap: a pair is `low × 65536 + high`, a directed
 * relation `from × 65536 + to`. Maps and sets iterate in insertion order,
 * which only commands and the AI change, so iteration is deterministic.
 */
export interface Diplomacy {
  /** Allied pairs (pairKey). Alliances are mutual. */
  readonly alliances: Set<number>;
  /** Alliance requests (dirKey from → to) and the last tick they can be accepted on. */
  readonly requests: Map<number, number>;
  /** Embargoes (dirKey from → to). Either direction stops trade between the two. */
  readonly embargoes: Set<number>;
}

export type SignalKind = "help" | "attack" | "peace";

/** Something the UI may want to tell the player about. Not game state: never hashed. */
export type GameEvent =
  | { readonly kind: "allyRequest"; readonly from: number; readonly to: number }
  | { readonly kind: "allied"; readonly a: number; readonly b: number }
  | { readonly kind: "allianceBroken"; readonly by: number; readonly other: number }
  | {
      readonly kind: "gift";
      readonly from: number;
      readonly to: number;
      readonly solars: number;
      readonly troops: number;
    }
  | { readonly kind: "embargo"; readonly from: number; readonly to: number; readonly on: boolean }
  | {
      readonly kind: "signal";
      readonly from: number;
      readonly to: number;
      readonly signal: SignalKind;
      /** The faction the signal is about ("attack them"), or 0. */
      readonly about: number;
    }
  /** A colony broke away from its home nation. */
  | { readonly kind: "independent"; readonly colony: number; readonly home: number }
  /** A weapon was fired: everyone is warned (GAMEPLAY_PLAN.md §8). */
  | {
      readonly kind: "weaponLaunched";
      readonly by: number;
      readonly weapon: WeaponKind;
      readonly grid: number;
      readonly tile: number;
      readonly arriveTick: number;
    }
  /** Orbital Defense (owned by `by`) shot down a weapon of `owner`. */
  | {
      readonly kind: "weaponIntercepted";
      readonly by: number;
      readonly owner: number;
      readonly weapon: WeaponKind;
      readonly grid: number;
    }
  | {
      readonly kind: "weaponHit";
      readonly by: number;
      readonly weapon: WeaponKind;
      readonly grid: number;
      readonly tile: number;
    };

export function createDiplomacy(): Diplomacy {
  return { alliances: new Set(), requests: new Map(), embargoes: new Set() };
}

/** Key of an unordered pair of factions. */
export function pairKey(a: number, b: number): number {
  return a < b ? a * 0x10000 + b : b * 0x10000 + a;
}

/** Key of a directed relation between two factions. */
export function dirKey(from: number, to: number): number {
  return from * 0x10000 + to;
}

/** True if `a` and `b` are allies (never for neutral land). */
export function isAllied(world: World, a: number, b: number): boolean {
  if (a === NEUTRAL || b === NEUTRAL || a === b) return false;
  return world.diplomacy.alliances.has(pairKey(a, b));
}

/** True if either side has an embargo on the other: no trade between them. */
export function hasEmbargo(world: World, a: number, b: number): boolean {
  const e = world.diplomacy.embargoes;
  return e.size > 0 && (e.has(dirKey(a, b)) || e.has(dirKey(b, a)));
}

/** True while `from` has asked `to` for an alliance and `to` can still accept. */
export function hasRequest(world: World, from: number, to: number): boolean {
  const until = world.diplomacy.requests.get(dirKey(from, to));
  return until !== undefined && until >= world.tick;
}

/** True while the faction is marked as a traitor. */
export function isTraitor(world: World, faction: number): boolean {
  return world.factions[faction]!.traitorUntil > world.tick;
}

/** The allies of a faction, in id order. */
export function alliesOf(world: World, faction: number): FactionId[] {
  const out: FactionId[] = [];
  for (const f of world.factions) {
    if (f.alive && isAllied(world, faction, f.id)) out.push(f.id);
  }
  return out;
}

/** Records an event for the UI (only while the host listens). */
export function pushEvent(world: World, event: GameEvent): void {
  world.log?.events.push(event);
}

/**
 * Makes two factions allies and clears requests between them. Running
 * attacks between them end on their next step (attackSystem).
 */
export function makeAlliance(world: World, a: FactionId, b: FactionId): void {
  const d = world.diplomacy;
  d.alliances.add(pairKey(a, b));
  d.requests.delete(dirKey(a, b));
  d.requests.delete(dirKey(b, a));
  pushEvent(world, { kind: "allied", a, b });
}

/**
 * Records an alliance request, or accepts at once if `to` had already asked
 * `from` (both want it).
 */
export function requestAlliance(world: World, from: FactionId, to: FactionId): void {
  if (hasRequest(world, to, from)) {
    makeAlliance(world, from, to);
    return;
  }
  const d = world.diplomacy;
  dropExpiredRequests(world);
  d.requests.set(dirKey(from, to), world.tick + BALANCE.diplomacy.requestTicks);
  pushEvent(world, { kind: "allyRequest", from, to });
}

/**
 * `by` breaks its alliance with `other` and is marked a traitor for a while
 * (attacks cost it more, and nations distrust it). A colony and its home
 * nation part ways for good: the colony becomes independent.
 */
export function breakAlliance(world: World, by: FactionId, other: FactionId): void {
  world.diplomacy.alliances.delete(pairKey(by, other));
  world.factions[by]!.traitorUntil = world.tick + BALANCE.diplomacy.traitorTicks;
  pushEvent(world, { kind: "allianceBroken", by, other });
  for (const n of world.nations) {
    // The AI remembers who betrayed it.
    if (n.faction === other) {
      n.grudges.set(by, (n.grudges.get(by) ?? 0) + BALANCE.nation.betrayalGrudge);
    }
    const isColonyOf = (colony: number, home: number) => n.faction === colony && n.home === home;
    if (isColonyOf(by, other) || isColonyOf(other, by)) setIndependent(world, n.faction);
  }
}

/** A colony stops following its home nation. */
export function setIndependent(world: World, colony: FactionId): void {
  const n = world.nations.find((s) => s.faction === colony);
  if (!n || n.home === NEUTRAL) return;
  const home = n.home;
  n.home = NEUTRAL;
  pushEvent(world, { kind: "independent", colony, home });
}

/** Forgets requests nobody can accept any more, so the table stays small. */
function dropExpiredRequests(world: World): void {
  const requests = world.diplomacy.requests;
  for (const [key, until] of requests) if (until < world.tick) requests.delete(key);
}
