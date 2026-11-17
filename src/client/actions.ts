import { BALANCE } from "../data/balance";
import type { Command, FactionId, GridId, SignalKind } from "../core";
import type { MatchSummary, WorkerMessage } from "../shared/messages";
import { log } from "../shared/log";
import type { SimBridge } from "./bridge/simBridge";
import type { Platform } from "./platform/platform";
import type { SavedEntry } from "./saves";
import { SaveLibrary } from "./saves";
import { strings } from "./ui/strings";
import type { TileHit } from "./render/renderer";
import type { Mode } from "./store/clientStore";
import { dismissAlert, isPortKind, ui, view } from "./store/clientStore";

/** Share of your Solars or troops a gift button sends. */
const GIFT_PCT = 25;

/** Everything the player can do, turned into view changes or messages for the simulation. */
export interface Actions {
  /** Starts a new match with the chosen difficulty, or the tutorial. */
  readonly startMatch: (options?: { readonly tutorial?: boolean }) => void;
  /** Leaves the match for the main menu (the simulation stays paused until the next start). */
  readonly quitToMenu: () => void;
  /** Pauses or resumes the simulation. */
  readonly setPaused: (paused: boolean) => void;
  readonly togglePause: () => void;
  /** Opens or closes the in-game menu (which pauses the game while open). */
  readonly setGameMenu: (open: boolean) => void;
  /** Saved games and replays on this platform. */
  readonly library: SaveLibrary;
  /** Saves the running match (a quick save replaces the previous quick save). */
  readonly saveGame: (quick?: boolean) => Promise<void>;
  /** Stores the running (or just finished) match's replay. */
  readonly saveReplay: () => Promise<void>;
  readonly loadGame: (entry: SavedEntry) => Promise<void>;
  readonly watchReplay: (entry: SavedEntry) => Promise<void>;
  /** Replay speed, times normal. */
  readonly setReplaySpeed: (speed: number) => void;
  /** Answers to the worker's save and replay requests; call for every worker message. */
  readonly onWorkerMessage: (message: WorkerMessage) => void;
  readonly clickTile: (hit: TileHit) => void;
  readonly setTroopRatio: (pct: number) => void;
  readonly openSystem: () => void;
  readonly openPlanet: (grid: number) => void;
  readonly toggleSystemView: () => void;
  /** Turns a mode on, or off if it's already on. */
  readonly toggleMode: (mode: Exclude<Mode, "none">) => void;
  /** Leaves the current mode or Warship selection; returns false if there was nothing to leave. */
  readonly cancel: () => boolean;
  /**
   * A click in empty space or on a world's icon in the system view, while
   * placing a Warship or with one selected: launch it, or send it on patrol
   * there. Returns false if neither applies (the click does what it usually does).
   */
  readonly clickSpace: (point: { x: number; y: number }, grid: number | null) => boolean;
  /** Selects one of the player's Warships (null: none) for a patrol order. */
  readonly selectWarship: (id: number | null) => void;
  /** Selects the player's next Warship (cycling) and opens the system view. */
  readonly nextWarship: () => void;
  readonly focusAlert: (id: number, grid: number) => void;
  /** Opens the diplomacy panel for a faction (null closes it). */
  readonly select: (faction: number | null) => void;
  /** Opens the diplomacy panel for whoever owns the tile. */
  readonly inspectTile: (hit: TileHit) => void;
  readonly ally: (other: number, action: "request" | "accept" | "break") => void;
  readonly gift: (to: number, what: "solars" | "troops") => void;
  readonly embargo: (other: number, on: boolean) => void;
  /** "help" goes to every ally; "attack" asks every ally to attack `about`; "peace" goes to `to`. */
  readonly signal: (signal: SignalKind, to: number) => void;
}

/** How long a toast ("Game saved") stays up, in ms. */
const TOAST_MS = 2500;

