import { settings } from "../settings";

/**
 * Every keyboard shortcut in one table (CODING_STANDARDS.md §5), so they can
 * be shown in the UI and remapped in the settings. Values are KeyboardEvent.key.
 */
export const DEFAULT_KEYMAP = {
  cancel: "Escape",
  toggleSystemView: "m",
  buildSpaceport: "b",
  buildHabitat: "h",
  launchLander: "l",
  launchSunBase: "u",
  buildSolarSiphon: "s",
  buildShield: "g",
  buildOrbitalDefense: "o",
  buildLaunchSilo: "n",
  launchWarship: "w",
  nextWarship: "p",
  fireKinetic: "k",
  fireAntimatter: "x",
  pause: " ",
  quickSave: "F5",
} as const;

export type KeyAction = keyof typeof DEFAULT_KEYMAP;

export const KEY_ACTIONS = Object.keys(DEFAULT_KEYMAP) as KeyAction[];

/** The key bound to an action now (the player's remap, or the default). */
export function keyFor(action: KeyAction): string {
  return settings.value.keys[action] ?? DEFAULT_KEYMAP[action];
}

/** The key as shown in buttons, e.g. "M" or "Esc". */
export function keyLabel(action: KeyAction): string {
  const key = keyFor(action);
  if (key === "Escape") return "Esc";
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key;
}

/** Actions that share a key with another action (shown as a warning in the settings). */
export function conflictingActions(): Set<KeyAction> {
  const byKey = new Map<string, KeyAction[]>();
  for (const action of KEY_ACTIONS) {
    const key = keyFor(action).toLowerCase();
    byKey.set(key, [...(byKey.get(key) ?? []), action]);
  }
  const out = new Set<KeyAction>();
  for (const actions of byKey.values()) if (actions.length > 1) actions.forEach((a) => out.add(a));
  return out;
}

/**
 * Calls `handlers[action]` for keys in the keymap (ignores typing in inputs,
 * and every key while `isCapturing()` says a key is being remapped).
 */
export function attachKeys(
  handlers: Record<KeyAction, () => void>,
  isCapturing: () => boolean = () => false,
): void {
  window.addEventListener("keydown", (e) => {
    if (isCapturing()) return;
    if (e.target instanceof HTMLInputElement && e.target.type !== "range") return;
    const pressed = e.key.toLowerCase();
    for (const action of KEY_ACTIONS) {
      if (pressed === keyFor(action).toLowerCase()) {
        handlers[action]();
        e.preventDefault();
        return;
      }
    }
  });
}
