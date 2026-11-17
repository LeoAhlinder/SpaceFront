import { signal } from "@preact/signals";
import type {
  CombatEffect,
  Difficulty,
  DiplomacySnapshot,
  FactionKind,
  GameEvent,
  ShipView,
  StructureView,
  TickDelta,
} from "../../core";
import { BALANCE } from "../../data/balance";
import { bodyById } from "../../data/bodies";
import type { MatchInit, WorkerMessage } from "../../shared/messages";
import { factionColor } from "../render/colors";
import { strings } from "../ui/strings";

/** Must match core's FACTION_STATS_STRIDE (client can't import core values). */
const STATS_STRIDE = 9;
/** Diplomacy notices disappear after this many ticks. */
const NOTICE_TICKS = 150;
const LEADERBOARD_SIZE = 10;
/** Alerts disappear after this many ticks. */
const ALERT_TICKS = 120;
/** Terrain values that can be owned (Plains, Highlands, Mountains, Ice). */
const OWNABLE_MIN = 2;

export type Phase = "menu" | "loading" | "playing" | "ended";
export type ViewState =
  { readonly kind: "system" } | { readonly kind: "planet"; readonly grid: number };
/** What a click on a map does besides spawning/attacking: build, launch, or fire. */
export type Mode =
  | "none"
  | "spaceport"
  | "habitat"
  | "launch"
  | "sunBase"
  | "solarSiphon"
  | "shieldGenerator"
  | "orbitalDefense"
  | "launchSilo"
  | "warship"
  | "kineticStrike"
  | "antimatterWarhead";

/** Must match core's WARSHIP_STRIDE: id, owner, x, y, hp, guarded grid. */
const WARSHIP_STRIDE = 6;
/** How long effects stay on screen, in ticks. */
const BEAM_TICKS = 3;
const BLAST_TICKS = 8;
const IMPACT_TICKS = 25;

export interface WarshipView {
  readonly id: number;
  readonly owner: number;
  /** Position at the previous and the latest tick, for smooth motion. */
  readonly prevX: number;
  readonly prevY: number;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly guardGrid: number;
}

/** A shot, blast or weapon impact being drawn, from `tick` until `untilTick`. */
export interface EffectView {
  readonly effect: CombatEffect;
  readonly tick: number;
  readonly untilTick: number;
}

/** Irradiated land: drawn until it fades. */
export interface FalloutView {
  readonly grid: number;
  readonly tile: number;
  readonly radius: number;
  readonly untilTick: number;
}

export interface FactionView {
  readonly id: number;
  readonly name: string;
  readonly kind: FactionKind;
  readonly color: number;
  alive: boolean;
  troops: number;
  workers: number;
  /** Land on bodies (the win condition counts only this). */
  tileCount: number;
  solars: number;
  coronaTroops: number;
  coronaTiles: number;
  /** Marked as a traitor until this tick (0 = never). */
  traitorUntil: number;
  /** Nations and colonies: their nation in data/nations.ts. */
  readonly nationId?: string;
  /** Colonies: their home nation's faction id. */
  readonly homeId?: number;
}

/** A diplomacy message for the player, e.g. "China asks for an alliance". */
export interface Notice {
  readonly id: number;
  readonly text: string;
  readonly untilTick: number;
}

/** The player's diplomatic situation, rebuilt whenever something diplomatic happens. */
export interface Relations {
  /** Factions allied with the player. */
  readonly allies: readonly number[];
  /** Alliance requests to the player that can still be accepted. */
  readonly requests: readonly { readonly from: number; readonly untilTick: number }[];
  /** Factions the player asked (still waiting for an answer). */
  readonly asked: readonly number[];
  /** Factions the player has an embargo on. */
  readonly embargoes: readonly number[];
}

export interface Alert {
  readonly id: number;
  readonly text: string;
  readonly grid: number;
  readonly untilTick: number;
}

/**
 * UI state as signals: Preact components re-render when these change.
 * The renderer reads `view` instead (big arrays, updated in place).
 */
