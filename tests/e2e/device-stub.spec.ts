import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "../../src/db/schema";

// The stub is a page with no server: PGlite in the browser, on IndexedDB. A
// fresh Playwright context is an empty store, so no test here reads another's
// shelves and nothing has to be reset.
test.use({ baseURL: "http://localhost:4173" });

// Both of the device's WebViews are Chromium (A7), and Nightly's Firefox and
// WebKit would otherwise gate a Volume close on browsers no device runs.
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "The device's WebViews are Chromium; no device runs this page in another.",
);

// Computed, so a later chapter's migration doesn't redden this Signature's
// tests. The literal 14 and 22 live in scripts/browse/2.1.1.sh.
const migrationCount = (
  JSON.parse(
    readFileSync("supabase/migrations/meta/_journal.json", "utf8"),
  ) as { entries: unknown[] }
).entries.length;
const tableCount = Object.values(schema as Record<string, unknown>).filter(
  (value) => is(value, PgTable),
).length;
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};

const COUNTS = `${migrationCount} migrations · ${tableCount} tables`;

// A first open starts Postgres and applies every migration. The test's own
// timeout has to outlast the wait, or it cuts the wait short.
const OPEN = { timeout: 60_000 };
test.setTimeout(90_000);

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByText(COUNTS)).toBeVisible(OPEN);
}

const field = (page: Page) => page.getByLabel("Shelf name");
const listed = (page: Page) =>
  page.getByRole("list", { name: "Shelves" }).getByRole("listitem");

test("the stub prints the counts, the version and an empty list on Deep Field", async ({
  page,
}) => {
  await open(page);

  await expect(page.getByText(version, { exact: true })).toBeVisible();
  await expect(field(page)).toBeEnabled();
  await expect(page.getByRole("button", { name: "Add" })).toBeEnabled();
  await expect(listed(page)).toHaveCount(0);
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(14, 11, 23)",
  );
});

test("add a shelf, reload, it is still there", async ({ page }) => {
  await open(page);

  await field(page).fill("King");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(listed(page)).toHaveText(["King"]);

  // Straight after the row shows: an add's answer means the write has flushed.
  await page.reload();
  await expect(page.getByText(COUNTS)).toBeVisible(OPEN);
  await expect(listed(page)).toHaveText(["King"]);
});

test("two quick Enters on one name make one shelf", async ({ page }) => {
  await open(page);
  await field(page).fill("King");

  // Two submits in one task: nothing has rendered between them, so a held
  // field can't be what stops the second. A key press can't arrive this fast.
  await page.evaluate(() => {
    const form = document.querySelector("form");
    form?.requestSubmit();
    form?.requestSubmit();
  });

  await expect(listed(page)).toHaveText(["King"]);
  await expect(field(page)).toBeEnabled();
  await expect(field(page)).toHaveValue("");

  // The first add's row satisfies a read straight away, and a reload then kills
  // a second add before it commits, so neither can witness one. PGlite runs
  // queries in order: once a later add shows, any doubled King has landed.
  await field(page).fill("Bach");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(listed(page)).toHaveText(["Bach", "King"]);

  await page.reload();
  await expect(page.getByText(COUNTS)).toBeVisible(OPEN);
  await expect(listed(page)).toHaveText(["Bach", "King"]);
});

test("a blank name says so and lists nothing", async ({ page }) => {
  await open(page);

  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByRole("alert")).toHaveText("Give the shelf a name.");
  await expect(listed(page)).toHaveCount(0);
});

test("a failed open prints in words, with no field to type in", async ({
  page,
}) => {
  await page.route("**/*.wasm", (route) => route.abort());

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText(
    "Fluxnook couldn't open its database",
    OPEN,
  );
  await expect(field(page)).toHaveCount(0);
  await expect(page.getByText(COUNTS)).toHaveCount(0);
});
