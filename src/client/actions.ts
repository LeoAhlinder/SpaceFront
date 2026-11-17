import { BALANCE } from "../data/balance";
import type { Command, FactionId, GridId } from "../core";
import type { SimBridge } from "./bridge/simBridge";
import type { TileHit } from "./render/renderer";
import { ui, view } from "./store/clientStore";

/** Everything the player can do, turned into messages for the simulation. */
export interface Actions {
  readonly startMatch: () => void;
  readonly clickTile: (hit: TileHit) => void;
  readonly setTroopRatio: (pct: number) => void;
}

export function createActions(bridge: SimBridge): Actions {
  const player = () => (view.init ? (view.init.playerId as FactionId) : null);
  const send = (command: Command) => bridge.send({ type: "command", command });

  return {
    startMatch: () => {
      ui.phase.value = "loading";
      ui.error.value = null;
      bridge.send({
        type: "start",
        setup: {
          seed: Math.floor(Math.random() * 0x7fffffff),
          mapId: "earth",
          botCount: BALANCE.match.defaultBotCount,
          playerName: "You",
        },
      });
    },

    /** Not spawned yet: spawn here. Otherwise: attack whoever owns this tile. */
    clickTile: (hit) => {
      const faction = player();
      const me = ui.player.value;
      if (faction === null || !me || !me.alive || ui.phase.value !== "playing") return;
      const grid = hit.grid as GridId;
      if (me.tileCount === 0) {
        send({ type: "spawn", faction, grid, tile: hit.tile });
      } else if (ui.tick.value >= ui.spawnPhaseTicks.value) {
        send({ type: "attack", faction, grid, tile: hit.tile, ratioPct: ui.attackRatioPct.value });
      }
    },

    setTroopRatio: (pct) => {
      ui.troopRatioPct.value = pct;
      const faction = player();
      if (faction !== null) send({ type: "setRatio", faction, troopRatioPct: pct });
    },
  };
}
