import type { WorkerMessage } from "../../shared/messages";
import { ui, view } from "../store/clientStore";
import { audio } from "./audio";

/**
 * Turns what happens in a match into sound effects. Reads worker messages
 * after the store has applied them; never touches the simulation.
 */
export function createGameSounds(): (message: WorkerMessage) => void {
  /** Build timers of the player's structures, to hear when one finishes. */
  const mine = new Map<number, number>();
  /** The player's ships in flight, to hear them land. */
  const myShips = new Set<number>();
  let spawned = false;
  let ended = false;

  // Alerts (incoming landers and weapons) and diplomacy notices.
  let alerts = 0;
  ui.alerts.subscribe((list) => {
    if (list.length > alerts) audio.play("alert");
    alerts = list.length;
  });
  let notices = 0;
  ui.notices.subscribe((list) => {
    if (list.length > notices) audio.play("notice");
    notices = list.length;
  });

  return (message) => {
    if (message.type === "init") {
      mine.clear();
      myShips.clear();
      spawned = false;
      ended = false;
      audio.playMusic("game");
      return;
    }
    if (message.type !== "tick") return;
    const delta = message.delta;
    const me = view.init?.playerId;
    if (view.replay) return; // replays are watched in silence, apart from the music

    for (const s of delta.structures) {
      if (s.owner !== me || s.destroyed) {
        mine.delete(s.id);
        continue;
      }
      const before = mine.get(s.id);
      if (before === undefined && s.buildTicksLeft > 0) audio.play("build");
      else if (before !== undefined && before > 0 && s.buildTicksLeft === 0) audio.play("finished");
      mine.set(s.id, s.buildTicksLeft);
    }
    for (const ship of delta.shipsLaunched) {
      if (ship.owner !== me) continue;
      myShips.add(ship.id);
      if (ship.kind !== "freighter") audio.play("launch");
    }
    for (const id of delta.shipsLanded) {
      if (myShips.delete(id)) audio.play("land", 0.7);
    }
    const inSystem = ui.view.value.kind === "system";
    for (const e of delta.effects) {
      if (e.kind === "impact")
        audio.play(e.weapon === "antimatterWarhead" ? "warhead" : "explosion");
      else if (e.kind === "blast") audio.play("explosion", inSystem ? 0.6 : 0.25);
      else if (inSystem) audio.play("laser", 0.4);
    }

    const player = ui.player.value;
    if (player && !spawned && player.tileCount > 0) {
      spawned = true;
      audio.play("spawn");
    }
    if (!ended && (delta.winner >= 0 || (player && spawned && !player.alive))) {
      ended = true;
      const won = delta.winner === me;
      audio.play(won ? "victory" : "defeat");
    }
  };
}

/** A click sound for every button in the UI. */
export function attachClickSounds(root: HTMLElement): void {
  root.addEventListener("click", (e) => {
    if (e.target instanceof Element && e.target.closest("button")) audio.play("click");
  });
}
