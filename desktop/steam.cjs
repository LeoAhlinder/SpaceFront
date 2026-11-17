// Steam hooks for the desktop app. A no-op until steamworks.js is installed
// and the game has a Steam app id: docs/STEAM.md says how to wire it in.
// Everything Steam-related goes through this one module.
"use strict";

/** The Steam app id, from the environment (SPACEFRONT_STEAM_APP_ID) or null. */
function appId() {
  const id = Number(process.env.SPACEFRONT_STEAM_APP_ID);
  return Number.isInteger(id) && id > 0 ? id : null;
}

let client = null;

module.exports = {
  /** Connects to Steam if steamworks.js is present and an app id is set. */
  init() {
    if (appId() === null) return;
    try {
      // Not a dependency yet: installed when the Steam build is set up (docs/STEAM.md).
      const steamworks = require("steamworks.js");
      client = steamworks.init(appId());
      steamworks.electronEnableSteamOverlay();
    } catch (error) {
      console.warn("Steam is not available:", error instanceof Error ? error.message : error);
      client = null;
    }
  },

  available() {
    return client !== null;
  },

  /** Steam Auto-Cloud syncs the save folder when it's configured for the app (no code needed). */
  cloudSaves() {
    return client !== null;
  },

  unlockAchievement(id) {
    if (!client) return;
    try {
      client.achievement.activate(id);
    } catch (error) {
      console.warn(`Achievement ${id} failed:`, error instanceof Error ? error.message : error);
    }
  },

  shutdown() {
    client = null;
  },
};
