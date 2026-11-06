import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "../../src/db/schema";

// The Raccoon's list for 2.1.1 (plan section 4b): a flush that fails, a stray
// rejection, a phone's width, fast hands, a second window, a damaged store. Each
// asserts what must hold, not how the Binder holds it.
test.use({ baseURL: "http://localhost:4173" });
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "The device's WebViews are Chromium; no device runs this page in another.",
);

const migrationCount = (
  JSON.parse(
    readFileSync("supabase/migrations/meta/_journal.json", "utf8"),
  ) as { entries: unknown[] }
).entries.length;
const tableCount = Object.values(schema as Record<string, unknown>).filter(
  (value) => is(value, PgTable),
).length;
const COUNTS = `${migrationCount} migrations · ${tableCount} tables`;
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};

const OPEN = { timeout: 60_000 };
test.setTimeout(180_000);

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByText(COUNTS)).toBeVisible(OPEN);
}

async function reopen(page: Page) {
  await page.reload();
  await expect(page.getByText(COUNTS)).toBeVisible(OPEN);
}

const field = (page: Page) => page.getByLabel("Shelf name");
const addButton = (page: Page) => page.getByRole("button", { name: "Add" });
const listed = (page: Page) =>
  page.getByRole("list", { name: "Shelves" }).getByRole("listitem");

async function add(page: Page, name: string) {
  await field(page).fill(name);
  await addButton(page).click();
  await expect(listed(page).filter({ hasText: name }).first()).toBeVisible();
  await expect(field(page)).toBeEnabled();
}

type Patched = Record<string, unknown>;

// A full phone: IndexedDB refuses the flush after Postgres has taken the row.
async function failFlushes(page: Page) {
  await page.evaluate(() => {
    const store = IDBObjectStore.prototype as unknown as Patched;
    (window as unknown as Patched).__put = store.put;
    store.put = () => {
      throw new DOMException(
        "The quota has been exceeded.",
        "QuotaExceededError",
      );
    };
  });
}

async function healFlushes(page: Page) {
  await page.evaluate(() => {
    const store = IDBObjectStore.prototype as unknown as Patched;
    store.put = (window as unknown as Patched).__put;
  });
}

test("R1 a flush that fails: what the page lists is what comes back, one King", async ({
  page,
}) => {
  await open(page);
  await failFlushes(page);
  await field(page).fill("King");
  await addButton(page).click();
  await expect(page.getByRole("alert")).toBeVisible();

  // The page said it didn't save and kept the words, so a person tries again.
  await healFlushes(page);
  await expect(field(page)).toBeEnabled();
  if ((await field(page).inputValue()) === "King") {
    await addButton(page).click();
    await expect(field(page)).toHaveValue("");
  }
  // The field clears on the click, so the write's answer is the button's return.
  await expect(addButton(page)).toBeEnabled();
  const before = await listed(page).allTextContents();

  await reopen(page);
  const after = await listed(page).allTextContents();
  expect(after).toEqual(before);
  expect(after.filter((name) => name === "King").length).toBeLessThan(2);
});

test("R2 a failed add's words name the cause and carry no SQL", async ({
  page,
}) => {
  await open(page);
  await failFlushes(page);
  await field(page).fill("King");
  await addButton(page).click();

  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).not.toContainText("insert into");
  await expect(alert).not.toContainText("00000000-0000-4000-8000-000000000001");
  await expect(alert).toContainText("quota");
});

test("R3 a stray rejection during the open doesn't condemn a good database", async ({
  page,
}) => {
  await page.addInitScript(() => {
    setTimeout(() => {
      void Promise.reject(new Error("not the database"));
    }, 300);
  });

  await page.goto("/");

  await expect(page.getByText(COUNTS)).toBeVisible(OPEN);
  await expect(field(page)).toBeEnabled();
});

test("R4 a 120-character name stays inside a phone's width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page);

  await add(page, "x".repeat(120));

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("R5 fast hands: what's typed while an add is out is kept, every letter", async ({
  page,
}) => {
  await open(page);
  await field(page).focus();

  await page.keyboard.type("King", { delay: 25 });
  await page.keyboard.press("Enter");
  await page.keyboard.type("Bach", { delay: 25 });

  await expect(listed(page)).toHaveText(["King"]);
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue("Bach");

  await page.keyboard.press("Enter");
  await expect(listed(page)).toHaveText(["Bach", "King"]);
});

test("R6 two windows on one store: every shelf a window accepted comes back", async ({
  context,
}) => {
  const one = await context.newPage();
  await open(one);
  const two = await context.newPage();
  await two.goto("/");
  await expect(two.getByText(COUNTS).or(two.getByRole("alert"))).toBeVisible(
    OPEN,
  );

  await add(one, "King");
  const accepted = ["King"];
  // A second window may refuse in words instead; what it took has to stay.
  if (
    await field(two)
      .isEnabled({ timeout: 1_000 })
      .catch(() => false)
  ) {
    await add(two, "Bach");
    accepted.push("Bach");
  }
  await one.close();
  await two.close();

  const three = await context.newPage();
  await open(three);
  expect((await listed(three).allTextContents()).sort()).toEqual(
    accepted.sort(),
  );
});

test("R7 a store missing PG_VERSION says so; it never opens empty over the rows", async ({
  page,
}) => {
  await open(page);
  await add(page, "King");

  const removed = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open("/pglite/fluxnook");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("FILE_DATA", "readwrite");
          const store = tx.objectStore("FILE_DATA");
          const keys = store.getAllKeys();
          keys.onsuccess = () => {
            const key = (keys.result as string[]).find((name) =>
              name.endsWith("/PG_VERSION"),
            );
            if (key) store.delete(key);
            tx.oncomplete = () => {
              db.close();
              resolve(key ?? "none");
            };
          };
        };
      }),
  );
  expect(removed).not.toBe("none");

  await page.reload();
  const words = page.getByRole("alert");
  const counts = page.getByText(COUNTS);
  await expect(words.or(counts)).toBeVisible(OPEN);
  if (await counts.isVisible()) {
    await expect(listed(page)).toHaveText(["King"]);
  } else {
    await expect(words).toContainText("couldn't open");
  }
});

test("R8 the open asks the browser not to evict the store", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const storage = navigator.storage;
    const persist = storage.persist.bind(storage);
    const seen = window as unknown as Patched;
    seen.__persistAsked = 0;
    storage.persist = () => {
      seen.__persistAsked = (seen.__persistAsked as number) + 1;
      return persist();
    };
  });

  await open(page);

  const asked = await page.evaluate(
    () => (window as unknown as Patched).__persistAsked as number,
  );
  expect(asked).toBeGreaterThan(0);
});

test("R9 a failed open still prints the build's version", async ({ page }) => {
  await page.route("**/*.wasm", (route) => route.abort());

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText(
    "Fluxnook couldn't open its database",
    OPEN,
  );
  await expect(page.getByText(version, { exact: true })).toBeVisible();
});
