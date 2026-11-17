import { createDesktopPlatform, hasDesktopBridge } from "./desktopPlatform";
import { createWebPlatform } from "./webPlatform";

/** A stored file's name, size and when it was last written (ms since 1970). */
export interface FileInfo {
  readonly name: string;
  readonly size: number;
  readonly modified: number;
}

/**
 * Everything that differs between the browser and the desktop (Steam) build
 * (ARCHITECTURE.md §9). The game only talks to storage, achievements and
 * cloud saves through this, so the Electron build swaps one module.
 *
 * File names are relative paths with forward slashes ("saves/123.bin").
 */
export interface Platform {
  readonly kind: "web" | "desktop";
  saveFile(name: string, data: Uint8Array): Promise<void>;
  /** The file's bytes, or null if there is no such file. */
  loadFile(name: string): Promise<Uint8Array | null>;
  /** Files whose names start with `prefix`. */
  listFiles(prefix: string): Promise<FileInfo[]>;
  deleteFile(name: string): Promise<void>;
  /** Unlocks an achievement (no-op where there are none, e.g. the browser). */
  unlockAchievement(id: string): void;
  /**
   * Cloud saves (Steam Cloud on desktop): whether they're on. Files written
   * through saveFile are synced by the platform when this is true.
   */
  readonly cloudSaves: boolean;
}

/** The platform the game runs on: the desktop bridge if Electron provides one, else the web. */
export function createPlatform(): Platform {
  return hasDesktopBridge() ? createDesktopPlatform() : createWebPlatform();
}
