import type { Locator, Page } from "@playwright/test";
import { db } from "./harness/fixtures";
import { post } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// Ch 1.6.2 Rummage: the card and the sheets under a second tab, a fast hand
// and a half-filled sheet. Each line was seen red before the Binder's fix.

/** A book of the test's own; its id. */
async function book(page: Page, title: string) {
  return (
    await post(page, "/api/v1/items", {
      type: "book",
      title,
      year: 1974,
      form: "novel",
      author: "Test Author",
    })
  ).id as string;
}

/** A book with one Done read; both ids. */
async function bookWithRead(page: Page, tag: string) {
  const id = await book(page, `${tag} ${crypto.randomUUID()}`);
  const read = (
    await post(page, "/api/v1/occurrences", { item: id, status: "done" })
  ).id as string;
  return { id, read };
}

/** Clicks a star's left or right half, measured from its box. */
async function half(star: Locator, side: "left" | "right") {
  const box = await star.boundingBox();
  if (!box) throw new Error("the star has no box");
  await star.click({
    position: {
      x: box.width * (side === "left" ? 0.25 : 0.75),
      y: box.height / 2,
    },
  });
}

const READ_PATH = /\/api\/v1\/occurrences\/[^/]+$/;

test("R1 a star clicked here while another tab moved it: the card shows the server's stars, as the heading does", async ({
  signedIn: { page },
}) => {
  const { id, read } = await bookWithRead(page, "Two tabs");
  // The other tab writes 3 between this tab's 4 landing and its answer.
  await page.route(READ_PATH, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    const response = await route.fetch();
    const other = await page.request.patch(`/api/v1/occurrences/${read}`, {
      data: { stars: 3 },
    });
    expect(other.status()).toBe(200);
    await route.fulfill({ response });
  });
  await page.goto(`/items/${id}`);
  const journal = page.getByRole("region", { name: "Journal" });
  const card = journal.getByTestId("read");
  await half(card.getByRole("button", { name: "4 stars" }), "right");

  await expect(
    journal.getByText("1 read · last finished at ★ 3", { exact: true }),
  ).toBeVisible();
  await expect(card.getByRole("group", { name: "★ 3" })).toBeVisible();
  expect(db(`select stars from occurrences where id = '${read}'`)).toBe("3.0");
});

test("R2 a star on a read deleted in another tab: the card goes, no line under a ghost", async ({
  signedIn: { page },
}) => {
  const { id, read } = await bookWithRead(page, "Ghost");
  await page.goto(`/items/${id}`);
  const journal = page.getByRole("region", { name: "Journal" });
  const card = journal.getByTestId("read");
  await expect(card).toHaveCount(1);
  expect(
    (await page.request.delete(`/api/v1/occurrences/${read}`)).status(),
  ).toBe(204);

  await half(card.getByRole("button", { name: "4 stars" }), "right");
  await expect(card).toHaveCount(0);
  await expect(
    journal.getByText(
      "Nothing logged yet. Log a read and the journal starts here.",
    ),
  ).toBeVisible();
});

test("R3 Delete on a read or an entry already gone: the confirm closes on what it asked for, not Try again", async ({
  signedIn: { page },
}) => {
  const id = await book(page, `Twice gone ${crypto.randomUUID()}`);
  const kept = (
    await post(page, "/api/v1/occurrences", {
      item: id,
      status: "done",
      finishedOn: "2019-03-09",
      entry: { body: "Going." },
    })
  ).id as string;
  const entry = db(
    `select id from journal_entries where occurrence = '${kept}'`,
  );
  const gone = (
    await post(page, "/api/v1/occurrences", { item: id, status: "done" })
  ).id as string;
  await page.goto(`/items/${id}`);
  const journal = page.getByRole("region", { name: "Journal" });
  const cards = journal.getByTestId("read");
  await expect(cards).toHaveCount(2);

  await test.step("the read", async () => {
    const card = cards.filter({ hasNotText: "Going." });
    expect(
      (await page.request.delete(`/api/v1/occurrences/${gone}`)).status(),
    ).toBe(204);
    await card.getByRole("button", { name: "Delete this read" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete read" });
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(confirm).toBeHidden();
    await expect(cards).toHaveCount(1);
  });

  await test.step("the entry", async () => {
    const card = cards.filter({ hasText: "Going." });
    expect(
      (
        await page.request.delete(
          `/api/v1/occurrences/${kept}/entries/${entry}`,
        )
      ).status(),
    ).toBe(204);
    await card.getByRole("button", { name: "Delete entry" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete entry" });
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(confirm).toBeHidden();
    await expect(card.getByTestId("entry")).toHaveCount(0);
    await expect(cards).toHaveCount(1);
  });
});

test("R4 a place typed with no words isn't dropped in silence", async ({
  signedIn: { page },
}) => {
  const id = await book(page, `Place only ${crypto.randomUUID()}`);
  await page.goto(`/items/${id}`);
  const journal = page.getByRole("region", { name: "Journal" });
  await journal.getByRole("button", { name: "Log a read" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Where in it, the place").fill("112");
  await sheet.getByRole("button", { name: "Log it" }).click();

  await expect(sheet.locator("#read-entry-error")).toHaveText(
    "Write something.",
  );
  await expect(sheet).toBeVisible();
  expect(db(`select count(*) from occurrences where item = '${id}'`)).toBe("0");
});

test("R5 an arrow pressed before the last click's answer is kept, not dropped", async ({
  signedIn: { page },
}) => {
  const { id, read } = await bookWithRead(page, "Quick hands");
  // A slow server: the click's answer takes long enough to press a key.
  await page.route(READ_PATH, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.goto(`/items/${id}`);
  const card = page.getByTestId("read");
  const fourth = card.getByRole("button", { name: "4 stars" });
  await half(fourth, "right");
  await fourth.press("ArrowRight");

  await expect(card.getByRole("group", { name: "★ 4.5" })).toBeVisible();
  // Both saves land before the reload: a reload mid-save drops what the
  // browser hasn't sent (Binder, at green).
  await expect(card.getByRole("group", { name: "★ 4.5" })).not.toHaveAttribute(
    "aria-busy",
    "true",
    { timeout: 10_000 },
  );
  // The page's refresh lands first; a reload over it is red in Firefox
  // (journal-sheets.spec.ts says why, Ch 1.8 A2).
  await expect(
    page.getByText("1 read · last finished at ★ 4.5", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(card.getByRole("group", { name: "★ 4.5" })).toBeVisible();
  expect(db(`select stars from occurrences where id = '${read}'`)).toBe("4.5");
});

test("R6 Written shows a time the save keeps: a sheet left open past the minute sends what it shows", async ({
  signedIn: { page },
}) => {
  const { id, read } = await bookWithRead(page, "Left open");
  // The sheet opened five minutes ago and nobody touched the field.
  await page.clock.install({ time: Date.now() - 5 * 60_000 });
  await page.goto(`/items/${id}`);
  const card = page.getByTestId("read");
  await card.getByRole("button", { name: "Add an entry" }).click();
  const sheet = page.getByRole("dialog", { name: "Add an entry" });
  const shown = await sheet.getByLabel("Written").inputValue();
  await sheet.getByLabel("Entry").fill("Written a while ago.");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();

  // The field's minute, as UTC, against the row's.
  const expected = new Date(shown).toISOString().slice(0, 16);
  expect(
    db(
      `select to_char(written_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI')
       from journal_entries where occurrence = '${read}'`,
    ),
  ).toBe(expected);
});
