# SpaceFront desktop app

An Electron wrapper around the web build, with saves as files and hooks for Steam ([docs/STEAM.md](../docs/STEAM.md)).

| File                     | What it does                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `main.cjs`               | Main process: serves `web/` as `app://spacefront/`, opens the window, reads and writes save files in the user folder |
| `preload.cjs`            | Exposes `window.spacefrontDesktop` (the `DesktopBridge` in `src/client/platform/desktopPlatform.ts`) to the game     |
| `steam.cjs`              | Steam achievements and cloud status; a no-op until steamworks.js and an app id are set up                            |
| `scripts/copy-web.mjs`   | Copies the root `dist/` build into `web/`                                                                            |
| `build/icon.png`         | App icon, drawn by `npm run icon` (root)                                                                             |
| `package.json` → `build` | electron-builder settings for Windows (folder + NSIS installer), macOS (folder + dmg) and Linux (folder + AppImage)  |

## Setup (once)

Electron and electron-builder are not installed yet: they download large binaries (the Electron runtime is about 100 MB per platform, electron-builder fetches its packaging tools on the first build). Install them in this folder:

```bash
cd desktop
npm install --save-dev --save-exact electron electron-builder
```

## Run and build

From the project root:

```bash
npm run desktop
```

```bash
npm run desktop:win
```

The Windows build lands in `desktop/release/` (`win-unpacked/` for Steam depots, an NSIS installer for direct downloads). macOS and Linux builds use `npm --prefix desktop run dist:mac` / `dist:linux` and must run on those systems (macOS builds need a Mac for signing and notarization).

## Saves

Saves and replays are files under the user data folder: `%APPDATA%\SpaceFront\files` on Windows, `~/Library/Application Support/SpaceFront/files` on macOS, `~/.config/SpaceFront/files` on Linux. Settings stay in the app's local storage.
