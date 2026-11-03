import type { Page } from "@playwright/test";
import { localLong, localShort, localTime, localToday } from "./harness/dates";
import { db } from "./harness/fixtures";
import { film, post } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// A8 (Ch 1.6.3): the Journal page, every entry across every work, newest
// first, 50 a page by keyset. Each test writes on works of its own, made
// through the route, so a fresh account's journal holds only what it wrote.

const SECOND =
  " An entry is written from a work's page, on the read or watch it belongs to.";
const MARCH = "2019-03-09T21:14:03Z";

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

/** A read through A3's route; its id. */
const read = async (page: Page, data: Record<string, unknown>) =>
  (await post(page, "/api/v1/occurrences", data)).id as string;

/** An entry through A4's route; its id. */
const entry = async (
  page: Page,
  readId: string,
  data: Record<string, unknown>,
) =>
  (await post(page, `/api/v1/occurrences/${readId}/entries`, data))
    .id as string;

test("the Journal page across two works with the day labels and the links", async ({
  signedIn: { page },
}) => {
  const tag = crypto.randomUUID().slice(0, 8);
  const bookId = await book(page, `Journal book ${tag}`);
  const filmId = await film(page, `Journal film ${tag}`, 1976);
  const reading = await read(page, {
    item: bookId,
    status: "in_progress",
    startedOn: "2026-10-28",
  });
  await entry(page, reading, {
    body: "From March.",
    anchorKind: "page",
    anchorValue: "112",
    writtenAt: MARCH,
  });
  await entry(page, reading, { body: "From today, on the book." });
  const watched = await read(page, {
    item: filmId,
    status: "done",
    finishedOn: localToday(),
    stars: 3.5,
  });
  await entry(page, watched, { body: "From today, on the film." });

  await page.goto("/journal");
  await expect(
    page.getByRole("heading", { name: "Journal", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText(`3 entries across 2 works, newest first.${SECOND}`, {
      exact: true,
    }),
  ).toBeVisible();

  const march = localLong(new Date(MARCH));
  await expect(
    page.getByRole("region", { name: localLong() }).getByRole("heading"),
  ).toHaveText(localLong());
  await expect(
    page.getByRole("region", { name: march }).getByRole("heading"),
  ).toHaveText(march);

  const rows = page.getByTestId("journal-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("From today, on the film.");
  await expect(rows.nth(1)).toContainText("From today, on the book.");
  await expect(rows.nth(2)).toContainText("From March.");

  const filmRow = rows.nth(0);
  await expect(
    filmRow.getByRole("link", { name: `Journal film ${tag}` }),
  ).toHaveAttribute("href", `/items/${filmId}`);
  await expect(filmRow.getByText("Film", { exact: true })).toBeVisible();
  await expect(
    filmRow.getByText(`Done, ${localShort()} · ★ 3.5`, { exact: true }),
  ).toBeVisible();

  const marchRow = rows.nth(2);
  await expect(
    marchRow.getByRole("link", { name: `Journal book ${tag}` }),
  ).toHaveAttribute("href", `/items/${bookId}`);
  await expect(marchRow.getByText("Book", { exact: true })).toBeVisible();
  await expect(marchRow.getByText("1974 · Novel · Test Author")).toBeVisible();
  await expect(
    marchRow.getByText("Reading since 28 October", { exact: true }),
  ).toBeVisible();
  await expect(marchRow.getByText("p. 112", { exact: true })).toBeVisible();
  await expect(
    marchRow.getByText(localTime(MARCH), { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Older entries" })).toHaveCount(
    0,
  );
});

test("Older entries with 51 rows, seeded through the route", async ({
  signedIn: { page },
}) => {
  const bookId = await book(page, `Fifty-one ${crypto.randomUUID()}`);
  const readId = await read(page, { item: bookId, status: "done" });
  // 49 a minute apart, then the two oldest on one instant: the page's edge
  // falls between them.
  for (let k = 1; k <= 51; k++) {
    const writtenAt =
      k > 49
        ? "2019-03-09T21:14:03.512345Z"
        : `2019-03-10T00:${String(k).padStart(2, "0")}:00Z`;
    await entry(page, readId, { body: `Entry ${k} of 51.`, writtenAt });
  }

  await page.goto("/journal");
  await expect(
    page.getByText(`51 entries across 1 work, newest first.${SECOND}`, {
      exact: true,
    }),
  ).toBeVisible();
  const rows = page.getByTestId("journal-row");
  await expect(rows).toHaveCount(50);
  await expect(page.getByText("50 a page, by date written.")).toBeVisible();
  const older = page.getByRole("link", { name: "Older entries" });
  expect(await older.getAttribute("href")).toMatch(
    /^\/journal\?before=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z(,|%2C)[0-9a-f-]{36}$/,
  );
  const first = await rows.allTextContents();

  await older.click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Older entries" })).toHaveCount(
    0,
  );
  const second = await rows.allTextContents();

  const seen = [...first, ...second].map(
    (text) => text.match(/Entry (\d+) of 51\./)?.[1],
  );
  expect(seen.filter(Boolean)).toHaveLength(51);
  expect(new Set(seen).size).toBe(51);
});

test("Edit and Delete work here too", async ({ signedIn: { page } }) => {
  const bookId = await book(page, `Edited here ${crypto.randomUUID()}`);
  const readId = await read(page, { item: bookId, status: "done" });
  await entry(page, readId, { body: "Keep me." });
  await entry(page, readId, { body: "The shower scene." });

  await page.goto("/journal");
  const rows = page.getByTestId("journal-row");
  await expect(rows).toHaveCount(2);
  await rows.first().getByRole("button", { name: "Edit entry" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit entry" });
  await expect(sheet.getByLabel("Entry")).toHaveValue("The shower scene.");
  await sheet.getByLabel("Entry").fill("The shower scene, again.");
  await sheet.getByLabel("Where in it, the place").fill("24");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(rows.first()).toContainText("The shower scene, again.");
  await expect(rows.first().getByText("p. 24", { exact: true })).toBeVisible();

  await rows.first().getByRole("button", { name: "Delete entry" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete entry" });
  await expect(confirm.getByText("Delete this entry?")).toBeVisible();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Keep me.");
  await expect(
    page.getByText(`1 entry across 1 work, newest first.${SECOND}`, {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    db(`select count(*) from journal_entries where occurrence = '${readId}'`),
  ).toBe("1");
});

test("a bad before is the in-shell 404", async ({ signedIn: { page } }) => {
  for (const before of [
    "yesterday",
    "2019-03-09T21:14:03.512345Z,not-a-uuid",
  ]) {
    const response = await page.goto(
      `/journal?before=${encodeURIComponent(before)}`,
    );
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Nothing on this shelf" }),
    ).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
  }
});

test("a fresh account's journal is empty", async ({ signedIn: { page } }) => {
  await page.goto("/journal");
  await expect(
    page.getByText(
      "Nothing written yet. Open a work, log a read or a watch, and write the first line.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByTestId("journal-row")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Older entries" })).toHaveCount(
    0,
  );
});
