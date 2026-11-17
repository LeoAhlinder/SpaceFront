import { effect } from "@preact/signals";
import type { WorkerMessage } from "../shared/messages";
import type { Platform } from "./platform/platform";
import { settings } from "./settings";
import { ui, view } from "./store/clientStore";

/**
 * Achievement ids. They are the API names to create in the Steamworks
 * partner site (docs/STEAM.md); names and descriptions for the store page
 * are in strings.achievements.
 */
export const ACHIEVEMENT_IDS = [
  "TUTORIAL_DONE",
  "FIRST_SPACEPORT",
  "TWO_WORLDS",
  "SUN_BASE",
  "SOLAR_SIPHON",
  "WARHEAD",
  "VICTORY",
  "VICTORY_HARD",
  "VICTORY_IMPOSSIBLE",
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

/**
 * Watches the match and unlocks achievements through the Platform (Steam on
 * desktop; nothing in the browser). Replays never unlock anything.
 */
export function createAchievementTracker(platform: Platform): (message: WorkerMessage) => void {
  const unlocked = new Set<AchievementId>();
  const unlock = (id: AchievementId) => {
    if (unlocked.has(id)) return;
    unlocked.add(id);
    platform.unlockAchievement(id);
  };

  effect(() => {
    if (settings.value.tutorialSeen && ui.tutorialStep.value === null) unlock("TUTORIAL_DONE");
  });

  return (message) => {
    if (message.type !== "tick" || view.replay || !view.init) return;
    const me = view.init.playerId;
    const delta = message.delta;
    for (const s of delta.structures) {
      if (s.owner !== me || s.destroyed) continue;
      if (s.kind === "spaceport" && s.buildTicksLeft === 0) unlock("FIRST_SPACEPORT");
      if (s.kind === "sunBase") unlock("SUN_BASE");
      if (s.kind === "solarSiphon") unlock("SOLAR_SIPHON");
    }
    for (const ship of delta.shipsLaunched) {
      if (ship.owner === me && ship.kind === "antimatterWarhead") unlock("WARHEAD");
    }
    if (delta.tick % 50 === 0) {
      let worlds = 0;
      for (let g = 0; g < view.init.grids.length; g++) {
        if ((view.ownerCounts[g]?.get(me) ?? 0) > 0) worlds++;
      }
      if (worlds >= 2) unlock("TWO_WORLDS");
    }
    if (delta.winner === me) {
      unlock("VICTORY");
      if (view.init.difficulty === "hard" || view.init.difficulty === "impossible") {
        unlock("VICTORY_HARD");
      }
      if (view.init.difficulty === "impossible") unlock("VICTORY_IMPOSSIBLE");
    }
  };
}