export const ui = {
  phase: signal<Phase>("menu"),
  tick: signal(0),
  spawnPhaseTicks: signal(0),
  player: signal<FactionView | null>(null),
  leaderboard: signal<readonly FactionView[]>([]),
  winner: signal<FactionView | null>(null),
  error: signal<string | null>(null),
  /** Which view is shown: the solar system or one world's map. */
  view: signal<ViewState>({ kind: "system" }),
  /** What a click on a map does besides spawning/attacking. */
  mode: signal<Mode>("none"),
  /** The player's finished Spaceports and Sun Bases (can launch). */
  readyPorts: signal(0),
  /** The player's finished Launch Silos, and how many of them are loaded. */
  silos: signal(0),
  loadedSilos: signal(0),
  /** The player's Warships. */
  warships: signal(0),
  /** The player's Warship that the next click in the system view sends on patrol, or null. */
  selectedWarship: signal<number | null>(null),
  alerts: signal<readonly Alert[]>([]),
  /** Percent of troops sent per attack or launch (client-side setting). */
  attackRatioPct: signal(30),
  /** Percent of population kept as troops (sent to the sim as setRatio). */
  troopRatioPct: signal(60),
  /** Difficulty picked in the menu for the next match. */
  difficulty: signal<Difficulty>("normal"),
  /** Faction whose diplomacy panel is open, or null. */
  selected: signal<number | null>(null),
  relations: signal<Relations>({ allies: [], requests: [], asked: [], embargoes: [] }),
  notices: signal<readonly Notice[]>([]),
};

/** Map state for the renderer: owners, structures and ships, updated in place. */
export const view = {
  init: null as MatchInit | null,
  /** Grid id of the Corona, or -1. Per-grid arrays below include it at that index. */
  coronaGrid: -1,
  owners: [] as Uint16Array[],
  /** Per grid: tiles whose owner changed since the renderer last drew. */
  dirty: [] as number[][],
  factions: new Map<number, FactionView>(),
  /** Per grid: tile count per owner (for the system view's icon colors). */
  ownerCounts: [] as Map<number, number>[],
  /** Per grid: ownable tiles. */
  ownable: [] as number[],
  structures: new Map<number, StructureView>(),
  ships: new Map<number, ShipView>(),
  warships: new Map<number, WarshipView>(),
  effects: [] as EffectView[],
  fallout: [] as FalloutView[],
  /** When the last tick arrived (performance.now()), for smooth motion between ticks. */
  lastTickAt: 0,
  /** Allied pairs (low × 65536 + high) and embargoes (from × 65536 + to). */
  alliances: new Set<number>(),
  embargoes: new Set<number>(),
  /** Alliance requests (from × 65536 + to) and the last tick they can be accepted. */
  requests: new Map<number, number>(),
};

const pairKey = (a: number, b: number) => (a < b ? a * 0x10000 + b : b * 0x10000 + a);
const dirKey = (from: number, to: number) => from * 0x10000 + to;

/** True if two factions are allies. */
export function isAlly(a: number, b: number): boolean {
  return a !== b && view.alliances.has(pairKey(a, b));
}

/** True if `from` has an embargo on `to`. */
export function hasEmbargoOn(from: number, to: number): boolean {
  return view.embargoes.has(dirKey(from, to));
}

let nextAlertId = 1;
let nextNoticeId = 1;

export function applyWorkerMessage(message: WorkerMessage): void {
  switch (message.type) {
    case "init":
      applyInit(message.init);
      break;
    case "tick":
      applyDelta(message.delta);
      break;
    case "error":
      ui.error.value = message.message;
      break;
  }
}

function applyInit(init: MatchInit): void {
  view.init = init;
  view.owners = init.grids.map((g) => g.owner);
  view.ownable = init.grids.map((g) => g.terrain.filter((t) => t >= OWNABLE_MIN).length);
  view.coronaGrid = init.corona?.id ?? -1;
  if (init.corona) {
    view.owners[init.corona.id] = init.corona.owner;
    view.ownable[init.corona.id] = init.corona.owner.length;
  }
  view.dirty = view.owners.map(() => []);
  view.ownerCounts = view.owners.map(() => new Map<number, number>());
  view.structures = new Map();
  view.ships = new Map();
  view.warships = new Map();
  view.effects = [];
  view.fallout = [];
  view.factions = new Map(
    init.factions.map((f) => [
      f.id,
      {
        ...f,
        alive: true,
        troops: 0,
        workers: 0,
        tileCount: 0,
        solars: 0,
        coronaTroops: 0,
        coronaTiles: 0,
        traitorUntil: 0,
        color: factionColor(f.id, f.kind, f.nationId, f.homeId !== undefined),
      },
    ]),
  );
  view.requests = new Map();
  applySnapshot(init.diplomacy);
  ui.notices.value = [];
  ui.selected.value = null;
  publishRelations(0);
  ui.spawnPhaseTicks.value = init.spawnPhaseTicks;
  ui.tick.value = 0;
  ui.winner.value = null;
  ui.alerts.value = [];
  ui.mode.value = "none";
  ui.readyPorts.value = 0;
  ui.silos.value = 0;
  ui.loadedSilos.value = 0;
  ui.warships.value = 0;
  ui.selectedWarship.value = null;
  const earth = init.grids.findIndex((g) => g.bodyId === "earth");
  ui.view.value = { kind: "planet", grid: Math.max(0, earth) };
  ui.phase.value = "playing";
  view.lastTickAt = performance.now();
  publishFactions();
}

