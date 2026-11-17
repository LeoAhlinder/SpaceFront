import type { FactionId, GridId } from "../ids";
import type { ShipKind, StructureKind } from "../world/world";

/**
 * Every way to change the game: from the human, the AI or (later) the network.
 * Commands are plain JSON so they can be saved, replayed and sent.
 */
export type Command = SpawnCommand | AttackCommand | SetRatioCommand | BuildCommand | LaunchCommand;

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
