import type { FileInfo, Platform } from "./platform";

/**
 * What the Electron preload script (desktop/preload.cjs) exposes as
 * `window.spacefrontDesktop`. Files go to the user's data folder through the
 * main process; Steam features go through `steam`, which is a no-op until
 * steamworks.js is wired in (docs/STEAM.md).
 */
export interface DesktopBridge {
  readonly version: string;
  saveFile(name: string, data: Uint8Array): Promise<void>;
  loadFile(name: string): Promise<Uint8Array | null>;
  listFiles(prefix: string): Promise<FileInfo[]>;
  deleteFile(name: string): Promise<void>;
  readonly steam: {
    /** True once steamworks.js is initialized with the game's app id. */
    readonly available: boolean;
    /** True if Steam Cloud syncs the save folder. */
    readonly cloudSaves: boolean;
    unlockAchievement(id: string): void;
  };
}

function bridge(): DesktopBridge | undefined {
  return (window as unknown as { spacefrontDesktop?: DesktopBridge }).spacefrontDesktop;
}

export function hasDesktopBridge(): boolean {
  return typeof window !== "undefined" && bridge() !== undefined;
}

/** The desktop platform: file-system saves and Steam, through the preload bridge. */
export function createDesktopPlatform(): Platform {
  const desktop = bridge();
  if (!desktop) throw new Error("Not running in the desktop app");
  return {
    kind: "desktop",
    cloudSaves: desktop.steam.cloudSaves,
    saveFile: (name, data) => desktop.saveFile(name, data),
    loadFile: (name) => desktop.loadFile(name),
    listFiles: (prefix) => desktop.listFiles(prefix),
    deleteFile: (name) => desktop.deleteFile(name),
    unlockAchievement: (id) => desktop.steam.unlockAchievement(id),
  };
}