function applyDelta(delta: TickDelta): void {
  const { tiles, stats } = delta;
  for (let i = 0; i < tiles.length; i += 3) {
    const grid = tiles[i]!;
    const tile = tiles[i + 1]!;
    const owner = tiles[i + 2]!;
    const counts = view.ownerCounts[grid]!;
    const old = view.owners[grid]![tile]!;
    if (old !== 0) counts.set(old, (counts.get(old) ?? 1) - 1);
    if (owner !== 0) counts.set(owner, (counts.get(owner) ?? 0) + 1);
    view.owners[grid]![tile] = owner;
    view.dirty[grid]!.push(tile);
  }
  for (let o = 0; o < stats.length; o += STATS_STRIDE) {
    const f = view.factions.get(stats[o]!);
    if (!f) continue;
    f.alive = stats[o + 1] === 1;
    f.troops = stats[o + 2]!;
    f.workers = stats[o + 3]!;
    f.tileCount = stats[o + 4]!;
    f.solars = stats[o + 5]!;
    f.coronaTroops = stats[o + 6]!;
    f.coronaTiles = stats[o + 7]!;
    f.traitorUntil = stats[o + 8]!;
  }
  if (delta.diplomacy) applySnapshot(delta.diplomacy);
  for (const e of delta.events) applyEvent(e, delta.tick);
  if (delta.events.length > 0 || hasExpired(delta.tick)) publishRelations(delta.tick);
  for (const s of delta.structures) {
    if (s.destroyed) view.structures.delete(s.id);
    else view.structures.set(s.id, s);
  }
  if (delta.structures.length > 0 || delta.tick % 10 === 0) countStructures(delta.tick);
  applyWarships(delta.warships);
  for (const effect of delta.effects) addEffect(effect, delta.tick);
  if (view.effects.length > 0) view.effects = view.effects.filter((e) => e.untilTick > delta.tick);
  if (view.fallout.length > 0) view.fallout = view.fallout.filter((f) => f.untilTick > delta.tick);
  for (const ship of delta.shipsLaunched) {
    view.ships.set(ship.id, ship);
    alertForLaunch(ship, delta.tick);
  }
  for (const id of delta.shipsLanded) view.ships.delete(id);

  ui.tick.value = delta.tick;
  view.lastTickAt = performance.now();
  if (ui.notices.value.some((n) => n.untilTick <= delta.tick)) {
    ui.notices.value = ui.notices.value.filter((n) => n.untilTick > delta.tick);
  }
  if (ui.alerts.value.some((a) => a.untilTick <= delta.tick)) {
    ui.alerts.value = ui.alerts.value.filter((a) => a.untilTick > delta.tick);
  }
  if (delta.winner >= 0) {
    ui.winner.value = view.factions.get(delta.winner) ?? null;
    ui.phase.value = "ended";
  }
  publishFactions();
}

/** Recounts the player's launch-ready ports and loaded silos. */
function countStructures(tick: number): void {
  const me = view.init?.playerId;
  let ports = 0;
  let silos = 0;
  let loaded = 0;
  for (const s of view.structures.values()) {
    if (s.owner !== me || s.buildTicksLeft > 0) continue;
    if (isPortKind(s.kind)) ports++;
    if (s.kind === "launchSilo") {
      silos++;
      if (s.readyTick <= tick) loaded++;
    }
  }
  ui.readyPorts.value = ports;
  ui.silos.value = silos;
  ui.loadedSilos.value = loaded;
}

function applyWarships(flat: Int32Array): void {
  const next = new Map<number, WarshipView>();
  const me = view.init?.playerId;
  let mine = 0;
  for (let i = 0; i < flat.length; i += WARSHIP_STRIDE) {
    const id = flat[i]!;
    const old = view.warships.get(id);
    const owner = flat[i + 1]!;
    const x = flat[i + 2]!;
    const y = flat[i + 3]!;
    if (owner === me) mine++;
    next.set(id, {
      id,
      owner,
      prevX: old?.x ?? x,
      prevY: old?.y ?? y,
      x,
      y,
      hp: flat[i + 4]!,
      guardGrid: flat[i + 5]!,
    });
  }
  view.warships = next;
  if (ui.warships.value !== mine) ui.warships.value = mine;
  const selected = ui.selectedWarship.value;
  if (selected !== null && !next.has(selected)) ui.selectedWarship.value = null;
}