export function createActions(bridge: SimBridge, platform: Platform): Actions {
  const library = new SaveLibrary(platform);
  /** Save and replay requests waiting for the worker's answer, by request id. */
  const waiting = new Map<number, (data: Uint8Array, summary: MatchSummary) => void>();
  let nextRequest = 1;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const toast = (text: string) => {
    ui.toast.value = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (ui.toast.value = null), TOAST_MS);
  };
  /** Asks the worker for save or replay data. */
  const requestData = (type: "save" | "getReplay") =>
    new Promise<{ data: Uint8Array; summary: MatchSummary }>((resolve) => {
      const requestId = nextRequest++;
      waiting.set(requestId, (data, summary) => resolve({ data, summary }));
      bridge.send({ type, requestId });
    });
  const inMatch = () =>
    (ui.phase.value === "playing" || ui.phase.value === "ended") &&
    !view.replay &&
    view.init !== null;
  /** Starts a saved game or replay from its bytes. */
  const begin = (message: { type: "load" | "watchReplay"; data: Uint8Array }) => {
    ui.phase.value = "loading";
    ui.error.value = null;
    ui.tutorialStep.value = null;
    bridge.send(message);
  };
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

  /** The player's lowest-id loaded Launch Silo, or null. */
  const loadedSilo = (): number | null => {
    let best: number | null = null;
    for (const s of view.structures.values()) {
      if (s.owner !== player() || s.kind !== "launchSilo" || s.buildTicksLeft > 0) continue;
      if (s.readyTick > ui.tick.value) continue;
      if (best === null || s.id < best) best = s.id;
    }
    return best;
  };

  const openPlanet = (grid: number) => {
    lastPlanet = grid;
    ui.view.value = { kind: "planet", grid };
  };
  const openSystem = () => {
    if (ui.view.value.kind === "planet") lastPlanet = ui.view.value.grid;
    ui.view.value = { kind: "system" };
  };

  const setPaused = (paused: boolean) => {
    ui.paused.value = paused;
    bridge.send({ type: "pause", paused });
  };

  return {
    startMatch: (options = {}) => {
      ui.phase.value = "loading";
      ui.error.value = null;
      ui.tutorialStep.value = options.tutorial ? 0 : null;
      view.replay = false;
      bridge.send({
        type: "start",
        setup: {
          seed: Math.floor(Math.random() * 0x7fffffff),
          mapId: "sol",
          botCount: BALANCE.match.defaultBotCount,
          playerName: "You",
          difficulty: options.tutorial ? "easy" : ui.difficulty.value,
          ...(options.tutorial && { tutorial: true }),
          ...devStartSolars(),
        },
      });
    },

    quitToMenu: () => {
      setPaused(true);
      ui.gameMenu.value = false;
      ui.gameSettings.value = false;
      ui.tutorialStep.value = null;
      ui.mode.value = "none";
      ui.selected.value = null;
      ui.screen.value = "main";
      ui.phase.value = "menu";
    },

    library,

    saveGame: async (quick = false) => {
      if (!inMatch() || ui.phase.value !== "playing") return;
      try {
        const { data, summary } = await requestData("save");
        await library.store("save", data, summary, quick);
        toast(quick ? strings.quickSaved : strings.gameSaved);
      } catch (error) {
        log.error("Saving failed", error);
        toast(strings.saveFailed);
      }
    },

    saveReplay: async () => {
      if (!inMatch()) return;
      try {
        const { data, summary } = await requestData("getReplay");
        await library.store("replay", data, summary);
        toast(strings.replaySaved);
      } catch (error) {
        log.error("Saving the replay failed", error);
        toast(strings.saveFailed);
      }
    },

    loadGame: async (entry) => {
      begin({ type: "load", data: await library.read(entry) });
    },

    watchReplay: async (entry) => {
      begin({ type: "watchReplay", data: await library.read(entry) });
    },

    setReplaySpeed: (speed) => {
      if (!view.replay) return;
      ui.replaySpeed.value = speed;
      view.tickMs = 100 / speed;
      bridge.send({ type: "setSpeed", speed });
    },

    onWorkerMessage: (message) => {
      if (message.type !== "saveData" && message.type !== "replayData") return;
      const done = waiting.get(message.requestId);
      waiting.delete(message.requestId);
      done?.(message.data, message.summary);
    },

    setPaused,
    togglePause: () => {
      if (ui.phase.value !== "playing" || ui.gameMenu.value) return;
      setPaused(!ui.paused.value);
    },

    setGameMenu: (open) => {
      if (ui.phase.value !== "playing" && ui.phase.value !== "ended") return;
      ui.gameMenu.value = open;
      ui.gameSettings.value = false;
      if (ui.phase.value === "playing") setPaused(open);
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
      if (faction === null || !me || !me.alive || !canAct()) return;
      const grid = hit.grid as GridId;
      const mode = ui.mode.value;
      if (me.tileCount === 0) {
        send({ type: "spawn", faction, grid, tile: hit.tile });
      } else if (isBuildMode(mode)) {
        send({ type: "build", faction, kind: mode, grid, tile: hit.tile });
        ui.mode.value = "none";
      } else if (mode === "kineticStrike" || mode === "antimatterWarhead") {
        const from = loadedSilo();
        if (from === null) return;
        send({ type: "fireWeapon", faction, kind: mode, from, grid, tile: hit.tile });
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
      if (!canAct()) return;
      const needsPort = mode === "launch" || mode === "sunBase" || mode === "warship";
      if (needsPort && ui.readyPorts.value === 0) return;
      const isWeapon = mode === "kineticStrike" || mode === "antimatterWarhead";
      if (isWeapon && ui.loadedSilos.value === 0) return;
      ui.mode.value = ui.mode.value === mode ? "none" : mode;
      ui.selectedWarship.value = null;
      // The Corona and Warship patrols are played in the system view.
      const inSpace = mode === "sunBase" || mode === "solarSiphon" || mode === "warship";
      if (inSpace && ui.mode.value === mode) openSystem();
    },

    cancel: () => {
      const had = ui.mode.value !== "none" || ui.selectedWarship.value !== null;
      ui.mode.value = "none";
      ui.selectedWarship.value = null;
      return had;
    },

    clickSpace: (point, grid) => {
      const faction = player();
      if (faction === null || !canAct()) return false;
      const area = {
        x: Math.round(point.x),
        y: Math.round(point.y),
        guardGrid: grid ?? -1,
      };
      const selected = ui.selectedWarship.value;
      if (selected !== null) {
        send({ type: "patrol", faction, warship: selected, ...area });
        ui.selectedWarship.value = null;
        return true;
      }
      if (ui.mode.value !== "warship") return false;
      const from = portFor(grid ?? -1);
      if (from === null) return true;
      send({ type: "launchWarship", faction, from, ...area });
      ui.mode.value = "none";
      return true;
    },

    selectWarship: (id) => {
      ui.mode.value = "none";
      ui.selectedWarship.value = id;
    },

    nextWarship: () => {
      if (ui.phase.value !== "playing") return;
      const me = player();
      const mine = [...view.warships.values()]
        .filter((w) => w.owner === me)
        .map((w) => w.id)
        .sort((a, b) => a - b);
      if (mine.length === 0) return;
      const current = ui.selectedWarship.value;
      const next = mine.find((id) => current === null || id > current) ?? mine[0]!;
      ui.mode.value = "none";
      ui.selectedWarship.value = next;
      openSystem();
    },

    focusAlert: (id, grid) => {
      dismissAlert(id);
      openPlanet(grid);
    },

    select: (faction) => {
      ui.selected.value = faction === player() ? null : faction;
    },

    inspectTile: (hit) => {
      const owner = view.owners[hit.grid]?.[hit.tile] ?? 0;
      ui.selected.value = owner === 0 || owner === player() ? null : owner;
    },

    ally: (other, action) => {
      const faction = player();
      if (faction !== null) send({ type: "ally", faction, other: other as FactionId, action });
    },

    gift: (to, what) => {
      const faction = player();
      const me = ui.player.value;
      if (faction === null || !me) return;
      const amount = Math.floor(((what === "solars" ? me.solars : me.troops) * GIFT_PCT) / 100);
      if (amount < 1) return;
      send({
        type: "gift",
        faction,
        to: to as FactionId,
        solars: what === "solars" ? amount : 0,
        troops: what === "troops" ? amount : 0,
      });
    },

    embargo: (other, on) => {
      const faction = player();
      if (faction !== null) send({ type: "embargo", faction, other: other as FactionId, on });
    },

    signal: (signal, to) => {
      const faction = player();
      if (faction === null) return;
      const targets = signal === "peace" ? [to] : ui.relations.value.allies;
      const about = (signal === "attack" ? to : 0) as FactionId;
      for (const ally of targets) {
        if (ally === to && signal === "attack") continue;
        send({ type: "signal", faction, to: ally as FactionId, signal, about });
      }
    },
  };
}

/** The player may give orders: in a running, unpaused match that isn't a replay. */
function canAct(): boolean {
  return ui.phase.value === "playing" && !ui.paused.value && !view.replay;
}

const BUILD_MODES = [
  "spaceport",
  "habitat",
  "solarSiphon",
  "shieldGenerator",
  "orbitalDefense",
  "launchSilo",
] as const;

/** Modes where a click places a structure. */
function isBuildMode(mode: Mode): mode is (typeof BUILD_MODES)[number] {
  return (BUILD_MODES as readonly string[]).includes(mode);
}

/** `?solars=N` in a dev build starts the player with N Solars (for play-testing). */
function devStartSolars(): { devStartSolars?: number } {
  if (!import.meta.env.DEV) return {};
  const n = Number(new URLSearchParams(location.search).get("solars"));
  return Number.isSafeInteger(n) && n > 0 ? { devStartSolars: n } : {};
}
