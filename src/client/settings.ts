import { signal } from "@preact/signals";
import type { KeyAction } from "./input/keymap";
import { log } from "../shared/log";

/** Graphics quality: "low" draws fewer stars and effects at a lower resolution. */
export type Quality = "low" | "high";

export interface Settings {
  /** 0–100 each. */
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly quality: Quality;
  /** Remapped keys (KeyboardEvent.key); actions not listed use the default. */
  readonly keys: Partial<Record<KeyAction, string>>;
  /** True once the player has finished or skipped the tutorial. */
  readonly tutorialSeen: boolean;
}

const STORAGE_KEY = "spacefront.settings.v1";

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 70,
  musicVolume: 50,
  sfxVolume: 80,
  quality: "high",
  keys: {},
  tutorialSeen: false,
};

/**
 * The player's settings, kept in localStorage (a per-device convenience:
 * it can be empty or blocked, and the game then runs on defaults).
 */
export const settings = signal<Settings>(loadSettings());

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return sanitize(JSON.parse(raw) as unknown);
  } catch (error) {
    log.warn("Settings could not be read; using defaults", error);
    return DEFAULT_SETTINGS;
  }
}

/** Changes some settings and stores them. */
export function updateSettings(change: Partial<Settings>): void {
  settings.value = { ...settings.value, ...change };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
  } catch (error) {
    log.warn("Settings could not be saved", error);
  }
}

/** Keeps only known, well-typed fields of stored settings. */
function sanitize(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_SETTINGS;
  const r = raw as Record<string, unknown>;
  const pct = (v: unknown, d: number) =>
    typeof v === "number" && v >= 0 && v <= 100 ? Math.round(v) : d;
  const keys: Partial<Record<KeyAction, string>> = {};
  if (typeof r["keys"] === "object" && r["keys"] !== null) {
    for (const [action, key] of Object.entries(r["keys"])) {
      // Unknown actions are kept but ignored by the keymap.
      if (typeof key === "string" && key.length > 0) {
        keys[action as KeyAction] = key;
      }
    }
  }
  return {
    masterVolume: pct(r["masterVolume"], DEFAULT_SETTINGS.masterVolume),
    musicVolume: pct(r["musicVolume"], DEFAULT_SETTINGS.musicVolume),
    sfxVolume: pct(r["sfxVolume"], DEFAULT_SETTINGS.sfxVolume),
    quality: r["quality"] === "low" ? "low" : "high",
    keys,
    tutorialSeen: r["tutorialSeen"] === true,
  };
}