function addEffect(effect: CombatEffect, tick: number): void {
  const life =
    effect.kind === "beam" ? BEAM_TICKS : effect.kind === "blast" ? BLAST_TICKS : IMPACT_TICKS;
  view.effects.push({ effect, tick, untilTick: tick + life });
  if (effect.kind === "impact" && effect.weapon === "antimatterWarhead") {
    view.fallout.push({
      grid: effect.grid,
      tile: effect.tile,
      radius: effect.radius,
      untilTick: tick + BALANCE.weapons.antimatterWarhead.falloutTicks,
    });
  }
}

/** True if the player holds land on this grid. */
function holdsLand(grid: number): boolean {
  const me = view.init?.playerId;
  return me !== undefined && (view.ownerCounts[grid]?.get(me) ?? 0) > 0;
}

/** Spaceports and Sun Bases launch ships and trade. */
export function isPortKind(kind: string): boolean {
  return kind === "spaceport" || kind === "sunBase";
}

/** Warns the player about enemy landers heading for a world where they hold land. */
function alertForLaunch(ship: ShipView, tick: number): void {
  const me = view.init?.playerId;
  if (me === undefined || ship.owner === me || ship.kind !== "troopLander") return;
  if ((view.ownerCounts[ship.toGrid]?.get(me) ?? 0) === 0) return;
  const enemy = view.factions.get(ship.owner)?.name ?? "Enemy";
  const world = worldName(ship.toGrid);
  pushAlert(`${enemy}'s lander is heading to ${world}`, ship.toGrid, tick);
}

export function pushAlert(text: string, grid: number, tick: number): void {
  const alert = { id: nextAlertId++, text, grid, untilTick: tick + ALERT_TICKS };
  ui.alerts.value = [...ui.alerts.value.slice(-3), alert];
}

export function dismissAlert(id: number): void {
  ui.alerts.value = ui.alerts.value.filter((a) => a.id !== id);
}

/** Display name of the world a grid belongs to. */
export function worldName(grid: number): string {
  if (grid === view.coronaGrid) return strings.corona;
  const bodyId = view.init?.grids[grid]?.bodyId;
  return bodyId ? bodyById(bodyId).name : `World ${grid}`;
}

/**
 * Structures of a kind the player owns (finished or not); build costs rise
 * with this. Sun Base ships in flight count as Sun Bases, as in the simulation.
 */
export function ownedCount(kind: string): number {
  const me = view.init?.playerId;
  let n = 0;
  for (const s of view.structures.values()) if (s.owner === me && s.kind === kind) n++;
  if (kind === "sunBase") {
    for (const ship of view.ships.values()) {
      if (ship.owner === me && ship.kind === "sunBaseShip") n++;
    }
  }
  if (kind === "warship") {
    for (const w of view.warships.values()) if (w.owner === me) n++;
  }
  return n;
}

/** The faction owning most of a grid's land, and its share of it (0–1). */
export function mainOwner(grid: number): { owner: number; share: number } | null {
  const counts = view.ownerCounts[grid];
  if (!counts) return null;
  let owner = 0;
  let best = 0;
  for (const [id, n] of counts) {
    if (n > best || (n === best && id < owner)) {
      owner = id;
      best = n;
    }
  }
  return best === 0 ? null : { owner, share: best / Math.max(1, view.ownable[grid] ?? 1) };
}

/** Pushes fresh copies into the signals so components re-render. */
function publishFactions(): void {
  const all = [...view.factions.values()];
  const player = all.find((f) => f.kind === "player");
  ui.player.value = player ? { ...player } : null;
  ui.leaderboard.value = all
    .filter((f) => f.alive && f.tileCount > 0)
    .sort((a, b) => b.tileCount - a.tileCount || a.id - b.id)
    .slice(0, LEADERBOARD_SIZE)
    .map((f) => ({ ...f }));
}

/** A faction's share of all ownable land (the win condition counts this). */
export function landShare(f: FactionView): number {
  const total = view.init?.ownableTiles ?? 0;
  return total === 0 ? 0 : f.tileCount / total;
}

