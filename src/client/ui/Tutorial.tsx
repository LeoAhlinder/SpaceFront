import { useEffect } from "preact/hooks";
import { keyLabel } from "../input/keymap";
import { updateSettings } from "../settings";
import { ownedCount, ui, view } from "../store/clientStore";
import { strings } from "./strings";

/** Tiles to grow to in the "Expand" step. */
const EXPAND_GOAL = 300;

/** Keys shown in each step's text (null: none). */
const STEP_KEYS = [
  null,
  null,
  null,
  "buildSpaceport",
  null,
  "toggleSystemView",
  "launchLander",
  null,
] as const;

/**
 * True once the player has done what a step asks. Steps without a goal
 * (the first and the last) wait for the Next / Finish button.
 */
function stepDone(step: number): boolean {
  const me = ui.player.value;
  if (!me) return false;
  switch (step) {
    case 1:
      return me.tileCount > 0;
    case 2:
      return me.tileCount >= EXPAND_GOAL;
    case 3:
      return ownedCount("spaceport") > 0;
    case 4:
      return ui.readyPorts.value > 0;
    case 5:
      return ui.view.value.kind === "system";
    case 6:
      for (const ship of view.ships.values()) {
        if (ship.owner === me.id && ship.kind === "troopLander") return true;
      }
      return false;
    default:
      return false;
  }
}

/**
 * The tutorial match's guide: one short step at a time, each advancing on
 * its own when the player has done it (spawn, expand, build, system view,
 * launch).
 */
export function TutorialPanel() {
  const step = ui.tutorialStep.value;
  // Reading the tick re-renders this every tick, so the goals are re-checked.
  const done = ui.tick.value >= 0 && step !== null && stepDone(step);
  useEffect(() => {
    if (done && step !== null) ui.tutorialStep.value = step + 1;
  }, [done, step]);
  if (step === null || ui.phase.value !== "playing") return null;
  const steps = strings.tutorialSteps;
  const info = steps[Math.min(step, steps.length - 1)]!;
  const key = STEP_KEYS[step] ?? null;
  const last = step >= steps.length - 1;
  const finish = () => {
    ui.tutorialStep.value = null;
    updateSettings({ tutorialSeen: true });
  };
  return (
    <div class="tutorial panel" role="dialog" aria-label={strings.tutorial}>
      <div class="label">{strings.tutorialTitle(step + 1, steps.length)}</div>
      <strong>{info.title}</strong>
      <p>{info.text(key ? keyLabel(key) : "")}</p>
      {step === 2 && ui.player.value && (
        <p class="hint">
          {ui.player.value.tileCount} / {EXPAND_GOAL}
        </p>
      )}
      <div class="menu-row">
        {!last && (
          <button class="link" onClick={finish}>
            {strings.tutorialSkip}
          </button>
        )}
        {step === 0 && (
          <button class="primary" onClick={() => (ui.tutorialStep.value = 1)}>
            {strings.tutorialNext}
          </button>
        )}
        {last && (
          <button class="primary" onClick={finish}>
            {strings.tutorialFinish}
          </button>
        )}
      </div>
    </div>
  );
}
