import type { MatchSummary } from "../shared/messages";
import type { Platform } from "./platform/platform";

export type EntryKind = "save" | "replay";

/** One saved game or replay: its data file plus this small description beside it. */
export interface SavedEntry {
  readonly id: string;
  readonly kind: EntryKind;
  /** When it was stored, ms since 1970. */
  readonly savedAt: number;
  readonly summary: MatchSummary;
  readonly quick: boolean;
}

/** Keep at most this many replays; the oldest go first. */
const MAX_REPLAYS = 30;

const folder = (kind: EntryKind) => (kind === "save" ? "saves/" : "replays/");
const dataFile = (kind: EntryKind, id: string) => `${folder(kind)}${id}.bin`;
const infoFile = (kind: EntryKind, id: string) => `${folder(kind)}${id}.json`;
const QUICK_ID = "quicksave";

/**
 * Saved games and replays, stored as files through the Platform (IndexedDB
 * in the browser, the file system on desktop).
 */
export class SaveLibrary {
  constructor(private readonly platform: Platform) {}

  /** Entries of a kind, newest first. */
  async list(kind: EntryKind): Promise<SavedEntry[]> {
    const files = await this.platform.listFiles(folder(kind));
    const infos = files.filter((f) => f.name.endsWith(".json"));
    const entries = await Promise.all(
      infos.map(async (f) => {
        const bytes = await this.platform.loadFile(f.name);
        if (!bytes) return null;
        try {
          return JSON.parse(new TextDecoder().decode(bytes)) as SavedEntry;
        } catch {
          return null; // a damaged description: skip the entry
        }
      }),
    );
    return entries
      .filter((e): e is SavedEntry => e !== null && e.kind === kind)
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  /** Stores data with its description; a quick save replaces the last quick save. */
  async store(
    kind: EntryKind,
    data: Uint8Array,
    summary: MatchSummary,
    quick = false,
  ): Promise<SavedEntry> {
    const now = Date.now();
    const id = quick ? QUICK_ID : `${now}`;
    const entry: SavedEntry = { id, kind, savedAt: now, summary, quick };
    await this.platform.saveFile(dataFile(kind, id), data);
    await this.platform.saveFile(
      infoFile(kind, id),
      new TextEncoder().encode(JSON.stringify(entry)),
    );
    if (kind === "replay") await this.trimReplays();
    return entry;
  }

  async read(entry: SavedEntry): Promise<Uint8Array> {
    const data = await this.platform.loadFile(dataFile(entry.kind, entry.id));
    if (!data) throw new Error("The file is missing");
    return data;
  }

  async remove(entry: SavedEntry): Promise<void> {
    await this.platform.deleteFile(dataFile(entry.kind, entry.id));
    await this.platform.deleteFile(infoFile(entry.kind, entry.id));
  }

  private async trimReplays(): Promise<void> {
    const replays = await this.list("replay");
    for (const old of replays.slice(MAX_REPLAYS)) await this.remove(old);
  }
}
