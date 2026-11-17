import { useLayoutEffect, useState } from "preact/hooks";
import type { KeyAction } from "../input/keymap";
import { conflictingActions, KEY_ACTIONS, keyLabel } from "../input/keymap";
import type { Quality } from "../settings";
import { settings, updateSettings } from "../settings";
import { ui } from "../store/clientStore";
import { strings } from "./strings";

/** Volume, graphics quality and key remapping. Changes are stored at once. */
export function SettingsPanel({ onBack }: { onBack: () => void }) {
  const s = settings.value;
  const [capturing, setCapturing] = useState<KeyAction | null>(null);
  const [startQuality] = useState(s.quality);
  const conflicts = conflictingActions();

  // While capturing, the next key press becomes the binding (Esc cancels).
  useLayoutEffect(() => {
    ui.capturingKey.value = capturing !== null;
    if (capturing === null) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key !== "Escape" || capturing === "cancel") {
        updateSettings({ keys: { ...settings.value.keys, [capturing]: e.key } });
      }
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      ui.capturingKey.value = false;
    };
  }, [capturing]);

  return (
    <div class="settings">
      <h1>{strings.settings}</h1>

      <div class="label">{strings.audio}</div>
      <Volume
        label={strings.masterVolume}
        value={s.masterVolume}
        onInput={(v) => updateSettings({ masterVolume: v })}
      />
      <Volume
        label={strings.musicVolume}
        value={s.musicVolume}
        onInput={(v) => updateSettings({ musicVolume: v })}
      />
      <Volume
        label={strings.sfxVolume}
        value={s.sfxVolume}
        onInput={(v) => updateSettings({ sfxVolume: v })}
      />

      <div class="label">{strings.graphics}</div>
      <div class="difficulty" role="radiogroup" aria-label={strings.graphics}>
        {(["low", "high"] as Quality[]).map((q) => (
          <button
            key={q}
            role="radio"
            aria-checked={s.quality === q}
            class={s.quality === q ? "active" : ""}
            onClick={() => updateSettings({ quality: q })}
          >
            {strings.quality[q]}
          </button>
        ))}
      </div>
      <p class="hint">
        {strings.qualityHint}
        {s.quality !== startQuality && (
          <button class="inline" onClick={() => location.reload()}>
            {strings.restartNow}
          </button>
        )}
      </p>

      <div class="label">{strings.keys}</div>
      <p class="hint">{strings.keysHint}</p>
      <div class="keys">
        {KEY_ACTIONS.map((action) => (
          <div key={action} class="key-row">
            <span>{strings.keyActions[action] ?? action}</span>
            <button
              class={`key ${capturing === action ? "active" : ""} ${conflicts.has(action) ? "conflict" : ""}`}
              title={conflicts.has(action) ? strings.keyConflict : ""}
              aria-label={`${strings.keyActions[action] ?? action}: ${keyLabel(action)}`}
              onClick={() => setCapturing(capturing === action ? null : action)}
            >
              {capturing === action ? strings.pressKey : keyLabel(action)}
            </button>
          </div>
        ))}
      </div>
      <div class="menu-row">
        <button onClick={() => updateSettings({ keys: {} })}>{strings.resetKeys}</button>
        <button class="primary" onClick={onBack}>
          {strings.back}
        </button>
      </div>
    </div>
  );
}

function Volume(props: { label: string; value: number; onInput: (v: number) => void }) {
  return (
    <label class="slider">
      <span class="label">
        {props.label} <strong>{props.value}%</strong>
      </span>
      <input
        type="range"
        aria-label={props.label}
        min={0}
        max={100}
        value={props.value}
        onInput={(e) => props.onInput(Number(e.currentTarget.value))}
      />
    </label>
  );
}
