import type { Locator, Page } from "@playwright/test";
import { localLong, localNow, localToday } from "./harness/dates";
import { db, itemFor, loadFixturesFor } from "./harness/fixtures";
import { film, post } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// Ch 1.6.2: the Journal section's controls and sheets, from a person's side.
// Each test logs on a work of its own, made through the route, so no test
// leans on another's reads (1.6.1 N2); the fixture read is TMNT #1's.

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

/** Clicks a star's left or right half, measured from its box. */
/**
 * Opens the log sheet until it shows: a click that lands before the page
 * hydrates (or while `next dev` reloads it) has no handler and opens nothing.
 */
async function openLog(journal: Locator, name: "Log a read" | "Log a watch") {
  const button = journal.getByRole("button", { name });
  await expect(async () => {
    await button.click();
    await expect(journal.page().getByRole("dialog")).toBeVisible({
      timeout: 1_000,
    });
  }).toPass();
}

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

/** The answer to the next request of `method` on a path ending in `tail`. */
const answered = (page: Page, method: string, tail: RegExp) =>
  page.waitForResponse(
    (r) =>
      r.request().method() === method && tail.test(new URL(r.url()).pathname),
  );

test("a star click on the card posts the stars and a reload keeps them", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  const tmnt = itemFor("manual", "tmnt-mirage-v1-1");
  await page.goto(`/items/${tmnt}`);
  const journal = page.getByRole("region", { name: "Journal" });
  const card = journal.getByTestId("read");
  const stars = card.getByRole("group", { name: "Unrated" });

  const saved = answered(page, "PATCH", /\/api\/v1\/occurrences\/[^/]+$/);
  await half(stars.getByRole("button", { name: "4 stars" }), "right");
  expect((await saved).status()).toBe(200);
  await expect(card.getByRole("group", { name: "★ 4" })).toBeVisible();
  await expect(
    journal.getByText("1 read · last finished at ★ 4", { exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(card.getByRole("group", { name: "★ 4" })).toBeVisible();
  await expect(
    journal.getByText("1 read · last finished at ★ 4", { exact: true }),
  ).toBeVisible();
  expect(
    db(`select o.stars from occurrences o join auth.users u on u.id = o.owner
      where u.email = '${email}' and o.item = '${tmnt}'`),
  ).toBe("4.0");
});

test("the left half of a star is its half, and the arrows move a half step", async ({
  signedIn: { page },
}) => {
  const id = await book(page, `Halves ${crypto.randomUUID()}`);
  await post(page, "/api/v1/occurrences", { item: id, status: "done" });
  await page.goto(`/items/${id}`);
  const card = page.getByTestId("read");

  let saved = answered(page, "PATCH", /\/occurrences\/[^/]+$/);
  await half(card.getByRole("button", { name: "5 stars" }), "left");
  await saved;
  await expect(card.getByRole("group", { name: "★ 4.5" })).toBeVisible();

  const fifth = card.getByRole("button", { name: "5 stars" });
  for (const [key, name] of [
    ["ArrowLeft", "★ 4"],
    ["ArrowRight", "★ 4.5"],
    ["ArrowRight", "★ 5"],
  ]) {
    saved = answered(page, "PATCH", /\/occurrences\/[^/]+$/);
    await fifth.press(key);
    expect((await saved).status()).toBe(200);
    await expect(card.getByRole("group", { name })).toBeVisible();
  }
  // The card's stars are client state; only the page's refresh brings the
  // heading. Reloading before it lands is red in Firefox: it aborts fetches as
  // a reload starts, before pagehide, and Next answers the aborted refresh with
  // location.replace of the same URL, over the reload. The page still loads, so
  // a person meets nothing; page.reload rejects NS_BINDING_ABORTED (Ch 1.8 A2).
  await expect(
    page.getByText("1 read · last finished at ★ 5", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(card.getByRole("group", { name: "★ 5" })).toBeVisible();
});

test("a 500 on the stars leaves the card as it was and says so", async ({
  signedIn: { page },
}) => {
  const id = await book(page, `Refused ${crypto.randomUUID()}`);
  await post(page, "/api/v1/occurrences", { item: id, status: "done" });
  await page.route("**/api/v1/occurrences/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, body: "" })
      : route.continue(),
  );
  await page.goto(`/items/${id}`);
  const card = page.getByTestId("read");
  await half(card.getByRole("button", { name: "3 stars" }), "right");
  await expect(card.getByRole("alert")).toHaveText(
    "Couldn't save that. Try again.",
  );
  await expect(card.getByRole("group", { name: "Unrated" })).toBeVisible();
});

/** How many reads of `item` there are, anyone's. */
const readsOf = (item: string) =>
  db(`select count(*) from occurrences where item = '${item}'`);

const WEEKEND =
  "Finished in a weekend. The epistolary pieces are the trick: the town is testifying before the thing has happened.";

test("log a read with a first entry and see the card", async ({
  signedIn: { page },
}) => {
  const title = `Logged ${crypto.randomUUID()}`;
  const id = await book(page, title);
  await page.goto(`/items/${id}`);
  const journal = page.getByRole("region", { name: "Journal" });
  await openLog(journal, "Log a read");

  const sheet = page.getByRole("dialog", { name: `Log a read of ${title}` });
  await expect(
    sheet
      .getByRole("group", { name: "Where it stands" })
      .getByRole("button", { name: "Done", pressed: true }),
  ).toBeVisible();
  await sheet.getByLabel("Started").fill("2026-10-28");
  await expect(sheet.getByLabel("Finished")).toHaveValue(localToday());
  await half(sheet.getByRole("button", { name: "5 stars" }), "left");
  await expect(sheet.getByTestId("stars-value")).toHaveText("4.5");
  await expect(sheet.getByRole("button", { name: "Clear" })).toBeVisible();
  await sheet.getByLabel("A first entry, if you like").fill(WEEKEND);
  const where = sheet.getByLabel("Where in it", { exact: true });
  await expect(where.locator("option")).toHaveText(["Page", "Chapter"]);
  await sheet.getByLabel("Where in it, the place").fill("112");
  await sheet.getByRole("button", { name: "Log it" }).click();

  await expect(sheet).toBeHidden();
  const card = journal.getByTestId("read");
  await expect(card).toHaveCount(1);
  await expect(card.getByText("Done", { exact: true })).toBeVisible();
  await expect(
    card.getByText(`28 October 2026 to ${localLong()}`, { exact: true }),
  ).toBeVisible();
  await expect(card.getByRole("group", { name: "★ 4.5" })).toBeVisible();
  const entry = card.getByTestId("entry");
  await expect(entry).toHaveCount(1);
  await expect(entry.getByText("p. 112", { exact: true })).toBeVisible();
  await expect(entry.getByText(localLong(), { exact: true })).toBeVisible();
  await expect(entry.getByText(WEEKEND)).toBeVisible();
  await expect(
    journal.getByText("1 read · last finished at ★ 4.5", { exact: true }),
  ).toBeVisible();
});

test("Reading sends finishedOn as null, never stripped", async ({
  signedIn: { page },
}) => {
  const id = await book(page, `Still going ${crypto.randomUUID()}`);
  await page.goto(`/items/${id}`);
  const journal = page.getByRole("region", { name: "Journal" });
  await openLog(journal, "Log a read");
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Reading" }).click();
  await expect(sheet.getByLabel("Finished")).toBeDisabled();
  await expect(sheet.getByLabel("Finished")).toHaveValue("");
  await sheet.getByLabel("Started").fill(localToday());

  const sent = page.waitForRequest(
    (r) =>
      r.method() === "POST" &&
      new URL(r.url()).pathname === "/api/v1/occurrences",
  );
  await sheet.getByRole("button", { name: "Log it" }).click();
  const body = JSON.parse((await sent).postData() ?? "{}");
  expect(body).toHaveProperty("finishedOn", null);
  expect(body).toHaveProperty("startedOn", localToday());
  expect(body).toHaveProperty("status", "in_progress");

  await expect(sheet).toBeHidden();
  const card = journal.getByTestId("read");
  await expect(card.getByText("Reading", { exact: true })).toBeVisible();
  await expect(
    card.getByText(`Started ${localLong()}`, { exact: true }),
  ).toBeVisible();
  await expect(
    journal.getByText("1 read · reading now", { exact: true }),
  ).toBeVisible();
});

test("the 409 line on the sheet", async ({ signedIn: { page } }) => {
  const id = await book(page, `Twice ${crypto.randomUUID()}`);
  await post(page, "/api/v1/occurrences", { item: id, status: "in_progress" });
  await page.goto(`/items/${id}`);
  const journal = page.getByRole("region", { name: "Journal" });
  await openLog(journal, "Log a read");
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Reading" }).click();
  await sheet.getByRole("button", { name: "Log it" }).click();

  await expect(sheet.getByRole("alert")).toHaveText(
    "You're already reading this. Finish or abandon that read first.",
  );
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();
  await expect(journal.getByTestId("read")).toHaveCount(1);
  expect(readsOf(id)).toBe("1");
});

test("a film's sheet is a watch with no Where in it", async ({
  signedIn: { page },
}) => {
  const title = `Watched ${crypto.randomUUID()}`;
  const id = await film(page, title, 1976);
  await page.goto(`/items/${id}`);
  const journal = page.getByRole("region", { name: "Journal" });
  await openLog(journal, "Log a watch");
  const sheet = page.getByRole("dialog", { name: `Log a watch of ${title}` });
  await expect(
    sheet
      .getByRole("group", { name: "Where it stands" })
      .getByRole("button", { name: "Watching" }),
  ).toBeVisible();
  await expect(sheet.getByText("Where in it")).toHaveCount(0);

  const fourth = sheet.getByRole("button", { name: "4 stars" });
  await fourth.press("Enter");
  await expect(sheet.getByTestId("stars-value")).toHaveText("4");
  await fourth.press("ArrowLeft");
  await expect(sheet.getByTestId("stars-value")).toHaveText("3.5");
  await sheet.getByRole("button", { name: "Log it" }).click();

  await expect(sheet).toBeHidden();
  await expect(
    journal.getByTestId("read").getByRole("group", { name: "★ 3.5" }),
  ).toBeVisible();
  await expect(
    journal.getByText("1 watch · last finished at ★ 3.5", { exact: true }),
  ).toBeVisible();
});

test("a field error stays on the sheet under its field", async ({
  signedIn: { page },
}) => {
  const id = await book(page, `Backwards ${crypto.randomUUID()}`);
  await page.goto(`/items/${id}`);
  const journal = page.getByRole("region", { name: "Journal" });
  await openLog(journal, "Log a read");
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Started").fill("2026-11-02");
  await sheet.getByLabel("Finished").fill("2026-10-28");
  await sheet.getByRole("button", { name: "Log it" }).click();

  await expect(sheet.locator("#read-finished-error")).toHaveText(
    "Finished can't be before Started.",
  );
  await expect(sheet.getByRole("alert")).toHaveCount(0);
  await expect(sheet).toBeVisible();
  expect(readsOf(id)).toBe("0");
});

test("Cancel and Escape close the sheet and write nothing", async ({
  signedIn: { page },
}) => {
  const id = await book(page, `Not yet ${crypto.randomUUID()}`);
  await page.goto(`/items/${id}`);
  const journal = page.getByRole("region", { name: "Journal" });
  const sheet = page.getByRole("dialog");

  await openLog(journal, "Log a read");
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();
  await openLog(journal, "Log a read");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await expect(journal.getByTestId("read")).toHaveCount(0);
  expect(readsOf(id)).toBe("0");
});

test("Edit turns the Reading read to Done, finished today, and the heading drops reading now", async ({
  signedIn: { page },
}) => {
  const id = await book(page, `Finishing ${crypto.randomUUID()}`);
  await post(page, "/api/v1/occurrences", {
    item: id,
    status: "done",
    startedOn: "2026-10-20",
    finishedOn: "2026-10-28",
    stars: 4.5,
  });
  await post(page, "/api/v1/occurrences", {
    item: id,
    status: "in_progress",
    startedOn: localToday(),
  });
  await page.goto(`/items/${id}`);
  const journal = page.getByRole("region", { name: "Journal" });
  await expect(
    journal.getByText("2 reads · last finished at ★ 4.5 · reading now", {
      exact: true,
    }),
  ).toBeVisible();

  const top = journal.getByTestId("read").first();
  await top.getByRole("button", { name: "Edit this read" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit this read" });
  await expect(
    sheet.getByRole("button", { name: "Reading", pressed: true }),
  ).toBeVisible();
  await expect(sheet.getByLabel("Finished")).toBeDisabled();
  await expect(sheet.getByLabel("A first entry, if you like")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Done", exact: true }).click();
  await expect(sheet.getByLabel("Finished")).toHaveValue(localToday());

  const sent = page.waitForRequest((r) => r.method() === "PATCH");
  await sheet.getByRole("button", { name: "Save" }).click();
  const body = JSON.parse((await sent).postData() ?? "{}");
  expect(body).toHaveProperty("status", "done");
  expect(body).toHaveProperty("finishedOn", localToday());
  expect(body).not.toHaveProperty("entry");

  await expect(sheet).toBeHidden();
  await expect(journal.getByText("2 reads", { exact: true })).toBeVisible();
  const cards = journal.getByTestId("read");
  await expect(cards.first().getByText("Done", { exact: true })).toBeVisible();
  await expect(
    cards.first().getByText(localLong(), { exact: true }),
  ).toBeVisible();
  await expect(
    cards.nth(1).getByText("20 October 2026 to 28 October 2026", {
      exact: true,
    }),
  ).toBeVisible();
});

test("Clear on the Edit sheet sends stars null and the card goes unrated", async ({
  signedIn: { page },
}) => {
  const id = await book(page, `Unstarred ${crypto.randomUUID()}`);
  await post(page, "/api/v1/occurrences", {
    item: id,
    status: "done",
    stars: 3,
  });
  await page.goto(`/items/${id}`);
  const card = page.getByTestId("read");
  await expect(card.getByRole("group", { name: "★ 3" })).toBeVisible();
  await card.getByRole("button", { name: "Edit this read" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit this read" });
  await expect(sheet.getByTestId("stars-value")).toHaveText("3");
  await sheet.getByRole("button", { name: "Clear" }).click();

  const sent = page.waitForRequest((r) => r.method() === "PATCH");
  await sheet.getByRole("button", { name: "Save" }).click();
  expect(JSON.parse((await sent).postData() ?? "{}")).toHaveProperty(
    "stars",
    null,
  );
  await expect(sheet).toBeHidden();
  await expect(card.getByRole("group", { name: "Unrated" })).toBeVisible();
});

/** A book with one done read and its first entry; the book's and read's ids. */
async function bookWithEntry(page: Page, title: string, body: string) {
  const id = await book(page, title);
  const read = await post(page, "/api/v1/occurrences", {
    item: id,
    status: "done",
    entry: { body },
  });
  return { id, read: read.id as string };
}

const SHOWER = "The shower scene lands harder knowing where it goes.";

test("add an entry and see it first, then edit its text and clear its anchor", async ({
  signedIn: { page },
}) => {
  const { id } = await bookWithEntry(
    page,
    `Entries ${crypto.randomUUID()}`,
    WEEKEND,
  );
  await page.goto(`/items/${id}`);
  const card = page.getByTestId("read");
  await card.getByRole("button", { name: "Add an entry" }).click();

  const sheet = page.getByRole("dialog", { name: "Add an entry" });
  const before = localNow();
  const written = await sheet.getByLabel("Written").inputValue();
  expect([before, localNow(new Date(Date.now() - 60_000))]).toContain(written);
  await sheet.getByLabel("Entry").fill(SHOWER);
  await sheet.getByLabel("Where in it, the place").fill("7");
  const posted = page.waitForRequest((r) => r.method() === "POST");
  await sheet.getByRole("button", { name: "Save" }).click();
  // Written untouched in its own minute: now, to the millisecond (R6).
  const sent = JSON.parse((await posted).postData() ?? "{}").writtenAt;
  expect(Math.abs(Date.parse(sent) - Date.now())).toBeLessThan(60_000);
  await expect(sheet).toBeHidden();

  const entries = card.getByTestId("entry");
  await expect(entries).toHaveCount(2);
  await expect(entries.first().getByText(SHOWER)).toBeVisible();
  await expect(
    entries.first().getByText("p. 7", { exact: true }),
  ).toBeVisible();
  await expect(
    entries.first().getByText(localLong(), { exact: true }),
  ).toBeVisible();
  await expect(entries.nth(1).getByText(WEEKEND)).toBeVisible();

  await entries.first().getByRole("button", { name: "Edit entry" }).click();
  const edit = page.getByRole("dialog", { name: "Edit entry" });
  await expect(edit.getByLabel("Entry")).toHaveValue(SHOWER);
  await expect(edit.getByLabel("Where in it, the place")).toHaveValue("7");
  await edit.getByLabel("Entry").fill(`${SHOWER} Edited.`);
  await edit.getByLabel("Where in it, the place").fill("");
  const patched = page.waitForRequest((r) => r.method() === "PATCH");
  await edit.getByRole("button", { name: "Save" }).click();
  const body = JSON.parse((await patched).postData() ?? "{}");
  expect(body).toEqual({
    body: `${SHOWER} Edited.`,
    anchorKind: null,
    anchorValue: null,
  });
  await expect(edit).toBeHidden();
  await expect(entries.first().getByText(`${SHOWER} Edited.`)).toBeVisible();
  await expect(entries.first().getByText("p. 7")).toHaveCount(0);
});

test("a blank entry is Write something. under the field", async ({
  signedIn: { page },
}) => {
  const { id } = await bookWithEntry(
    page,
    `Blank ${crypto.randomUUID()}`,
    "One.",
  );
  await page.goto(`/items/${id}`);
  const card = page.getByTestId("read");
  await card.getByRole("button", { name: "Add an entry" }).click();
  const sheet = page.getByRole("dialog", { name: "Add an entry" });
  await sheet.getByLabel("Entry").fill("   ");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.locator("#entry-body-error")).toHaveText(
    "Write something.",
  );
  await expect(sheet).toBeVisible();
  await expect(card.getByTestId("entry")).toHaveCount(1);
});

test("an entry's time can be set back, and a future one is refused", async ({
  signedIn: { page },
}) => {
  const { id } = await bookWithEntry(
    page,
    `Catching up ${crypto.randomUUID()}`,
    "Today's.",
  );
  await page.goto(`/items/${id}`);
  const card = page.getByTestId("read");

  await card.getByRole("button", { name: "Add an entry" }).click();
  let sheet = page.getByRole("dialog", { name: "Add an entry" });
  await sheet.getByLabel("Entry").fill("Back then.");
  await sheet.getByLabel("Written").fill("2019-03-09T21:14");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  const entries = card.getByTestId("entry");
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(1).getByText("Back then.")).toBeVisible();
  await expect(
    entries.nth(1).getByText("9 March 2019", { exact: true }),
  ).toBeVisible();

  await card.getByRole("button", { name: "Add an entry" }).click();
  sheet = page.getByRole("dialog", { name: "Add an entry" });
  await sheet.getByLabel("Entry").fill("Not yet.");
  await sheet
    .getByLabel("Written")
    .fill(localNow(new Date(Date.now() + 60 * 60_000)));
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.locator("#entry-written-error")).toHaveText(
    "That's in the future.",
  );
  await expect(sheet).toBeVisible();
  await expect(entries).toHaveCount(2);
});

/** A book with one done read holding `bodies` as entries; the ids. */
async function bookWithEntries(page: Page, title: string, bodies: string[]) {
  const { id, read } = await bookWithEntry(page, title, bodies[0]);
  for (const body of bodies.slice(1)) {
    await post(page, `/api/v1/occurrences/${read}/entries`, { body });
  }
  return { id, read };
}

const entriesOf = (read: string) =>
  db(`select count(*) from journal_entries where occurrence = '${read}'`);

test("delete an entry: asks once, the read and its other entry stay", async ({
  signedIn: { page },
}) => {
  const { id, read } = await bookWithEntries(
    page,
    `Pruned ${crypto.randomUUID()}`,
    ["Kept.", "Gone."],
  );
  await page.goto(`/items/${id}`);
  const entries = page.getByTestId("entry");
  await expect(entries.first().getByText("Gone.")).toBeVisible();
  await entries.first().getByRole("button", { name: "Delete entry" }).click();

  const confirm = page.getByRole("dialog", { name: "Delete entry" });
  await expect(confirm.getByText("Delete this entry?")).toBeVisible();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(confirm).toBeHidden();
  await expect(entries).toHaveCount(1);
  await expect(entries.getByText("Kept.")).toBeVisible();
  await expect(page.getByTestId("read")).toHaveCount(1);
  expect(entriesOf(read)).toBe("1");
});

test("delete a read with two entries names the count, and takes them", async ({
  signedIn: { page },
}) => {
  const { id, read } = await bookWithEntries(
    page,
    `Unread ${crypto.randomUUID()}`,
    ["First.", "Second."],
  );
  await post(page, "/api/v1/occurrences", {
    item: id,
    status: "done",
    finishedOn: "2019-03-09",
  });
  await page.goto(`/items/${id}`);
  const journal = page.getByRole("region", { name: "Journal" });
  const cards = journal.getByTestId("read");
  await expect(cards).toHaveCount(2);
  const withEntries = cards.filter({ hasText: "First." });
  await withEntries.getByRole("button", { name: "Delete this read" }).click();

  const confirm = page.getByRole("dialog", { name: "Delete read" });
  await expect(
    confirm.getByText("Delete this read and its 2 entries?"),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(confirm).toBeHidden();
  await expect(cards).toHaveCount(1);
  await expect(journal.getByText("1 read", { exact: true })).toBeVisible();
  expect(entriesOf(read)).toBe("0");
  expect(db(`select count(*) from occurrences where id = '${read}'`)).toBe("0");
});

test("a read with one entry says entry, and with none asks plainly", async ({
  signedIn: { page },
}) => {
  const { id } = await bookWithEntry(
    page,
    `Asked ${crypto.randomUUID()}`,
    "Only.",
  );
  await page.goto(`/items/${id}`);
  const card = page.getByTestId("read");
  const confirm = page.getByRole("dialog", { name: "Delete read" });

  await card.getByRole("button", { name: "Delete this read" }).click();
  await expect(
    confirm.getByText("Delete this read and its 1 entry?"),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();

  await card.getByRole("button", { name: "Delete entry" }).click();
  await page
    .getByRole("dialog", { name: "Delete entry" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(card.getByTestId("entry")).toHaveCount(0);

  await card.getByRole("button", { name: "Delete this read" }).click();
  await expect(
    confirm.getByText("Delete this read?", { exact: true }),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(card).toHaveCount(1);
});

test("a watch's delete speaks of a watch", async ({ signedIn: { page } }) => {
  const id = await film(page, `Unwatched ${crypto.randomUUID()}`, 1976);
  await post(page, "/api/v1/occurrences", { item: id, status: "done" });
  await page.goto(`/items/${id}`);
  await page
    .getByTestId("read")
    .getByRole("button", { name: "Delete this watch" })
    .click();
  const confirm = page.getByRole("dialog", { name: "Delete watch" });
  await expect(
    confirm.getByText("Delete this watch?", { exact: true }),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("read")).toHaveCount(0);
  await expect(
    page.getByText(
      "Nothing logged yet. Log a watch and the journal starts here.",
    ),
  ).toBeVisible();
});
