import { expect, test } from "@playwright/test";

/**
 * Smoke test: load the game, start a match, spawn on Earth, see territory,
 * and switch to the solar-system view. No console errors along the way.
 */
test("start a match, spawn, and open the system view", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator(".view-bar")).toContainText("Earth");

  // The middle of the Earth map is West Africa: land.
  const canvas = page.locator("#game canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.locator(".stats")).not.toContainText("0 · 0.0%", { timeout: 5_000 });

  await page.keyboard.press("m");
  await expect(page.locator(".view-bar")).toContainText("Solar System");

  expect(errors).toEqual([]);
});
