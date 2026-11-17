import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

/** Fails the test on any page error or console error. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

/**
 * Smoke test: load the game, pick a difficulty, start a match, spawn on
 * Earth, see territory, open diplomacy with a nation from the leaderboard,
 * and switch to the solar-system view. No console errors along the way.
 */
test("start a match, spawn, open diplomacy and the system view", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("radio", { name: "Easy" }).click();
  await expect(page.getByRole("radio", { name: "Easy" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".view-bar")).toContainText("Earth");

  // The middle of the Earth map is West Africa: land.
  const canvas = page.locator("#game canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.locator(".stats")).not.toContainText("0 · 0.0%", { timeout: 5_000 });

  // A nation on the leaderboard opens its diplomacy panel.
  const nation = page
    .locator(".leaderboard li")
    .filter({ hasNotText: /^Bot|You/ })
    .first();
  await expect(nation).toBeVisible({ timeout: 10_000 });
  await nation.click();
  await expect(page.locator(".diplomacy")).toBeVisible();
  await expect(page.locator(".diplomacy")).toContainText(/Ask to ally|Break alliance|Accept/);

  await page.keyboard.press("m");
  await expect(page.locator(".view-bar")).toContainText("Solar System");

  expect(errors).toEqual([]);
});

/**
 * Menus: remap a key in the settings, start the tutorial, see its first
 * steps advance, then open the in-game menu (which pauses) and quit.
 */
test("settings, tutorial and the in-game menu", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "System view: M" }).click();
  await expect(page.getByRole("button", { name: "System view: M" })).toHaveText("Press a key…");
  await page.keyboard.press("v");
  await expect(page.getByRole("button", { name: "System view: V" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByRole("button", { name: "Tutorial" }).click();
  const tutorial = page.locator(".tutorial");
  await expect(tutorial).toContainText("Welcome to SpaceFront");
  await tutorial.getByRole("button", { name: "Next" }).click();
  await expect(tutorial).toContainText("Pick your start");

  const canvas = page.locator("#game canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(tutorial).toContainText("Expand", { timeout: 5_000 });

  // The remapped key opens the system view; the menu button text shows the key.
  await page.keyboard.press("v");
  await expect(page.locator(".view-bar")).toContainText("Solar System");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("button", { name: "Quit to menu" }).click();
  await expect(page.getByRole("button", { name: "Tutorial" })).toBeVisible();

  expect(errors).toEqual([]);
});
