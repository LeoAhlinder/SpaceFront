import type { FactionId, GridId } from "../ids";

/**
 * Every way to change the game: from the human, the AI or (later) the network.
 * Commands are plain JSON so they can be saved, replayed and sent.
 */
export type Command = SpawnCommand | AttackCommand | SetRatioCommand;

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
