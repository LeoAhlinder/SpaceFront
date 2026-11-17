# SpaceFront on Steam

How the desktop build gets Steam features. Everything is prepared except what needs a **Steamworks partner account and an app id**, which only the game's owner can set up. Nothing Steam-related is installed yet.

## What is already in place

| Piece                       | Where                                                                                        | State                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `Platform` interface        | `src/client/platform/platform.ts`                                                            | `unlockAchievement(id)` and `cloudSaves` on every platform                |
| Web platform                | `src/client/platform/webPlatform.ts`                                                         | IndexedDB saves; achievements are a no-op                                 |
| Desktop platform            | `src/client/platform/desktopPlatform.ts` + `desktop/preload.cjs`                             | File-system saves; achievements go to the main process                    |
| Steam module                | `desktop/steam.cjs`                                                                          | No-op until steamworks.js is installed and an app id is set (see below)   |
| Achievements                | `src/client/achievements.ts` (ids and when they unlock), `strings.achievements` (names/text) | Nine achievements, unlocked through the platform; never during replays    |
| Save folder for Steam Cloud | `desktop/main.cjs`: `<user data>/files/saves` and `…/files/replays`                          | Plain files, written atomically (temp file + rename), so Auto-Cloud works |

## Steps to wire up Steam (for the owner)

1. **Partner account and app.** Sign up at partner.steamgames.com, pay the app fee, and create the app. Note its **app id**.
2. **Install steamworks.js** in the desktop app (it ships prebuilt native modules for Windows, macOS and Linux):

   ```bash
   cd desktop
   npm install --save-exact steamworks.js
   ```

   Add `"node_modules/steamworks.js/**/*"` to `build.files` and `"node_modules/steamworks.js/dist/**/*.node"` to `build.asarUnpack` in `desktop/package.json`, so the native module ships unpacked.

3. **App id at runtime.** `desktop/steam.cjs` reads `SPACEFRONT_STEAM_APP_ID`. For a release, replace `appId()` with the fixed id. For local testing, put a `steam_appid.txt` with the id next to the executable (or run with the environment variable) and start Steam first.
4. **Overlay.** `steam.cjs` already calls `steamworks.electronEnableSteamOverlay()` after `init`. If the overlay doesn't draw, add `app.commandLine.appendSwitch("in-process-gpu")` and `app.commandLine.appendSwitch("disable-direct-composition")` in `main.cjs` before `app.whenReady()` (a known Electron + Steam overlay requirement on Windows).
5. **Achievements.** In the partner site (Stats & Achievements), create one achievement per id in `ACHIEVEMENT_IDS` (`src/client/achievements.ts`), with the **API name** equal to the id (e.g. `FIRST_SPACEPORT`) and the name and description from `strings.achievements`. Upload icons (the sprites in `assets/sprites/` are a good start). `steam.cjs` calls `client.achievement.activate(id)`.
6. **Steam Cloud.** Use **Auto-Cloud** (no code needed): in the partner site, add root paths for the save folder:
   - Windows: `WinAppDataRoaming`, subdirectory `SpaceFront/files`, pattern `*`, recursive
   - macOS: `MacAppSupport`, subdirectory `SpaceFront/files`
   - Linux: `LinuxXdgDataHome` is not used by Electron; use the `LinuxHome` root with `.config/SpaceFront/files`

   (`app.getPath("userData")` is `%APPDATA%/SpaceFront` on Windows, `~/Library/Application Support/SpaceFront` on macOS and `~/.config/SpaceFront` on Linux.) Set a byte and file quota (saves are a few MB at most; replays a few KB). `steam.cjs` reports `cloudSaves: true` once Steam is running.

7. **Depots and builds.** Build with `npm run desktop:win` (and the macOS/Linux scripts on those systems). Upload the unpacked folders (`desktop/release/win-unpacked`, `mac`, `linux-unpacked`) as depots with SteamPipe (`steamcmd` + an app build script). The NSIS installer and AppImage are for distributing outside Steam.
8. **Code signing.** Windows and macOS builds should be signed (an Authenticode certificate; an Apple Developer ID plus notarization) to avoid security warnings. electron-builder reads the certificates from `CSC_LINK` / `CSC_KEY_PASSWORD` (Windows) and `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` (macOS).

## Not done on purpose

- No Steam account, app, or installed steamworks.js: these need the owner's partner account.
- No rich presence, workshop or leaderboards yet; `Platform` is the place to add them (with a no-op on the web).
