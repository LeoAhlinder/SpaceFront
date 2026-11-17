import type { Actions } from "../actions";
import { DIFFICULTIES, DIFFICULTY_IDS } from "../../data/difficulty";
import { keyLabel } from "../input/keymap";
import { settings } from "../settings";
import { ui, view } from "../store/clientStore";
import { SavesScreen } from "./SavesScreen";
import { SettingsPanel } from "./SettingsPanel";
import { strings } from "./strings";

/** The main menu and its pages: new game, load game, replays, settings. */
export function MainMenu({ actions }: { actions: Actions }) {
  const screen = ui.screen.value;
  if (screen === "setup") return <MatchSetup actions={actions} />;
  if (screen === "load") return <SavesScreen actions={actions} kind="save" />;
  if (screen === "replays") return <SavesScreen actions={actions} kind="replay" />;
  if (screen === "settings") {
    return (
      <div class="menu panel wide">
        <SettingsPanel onBack={() => (ui.screen.value = "main")} />
      </div>
    );
  }
  const newPlayer = !settings.value.tutorialSeen;
  return (
    <div class="menu panel">
      <h1>{strings.title}</h1>
      <p>{strings.tagline}</p>
      <div class="menu-buttons">
        <button class={newPlayer ? "" : "primary"} onClick={() => (ui.screen.value = "setup")}>
          {strings.play}
        </button>
        <button
          class={newPlayer ? "primary" : ""}
          title={strings.tutorialTagline}
          onClick={() => actions.startMatch({ tutorial: true })}
        >
          {strings.tutorial}
        </button>
        <button onClick={() => (ui.screen.value = "load")}>{strings.loadGame}</button>
        <button onClick={() => (ui.screen.value = "replays")}>{strings.replays}</button>
        <button onClick={() => (ui.screen.value = "settings")}>{strings.settings}</button>
      </div>
      <p class="hint">{strings.menuHelp}</p>
    </div>
  );
}

/** Difficulty choice and the start button. */
function MatchSetup({ actions }: { actions: Actions }) {
  const chosen = ui.difficulty.value;
  return (
    <div class="menu panel">
      <h1>{strings.newGame}</h1>
      <div class="label">{strings.difficulty}</div>
      <div class="difficulty" role="radiogroup" aria-label={strings.difficulty}>
        {DIFFICULTY_IDS.map((d) => (
          <button
            key={d}
            role="radio"
            aria-checked={d === chosen}
            class={d === chosen ? "active" : ""}
            onClick={() => (ui.difficulty.value = d)}
          >
            {DIFFICULTIES[d].name}
          </button>
        ))}
      </div>
      <p class="hint">{DIFFICULTIES[chosen].description}</p>
      <div class="menu-row">
        <button onClick={() => (ui.screen.value = "main")}>{strings.back}</button>
        <button class="primary" onClick={() => actions.startMatch()}>
          {strings.start}
        </button>
      </div>
    </div>
  );
}

/** The in-game menu: resume, save, settings, quit. Pauses the match while open. */
export function GameMenu({ actions }: { actions: Actions }) {
  if (!ui.gameMenu.value) return null;
  const canSave = ui.phase.value === "playing" && !view.replay;
  if (ui.gameSettings.value) {
    return (
      <div class="menu panel wide">
        <SettingsPanel onBack={() => (ui.gameSettings.value = false)} />
      </div>
    );
  }
  return (
    <div class="menu panel">
      <h1>{strings.paused}</h1>
      <div class="menu-buttons">
        <button class="primary" onClick={() => actions.setGameMenu(false)}>
          {strings.resume}
        </button>
        {canSave && <button onClick={() => void actions.saveGame()}>{strings.saveGame}</button>}
        {!view.replay && (
          <button onClick={() => void actions.saveReplay()}>{strings.saveReplay}</button>
        )}
        <button onClick={() => (ui.gameSettings.value = true)}>{strings.settings}</button>
        <button onClick={actions.quitToMenu}>{strings.quitToMenu}</button>
      </div>
    </div>
  );
}

/** While watching a replay: what it is, its speed, and a way out. */
export function ReplayBar({ actions }: { actions: Actions }) {
  if (!view.replay || ui.phase.value !== "playing") return null;
  return (
    <div class="banner replay-bar">
      <strong>{strings.watchingReplay}</strong>
      {REPLAY_SPEEDS.map((speed) => (
        <button
          key={speed}
          class={ui.replaySpeed.value === speed ? "active" : ""}
          onClick={() => actions.setReplaySpeed(speed)}
        >
          {strings.replaySpeed(speed)}
        </button>
      ))}
      <button onClick={actions.quitToMenu}>{strings.quitToMenu}</button>
    </div>
  );
}

const REPLAY_SPEEDS = [1, 2, 4, 8, 16] as const;

/** Shown while the match is paused with the pause key (not the menu). */
export function PauseBanner() {
  if (!ui.paused.value || ui.gameMenu.value || ui.phase.value !== "playing") return null;
  return <div class="banner">{strings.pausedHint(keyLabel("pause"))}</div>;
}
