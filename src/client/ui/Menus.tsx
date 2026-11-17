import type { Actions } from "../actions";
import { DIFFICULTIES, DIFFICULTY_IDS } from "../../data/difficulty";
import { keyLabel } from "../input/keymap";
import { settings } from "../settings";
import { ui } from "../store/clientStore";
import { SettingsPanel } from "./SettingsPanel";
import { strings } from "./strings";

/** The main menu and its pages: new game, settings (load and replays come from saves.tsx). */
export function MainMenu({
  actions,
  extra,
}: {
  actions: Actions;
  extra?: preact.ComponentChildren;
}) {
  const screen = ui.screen.value;
  if (screen === "setup") return <MatchSetup actions={actions} />;
  if (screen === "settings") {
    return (
      <div class="menu panel wide">
        <SettingsPanel onBack={() => (ui.screen.value = "main")} />
      </div>
    );
  }
  if (screen !== "main") return <>{extra}</>;
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
export function GameMenu({
  actions,
  onSave,
}: {
  actions: Actions;
  onSave?: (() => void) | undefined;
}) {
  if (!ui.gameMenu.value) return null;
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
        {onSave && <button onClick={onSave}>{strings.saveGame}</button>}
        <button onClick={() => (ui.gameSettings.value = true)}>{strings.settings}</button>
        <button onClick={actions.quitToMenu}>{strings.quitToMenu}</button>
      </div>
    </div>
  );
}

/** Shown while the match is paused with the pause key (not the menu). */
export function PauseBanner() {
  if (!ui.paused.value || ui.gameMenu.value || ui.phase.value !== "playing") return null;
  return <div class="banner">{strings.pausedHint(keyLabel("pause"))}</div>;
}
