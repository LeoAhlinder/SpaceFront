import { BALANCE } from "../data/balance";
import type { Command, FactionId, GridId } from "../core";
import type { SimBridge } from "./bridge/simBridge";
import type { TileHit } from "./render/renderer";
import type { Mode } from "./store/clientStore";
import { dismissAlert, ui, view } from "./store/clientStore";

/** Everything the player can do, turned into view changes or messages for the simulation. */
export interface Actions {
  readonly startMatch: () => void;
  readonly clickTile: (hit: TileHit) => void;
  readonly setTroopRatio: (pct: number) => void;
  readonly openSystem: () => void;
  readonly openPlanet: (grid: number) => void;
  readonly toggleSystemView: () => void;
  /** Turns a mode on, or off if it's already on. */
  readonly toggleMode: (mode: Exclude<Mode, "none">) => void;
  readonly cancel: () => void;
  readonly focusAlert: (id: number, grid: number) => void;
}

export function createActions(bridge: SimBridge): Actions {
  const player = () => (view.init ? (view.init.playerId as FactionId) : null);
  const send = (command: Command) => bridge.send({ type: "command", command });
  let lastPlanet = 0;

  /** A finished Spaceport of the player's to launch from: one on the target's map if any. */
  const portFor = (grid: number): number | null => {
    let fallback: number | null = null;
    for (const s of view.structures.values()) {
      if (s.owner !== player() || s.kind !== "spaceport" || s.buildTicksLeft > 0) continue;
      if (s.grid === grid) return s.id;
      fallback ??= s.id;
    }
    return fallback;
  };

  const openPlanet = (grid: number) => {
    lastPlanet = grid;
    ui.view.value = { kind: "planet", grid };
  };
  const openSystem = () => {
    if (ui.view.value.kind === "planet") lastPlanet = ui.view.value.grid;
    ui.view.value = { kind: "system" };
  };

  return {
    startMatch: () => {
      ui.phase.value = "loading";
      ui.error.value = null;
      bridge.send({
        type: "start",
        setup: {
          seed: Math.floor(Math.random() * 0x7fffffff),
          mapId: "sol",
          botCount: BALANCE.match.defaultBotCount,
          playerName: "You",
        },
      });
    },

    /**
     * A click on a map. Build mode: place a Spaceport or Habitat. Launch mode: send a
     * Troop Lander there. Otherwise: spawn if not spawned yet, else attack.
     */
    clickTile: (hit) => {
      const faction = player();
      const me = ui.player.value;
      if (faction === null || !me || !me.alive || ui.phase.value !== "playing") return;
      const grid = hit.grid as GridId;
      const mode = ui.mode.value;
      if (me.tileCount === 0) {
        send({ type: "spawn", faction, grid, tile: hit.tile });
      } else if (mode === "spaceport" || mode === "habitat") {
        send({ type: "build", faction, kind: mode, grid, tile: hit.tile });
        ui.mode.value = "none";
      } else if (mode === "launch") {
        const from = portFor(hit.grid);
        if (from === null) return;
        send({
          type: "launch",
          faction,
          kind: "troopLander",
          from,
          toGrid: grid,
          toTile: hit.tile,
          ratioPct: ui.attackRatioPct.value,
        });
        ui.mode.value = "none";
      } else if (ui.tick.value >= ui.spawnPhaseTicks.value) {
        send({ type: "attack", faction, grid, tile: hit.tile, ratioPct: ui.attackRatioPct.value });
      }
    },

    setTroopRatio: (pct) => {
      ui.troopRatioPct.value = pct;
      const faction = player();
      if (faction !== null) send({ type: "setRatio", faction, troopRatioPct: pct });
    },

    openSystem,
    openPlanet,
    toggleSystemView: () => {
      if (ui.phase.value === "menu") return;
      if (ui.view.value.kind === "planet") openSystem();
      else openPlanet(lastPlanet);
    },

    toggleMode: (mode) => {
      if (ui.phase.value !== "playing") return;
      if (mode === "launch" && ui.readyPorts.value === 0) return;
      ui.mode.value = ui.mode.value === mode ? "none" : mode;
    },

    cancel: () => {
      ui.mode.value = "none";
    },

    focusAlert: (id, grid) => {
      dismissAlert(id);
      openPlanet(grid);
    },
  };
}