function applySnapshot(snapshot: DiplomacySnapshot): void {
  const pairs = (flat: readonly number[], key: (a: number, b: number) => number) => {
    const out = new Set<number>();
    for (let i = 0; i + 1 < flat.length; i += 2) out.add(key(flat[i]!, flat[i + 1]!));
    return out;
  };
  view.alliances = pairs(snapshot.alliances, pairKey);
  view.embargoes = pairs(snapshot.embargoes, dirKey);
}

/** Turns a diplomacy event into view state and, if it concerns the player, a notice. */
function applyEvent(e: GameEvent, tick: number): void {
  const me = view.init?.playerId;
  const name = (id: number) => view.factions.get(id)?.name ?? `#${id}`;
  switch (e.kind) {
    case "allyRequest":
      view.requests.set(dirKey(e.from, e.to), tick + BALANCE.diplomacy.requestTicks);
      if (e.to === me) pushNotice(strings.noticeAllyRequest(name(e.from)), tick);
      break;
    case "allied":
      view.requests.delete(dirKey(e.a, e.b));
      view.requests.delete(dirKey(e.b, e.a));
      if (e.a === me || e.b === me)
        pushNotice(strings.noticeAllied(name(e.a === me ? e.b : e.a)), tick);
      break;
    case "allianceBroken":
      if (e.other === me) pushNotice(strings.noticeBetrayed(name(e.by)), tick);
      else if (e.by === me) pushNotice(strings.noticeYouBroke(name(e.other)), tick);
      break;
    case "gift":
      if (e.to === me) pushNotice(strings.noticeGift(name(e.from), e.solars, e.troops), tick);
      break;
    case "embargo":
      if (e.to === me) pushNotice(strings.noticeEmbargo(name(e.from), e.on), tick);
      break;
    case "signal":
      if (e.to === me)
        pushNotice(strings.noticeSignal(name(e.from), e.signal, name(e.about)), tick);
      break;
    case "weaponLaunched": {
      // Warheads are announced to everyone; Kinetic Strikes only where you hold land.
      if (e.by === me || (e.weapon !== "antimatterWarhead" && !holdsLand(e.grid))) break;
      const seconds = Math.max(0, Math.round((e.arriveTick - tick) / 10));
      const weapon = strings.weaponNames[e.weapon];
      pushAlert(strings.alertWeapon(name(e.by), weapon, worldName(e.grid), seconds), e.grid, tick);
      break;
    }
    case "weaponIntercepted":
      if (e.by === me || e.owner === me) {
        pushNotice(strings.noticeIntercepted(strings.weaponNames[e.weapon], name(e.by)), tick);
      }
      break;
    case "weaponHit":
      if (e.by !== me && holdsLand(e.grid)) {
        pushNotice(strings.noticeWeaponHit(strings.weaponNames[e.weapon], worldName(e.grid)), tick);
      }
      break;
    case "independent":
      if (me !== undefined && (isAlly(me, e.colony) || isAlly(me, e.home))) {
        pushNotice(strings.noticeIndependent(name(e.colony)), tick);
      }
      break;
  }
}

function pushNotice(text: string, tick: number): void {
  const notice = { id: nextNoticeId++, text, untilTick: tick + NOTICE_TICKS };
  ui.notices.value = [...ui.notices.value.slice(-4), notice];
}

export function dismissNotice(id: number): void {
  ui.notices.value = ui.notices.value.filter((n) => n.id !== id);
}

/** True if a request shown to the player has run out since the last update. */
function hasExpired(tick: number): boolean {
  return ui.relations.value.requests.some((r) => r.untilTick < tick);
}

/** Rebuilds the player's relations from the view's diplomacy tables. */
function publishRelations(tick: number): void {
  const me = view.init?.playerId;
  if (me === undefined) return;
  const allies: number[] = [];
  const requests: { from: number; untilTick: number }[] = [];
  const asked: number[] = [];
  const embargoes: number[] = [];
  for (const f of view.factions.values()) {
    if (f.id === me || !f.alive) continue;
    if (isAlly(me, f.id)) allies.push(f.id);
    if (hasEmbargoOn(me, f.id)) embargoes.push(f.id);
    const incoming = view.requests.get(dirKey(f.id, me));
    if (incoming !== undefined && incoming >= tick && !isAlly(me, f.id)) {
      requests.push({ from: f.id, untilTick: incoming });
    }
    const outgoing = view.requests.get(dirKey(me, f.id));
    if (outgoing !== undefined && outgoing >= tick && !isAlly(me, f.id)) asked.push(f.id);
  }
  ui.relations.value = { allies, requests, asked, embargoes };
}
