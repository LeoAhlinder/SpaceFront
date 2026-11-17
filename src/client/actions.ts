import { BALANCE } from "../data/balance";
import type { Command, FactionId, GridId } from "../core";
import type { SimBridge } from "./bridge/simBridge";
import type { TileHit } from "./render/renderer";
import type { Mode } from "./store/clientStore";
import { dismissAlert, isPortKind, ui, view } from "./store/clientStore";

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

  /**
   * A finished Spaceport or Sun Base of the player's to launch from: one on
   * the target's map if any, else a Spaceport (it launches from the bigger
   * troop pool), else anything.
   */
  const portFor = (grid: number): number | null => {
    let fallback: number | null = null;
    for (const s of view.structures.values()) {
      if (s.owner !== player() || !isPortKind(s.kind) || s.buildTicksLeft > 0) continue;
      if (s.grid === grid) return s.id;
      if (fallback === null || (s.kind === "spaceport" && !isSpaceport(fallback))) fallback = s.id;
    }
    return fallback;
  };
  const isSpaceport = (id: number) => view.structures.get(id)?.kind === "spaceport";

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
     * A click on a map (or on the Corona in the system view). Build mode:
     * place a Spaceport, Habitat or Solar Siphon. Launch mode: send a Troop
     * Lander there. Sun Base mode: send a Sun Base ship there. Otherwise:
     * spawn if not spawned yet, else attack.
     */
    clickTile: (hit) => {
      const faction = player();
      const me = ui.player.value;
      if (faction === null || !me || !me.alive || ui.phase.value !== "playing") return;
      const grid = hit.grid as GridId;
      const mode = ui.mode.value;
      if (me.tileCount === 0) {
        send({ type: "spawn", faction, grid, tile: hit.tile });
      } else if (mode === "spaceport" || mode === "habitat" || mode === "solarSiphon") {
        send({ type: "build", faction, kind: mode, grid, tile: hit.tile });
        ui.mode.value = "none";
      } else if (mode === "launch" || mode === "sunBase") {
        // Sun Base ships leave from a Spaceport, so they carry main troops.
        const from = mode === "sunBase" ? portFor(-1) : portFor(hit.grid);
        if (from === null) return;
        send({
          type: "launch",
          faction,
          kind: mode === "sunBase" ? "sunBaseShip" : "troopLander",
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
      if ((mode === "launch" || mode === "sunBase") && ui.readyPorts.value === 0) return;
      ui.mode.value = ui.mode.value === mode ? "none" : mode;
      // The Corona is played in the system view.
      if ((mode === "sunBase" || mode === "solarSiphon") && ui.mode.value === mode) openSystem();
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
