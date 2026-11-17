import { useEffect, useState } from "preact/hooks";
import type { Actions } from "../actions";
import { DIFFICULTIES } from "../../data/difficulty";
import type { EntryKind, SavedEntry } from "../saves";
import { ui } from "../store/clientStore";
import { strings } from "./strings";

/** Game time as m:ss (10 ticks a second). */
function playTime(tick: number): string {
  const seconds = Math.floor(tick / 10);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Saved games ("Load game") or replays: newest first, each with load/watch and delete. */
export function SavesScreen({ actions, kind }: { actions: Actions; kind: EntryKind }) {
  const [entries, setEntries] = useState<SavedEntry[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const refresh = () => {
    actions.library
      .list(kind)
      .then(setEntries)
      .catch((error: unknown) => setFailed(String(error)));
  };
  useEffect(refresh, [kind]);

  const open = (entry: SavedEntry) => {
    const job = kind === "save" ? actions.loadGame(entry) : actions.watchReplay(entry);
    job.catch((error: unknown) => setFailed(String(error)));
  };
  const remove = (entry: SavedEntry) => {
    actions.library
      .remove(entry)
      .then(refresh)
      .catch((error: unknown) => setFailed(String(error)));
  };

  return (
    <div class="menu panel wide">
      <h1>{kind === "save" ? strings.loadGame : strings.replays}</h1>
      {failed && <p class="hint error-text">{failed}</p>}
      {entries === null ? (
        <p class="hint">{strings.loading}</p>
      ) : entries.length === 0 ? (
        <p class="hint">{kind === "save" ? strings.noSaves : strings.noReplays}</p>
      ) : (
        <ul class="entries" aria-label={kind === "save" ? strings.loadGame : strings.replays}>
          {entries.map((e) => (
            <li key={e.id} class="entry">
              <div class="entry-text">
                <strong>
                  {e.quick ? `${strings.quickSave} · ` : ""}
                  {new Date(e.savedAt).toLocaleString()}
                </strong>
                <span class="hint">
                  {e.summary.tutorial
                    ? strings.tutorial
                    : strings.entryInfo(
                        DIFFICULTIES[e.summary.difficulty].name,
                        playTime(e.summary.tick),
                        e.summary.landPct,
                      )}
                </span>
              </div>
              <button class="primary" onClick={() => open(e)}>
                {kind === "save" ? strings.load : strings.watch}
              </button>
              <button onClick={() => remove(e)}>{strings.delete}</button>
            </li>
          ))}
        </ul>
      )}
      <div class="menu-row">
        <button onClick={() => (ui.screen.value = "main")}>{strings.back}</button>
      </div>
    </div>
  );
}
