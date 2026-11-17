import type { FactionId, GridId } from "../ids";
import type { SignalKind } from "../world/diplomacy";
import type { ShipKind, StructureKind, WeaponKind } from "../world/world";

/**
 * Every way to change the game: from the human, the AI or (later) the network.
 * Commands are plain JSON so they can be saved, replayed and sent.
 */
export type Command =
  | SpawnCommand
  | AttackCommand
  | SetRatioCommand
  | BuildCommand
  | LaunchCommand
  | AllyCommand
  | GiftCommand
  | EmbargoCommand
  | SignalCommand
  | LaunchWarshipCommand
  | PatrolCommand
  | FireWeaponCommand;

/** Place the faction's starting territory around `tile`. Once per faction. */
export interface SpawnCommand {
  readonly type: "spawn";
  readonly faction: FactionId;
  readonly grid: GridId;
  readonly tile: number;
}

/**
 * Attack whoever owns `tile` (neutral land included) with `ratioPct` percent of
 * the faction's troops. The attack spreads from the shared border, pulled
 * toward `tile`.
 */
export interface AttackCommand {
  readonly type: "attack";
  readonly faction: FactionId;
  readonly grid: GridId;
  readonly tile: number;
  readonly ratioPct: number;
}

/** Set what percent of the population should be troops (the rest are workers). */
export interface SetRatioCommand {
  readonly type: "setRatio";
  readonly faction: FactionId;
  readonly troopRatioPct: number;
}

/** Build a structure on one of the faction's own tiles. */
export interface BuildCommand {
  readonly type: "build";
  readonly faction: FactionId;
  readonly kind: StructureKind;
  readonly grid: GridId;
  readonly tile: number;
}

/**
 * Launch a ship from one of the faction's finished Spaceports to `toTile` on
 * any map (the same map too, e.g. across an ocean), carrying `ratioPct`
 * percent of the faction's troops.
 */
export interface LaunchCommand {
  readonly type: "launch";
  readonly faction: FactionId;
  readonly kind: ShipKind;
  /** Structure id of the launching Spaceport. */
  readonly from: number;
  readonly toGrid: GridId;
  readonly toTile: number;
  readonly ratioPct: number;
}

/**
 * Diplomacy: ask `other` for an alliance (accepted at once if they already
 * asked you), accept their request, or break an alliance (which marks you a
 * traitor for a while).
 */
export interface AllyCommand {
  readonly type: "ally";
  readonly faction: FactionId;
  readonly other: FactionId;
  readonly action: "request" | "accept" | "break";
}

/** Send Solars and/or troops (from the main pool) to an ally. */
export interface GiftCommand {
  readonly type: "gift";
  readonly faction: FactionId;
  readonly to: FactionId;
  readonly solars: number;
  readonly troops: number;
}

/** Start (on = true) or lift an embargo: no trade between the two while either has one. */
export interface EmbargoCommand {
  readonly type: "embargo";
  readonly faction: FactionId;
  readonly other: FactionId;
  readonly on: boolean;
}

/**
 * A quick signal to another faction: "help" (to an ally), "attack" (asks an
 * ally to attack `about`) or "peace". Changes nothing by itself; nations react to it.
 */
export interface SignalCommand {
  readonly type: "signal";
  readonly faction: FactionId;
  readonly to: FactionId;
  readonly signal: SignalKind;
  /** The faction the signal is about (for "attack"), else 0. */
  readonly about: FactionId;
}

/**
 * Where a Warship patrols: around a fixed point in space (x, y), or around a
 * world (guardGrid ≥ 0; the area moves with the body, and x, y are ignored).
 */
export interface PatrolArea {
  readonly x: number;
  readonly y: number;
  /** Grid of the body to guard, or -1 for the fixed point. */
  readonly guardGrid: number;
}

/** Buy a Warship at one of the faction's finished Spaceports or Sun Bases and send it to patrol. */
export interface LaunchWarshipCommand extends PatrolArea {
  readonly type: "launchWarship";
  readonly faction: FactionId;
  /** Structure id of the launching Spaceport or Sun Base. */
  readonly from: number;
}

/** Give one of the faction's Warships a new patrol area. */
export interface PatrolCommand extends PatrolArea {
  readonly type: "patrol";
  readonly faction: FactionId;
  /** The Warship's id. */
  readonly warship: number;
}

/**
 * Fire a Kinetic Strike or an Antimatter Warhead from one of the faction's
 * loaded Launch Silos at `tile` on any map (paid now). Everyone is warned.
 */
export interface FireWeaponCommand {
  readonly type: "fireWeapon";
  readonly faction: FactionId;
  readonly kind: WeaponKind;
  /** Structure id of the Launch Silo. */
  readonly from: number;
  readonly grid: GridId;
  readonly tile: number;
}
