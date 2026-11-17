import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { TerrainMap } from "../src/core";
import { loadTerrainMap, runTick, saveWorld } from "../src/core";
import { LANDABLE_BODIES } from "../src/data/bodies";
import { buildMatch } from "../src/worker/match";

/**
 * One-off performance check (not part of CI): `SF_FPS=1 npm run e2e -- fps`.
 *
 * Builds a late-game save in Node (an Impossible match after SF_TICKS ticks,
 * default 6,000 = 10 minutes: thousands of structures, many ships), loads it
 * in the browser with the CPU slowed down SF_THROTTLE times (default 4, about
 * a low-end laptop), and reports frame rate, worst frame and the renderer's
 * own CPU time per frame in the planet and system views. SF_QUALITY=low uses
 * the low graphics setting; SF_PROFILE=1 prints where the CPU time goes.
 */
test("frame rate in a late-game match on a slow CPU", async ({ page }) => {
  test.skip(!process.env["SF_FPS"], "set SF_FPS=1 to run");
  test.setTimeout(300_000);
  const ticks = Number(process.env["SF_TICKS"] ?? 6_000);
  const throttle = Number(process.env["SF_THROTTLE"] ?? 4);

  const save = lateGameSave(ticks);
  console.log(`save: ${(save.length / 1e6).toFixed(1)} MB raw at tick ${ticks}`);

  await page.goto("/");
  // Put the save where the game's web platform keeps files (IndexedDB), then load it.
  await page.evaluate(async (base64) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("spacefront", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("files");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("no IndexedDB"));
    });
    const tx = db.transaction("files", "readwrite");
    const store = tx.objectStore("files");
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const summary = { tick: 0, difficulty: "impossible", tutorial: false, landPct: 0 };
    const entry = { id: "perf", kind: "save", savedAt: 1, summary, quick: false };
    store.put({ data, modified: 1 }, "saves/perf.bin");
    store.put(
      { data: new TextEncoder().encode(JSON.stringify(entry)), modified: 1 },
      "saves/perf.json",
    );
    await new Promise((resolve) => (tx.oncomplete = resolve));
  }, Buffer.from(save).toString("base64"));

  if (process.env["SF_QUALITY"] === "low") {
    await page.evaluate(() =>
      localStorage.setItem("spacefront.settings.v1", JSON.stringify({ quality: "low" })),
    );
    await page.reload();
  }

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });

  await page.getByRole("button", { name: "Load game" }).click();
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.locator(".view-bar")).toContainText("Earth", { timeout: 60_000 });
  await page.waitForTimeout(5_000);
  const counts = await page.evaluate(() => {
    const v = (
      window as unknown as {
        spacefront: {
          view: {
            ships: Map<number, unknown>;
            structures: Map<number, unknown>;
            warships: Map<number, unknown>;
            effects: unknown[];
          };
        };
      }
    ).spacefront.view;
    return `${v.ships.size} ships, ${v.structures.size} structures, ${v.warships.size} warships, ${v.effects.length} effects`;
  });
  console.log(`on screen: ${counts}`);

  for (const view of ["Earth", "System"]) {
    if (view === "System") {
      await page.keyboard.press("m");
      await page.waitForTimeout(2_000);
    }
    const r = await page.evaluate(
      () =>
        new Promise<{ fps: number; worst: number; renderMs: number; renderWorst: number }>(
          (resolve) => {
            const stats = (
              window as unknown as {
                spacefront: {
                  renderer: { frameStats: { frames: number; totalMs: number; worstMs: number } };
                };
              }
            ).spacefront.renderer.frameStats;
            stats.frames = 0;
            stats.totalMs = 0;
            stats.worstMs = 0;
            let n = 0;
            const t0 = performance.now();
            let last = t0;
            let worst = 0;
            const f = (now: number) => {
              worst = Math.max(worst, now - last);
              last = now;
              n++;
              if (now - t0 < 5000) requestAnimationFrame(f);
              else {
                resolve({
                  fps: n / ((now - t0) / 1000),
                  worst,
                  renderMs: stats.totalMs / Math.max(1, stats.frames),
                  renderWorst: stats.worstMs,
                });
              }
            };
            requestAnimationFrame(f);
          },
        ),
    );
    if (process.env["SF_PROFILE"]) {
      // Self time per function over 3 seconds: where the frame goes.
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.start");
      await page.waitForTimeout(3_000);
      const { profile } = await cdp.send("Profiler.stop");
      const self = new Map<string, number>();
      const dt = profile.timeDeltas ?? [];
      const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      (profile.samples ?? []).forEach((id, i) => {
        const n = byId.get(id)!;
        const key = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`;
        self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0));
      });
      const total = [...self.values()].reduce((a, b) => a + b, 0);
      const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
      for (const [k, v] of top) console.log(`  ${((v / total) * 100).toFixed(1)}%  ${k}`);
      // The same by source file: our modules vs Pixi vs Preact.
      const byFile = new Map<string, number>();
      for (const [k, v] of self) {
        const file = (k.split(" ").pop() ?? "")
          .split(":")[0]!
          .split("?")[0]!
          .replace(/-[\w]{8}\.js$/, ".js");
        byFile.set(file, (byFile.get(file) ?? 0) + v);
      }
      const files = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
      console.log(
        `  by file: ${files.map(([f, v]) => `${f || "(native)"} ${((v / total) * 100).toFixed(1)}%`).join(", ")}`,
      );
    }
    console.log(
      `${view} view (CPU ×${throttle}): ${r.fps.toFixed(1)} fps, worst frame ${r.worst.toFixed(1)} ms, ` +
        `renderer ${r.renderMs.toFixed(2)} ms avg / ${r.renderWorst.toFixed(1)} ms worst per frame`,
    );
  }
});

function lateGameSave(ticks: number): Uint8Array {
  const root = new URL("../", import.meta.url);
  const maps = new Map<string, TerrainMap>(
    LANDABLE_BODIES.map((b) => {
      const dir = new URL(`public/maps/${b.map!.mapId}/`, root);
      const map = loadTerrainMap(
        new Uint8Array(readFileSync(new URL("terrain.bin", dir))),
        JSON.parse(readFileSync(new URL("regions.json", dir), "utf8")),
      );
      return [map.id, map];
    }),
  );
  const setup = {
    seed: 2026,
    mapId: "sol",
    botCount: 40,
    playerName: "You",
    difficulty: "impossible",
  } as const;
  const match = buildMatch(setup, maps);
  for (let t = 0; t < ticks; t++) runTick(match.world);
  return saveWorld(match.world, {
    kind: "spacefront-save",
    playerId: match.playerId,
    setup,
    commands: [],
  });
}
