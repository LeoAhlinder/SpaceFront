import { expect, test } from "@playwright/test";

/** One-off check: frame rate after a minute of a running match (not part of CI). */
test("frame rate during a running match", async ({ page }) => {
  test.skip(!process.env["SF_FPS"], "set SF_FPS=1 to run");
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator(".view-bar")).toContainText("Earth");
  await page.waitForTimeout(60_000);
  for (const view of ["Earth", "System"]) {
    if (view === "System") await page.keyboard.press("m");
    const fps = await page.evaluate(
      () =>
        new Promise<{ fps: number; worst: number }>((resolve) => {
          let n = 0;
          const t0 = performance.now();
          let last = t0;
          let worst = 0;
          const f = (now: number) => {
            worst = Math.max(worst, now - last);
            last = now;
            n++;
            if (now - t0 < 3000) requestAnimationFrame(f);
            else resolve({ fps: n / ((now - t0) / 1000), worst });
          };
          requestAnimationFrame(f);
        }),
    );
    console.log(`${view} view: ${fps.fps.toFixed(1)} fps, worst frame ${fps.worst.toFixed(1)} ms`);
  }
});
