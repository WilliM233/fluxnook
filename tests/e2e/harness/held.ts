import type { Locator, Page } from "@playwright/test";
import { expect } from "./signed-in";

// The shared pieces of a sheet's hold tests (Ch 1.8 A1, A5). `search.spec.ts` and
// `search-comics.spec.ts` own their rows, so their two sheets' tests live there
// and reach these from beside `sheet-hold.spec.ts`.

type Url = string | RegExp;

/**
 * A write held until told: the route counts what it sees of one method, says
 * when the first has arrived, and lets it through on `release`.
 */
export async function heldWrite(page: Page, method: string, url: Url) {
  const gate = Promise.withResolvers<void>();
  const arrived = Promise.withResolvers<void>();
  let seen = 0;
  await page.route(url, async (route) => {
    if (route.request().method() !== method) return route.continue();
    seen += 1;
    arrived.resolve();
    await gate.promise;
    await route.continue();
  });
  return {
    arrival: arrived.promise,
    release: () => gate.resolve(),
    seen: () => seen,
  };
}

/** The write lands and its answer is lost: "no answer" isn't "no write". */
export async function lostAnswer(page: Page, method: string, url: Url) {
  await page.route(url, async (route) => {
    if (route.request().method() !== method) return route.continue();
    await route.fetch();
    await route.abort();
  });
}

/**
 * Every door out, while a write is out: Cancel is disabled, and Escape, the
 * overlay and the × leave the sheet where it is. Each is soft, so a red names
 * every door that opened; past a closed sheet there's nothing left to click.
 */
export async function expectHeld(page: Page, sheet: Locator) {
  await expect
    .soft(sheet.getByRole("button", { name: "Cancel" }).last(), "Cancel")
    .toBeDisabled();
  const doors: [string, () => Promise<void>][] = [
    ["Escape", () => page.keyboard.press("Escape")],
    ["the overlay", () => page.mouse.click(5, 5)],
    ["the ×", () => sheet.getByRole("button", { name: "Close" }).click()],
  ];
  for (const [door, leave] of doors) {
    if (!(await sheet.isVisible())) return;
    await leave();
    // A hold's proof is a sheet still there a moment later.
    await page.waitForTimeout(150);
    await expect.soft(sheet, door).toBeVisible();
  }
}

/** Clicks until the sheet shows: a click before hydration has no handler. */
export async function opens(page: Page, button: Locator) {
  await expect(async () => {
    await button.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass();
}
