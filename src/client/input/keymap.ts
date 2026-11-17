/**
 * Every keyboard shortcut in one table (CODING_STANDARDS.md §5), so they can
 * be shown in the UI and remapped later. Values are KeyboardEvent.key.
 */
export const KEYMAP = {
  cancel: "Escape",
  toggleSystemView: "m",
  buildSpaceport: "b",
  launchLander: "l",
} as const;

export type KeyAction = keyof typeof KEYMAP;

/** Calls `handlers[action]` for keys in the keymap (ignores typing in inputs). */
export function attachKeys(handlers: Record<KeyAction, () => void>): void {
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== "range") return;
    for (const [action, key] of Object.entries(KEYMAP) as [KeyAction, string][]) {
      if (e.key.toLowerCase() === key.toLowerCase()) {
        handlers[action]();
        e.preventDefault();
        return;
      }
    }
  });
}
