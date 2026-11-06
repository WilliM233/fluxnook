import type { Page } from "@playwright/test";
import { db } from "./harness/fixtures";
import { heldWrite, lostAnswer, opens } from "./harness/held";
import { film, makeShelf, post } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// The Raccoon's Rummage on 1.8.1 (plan section 4b). Every `R` test is red at
// 4e20691 and goes green with the Binder's fix. The two `guard` tests are green
// today, on purpose: each stands next to the R test a careless fix would pass by
// breaking the other half. Each test works on rows of its own, made through the
// route or, for the picker, by SQL.

const sheetOf = (page: Page) => page.getByRole("dialog");

async function book(page: Page) {
  return (
    await post(page, "/api/v1/items", {
      type: "book",
      title: `Rummage ${crypto.randomUUID()}`,
      year: 1974,
      form: "novel",
      author: "Test Author",
    })
  ).id as string;
}

async function bookWithRead(page: Page) {
  const id = await book(page);
  const read = (
    await post(page, "/api/v1/occurrences", { item: id, status: "done" })
  ).id as string;
  return { id, read };
}

const rowOf = (page: Page, title: string) =>
  page.getByTestId("entry").filter({ hasText: title });

const itemId = (title: string) =>
  db(`select id from items where title = '${title}'`);

/** Done on a shelf row, clicked until it shows: a click before hydration sends nothing. */
async function markDone(page: Page, title: string) {
  const group = page.getByRole("group", { name: `Status of ${title}` });
  await expect(async () => {
    await group.getByRole("button", { name: "Done" }).click();
    await expect(
      group.getByRole("button", { name: "Done", pressed: true }),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

// The picker's rows by SQL, as `rummage-contents-picker.spec.ts` makes them.
const tag = `hold-rummage ${crypto.randomUUID().slice(0, 8)}`;

function issue(run: string, number: number) {
  const id = db(`insert into items (type, title, form, source_note)
    values ('comic', '${run} #${number}', 'issue', '${tag}') returning id`).split(
    "\n",
  )[0];
  db(`insert into item_comics (item, series, number)
    values ('${id}', '${run}', ${number})`);
  return `${run} #${number}`;
}

/** A collected comic with one printing, and two issues its picker can tick. */
function collectedWithTwoIssues() {
  const run = `${tag} ${crypto.randomUUID().slice(0, 8)}`;
  const first = issue(run, 1);
  const second = issue(run, 2);
  const work = db(`insert into items (type, title, form, source_note)
    values ('comic', '${run} Collection', 'collected', '${tag}') returning id`).split(
    "\n",
  )[0];
  const edition = db(`insert into editions (item, format)
    values ('${work}', 'tpb') returning id`).split("\n")[0];
  return { work, edition, first, second };
}

test.afterAll(() => {
  db(`delete from items where source_note = '${tag}'`);
});

// A sheet renders its own Cancel, and the hook held that. Add works also renders
// a link, and nothing holds it: the same miss, one door over, a third time.
test("R1 Add works: the Search link is no door out while the write is out", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, {});
  const title = `Pick ${shelf.tag}`;
  await film(page, title, 1984);
  const write = await heldWrite(
    page,
    "POST",
    `**/api/v1/shelves/${shelf.id}/entries`,
  );
  await page.goto(`/shelves/${shelf.id}`);
  await opens(page, page.getByRole("button", { name: "Add works" }));
  const sheet = sheetOf(page);
  await sheet.getByLabel("Find").fill(title);
  await sheet.getByTestId("pick").getByRole("checkbox").check();
  await sheet.getByRole("button", { name: "Add 1 work" }).click();
  await write.arrival;

  // Forced and short: a fix may disable the link or take it away while held.
  await sheet
    .getByRole("link", { name: "Search the providers" })
    .click({ force: true, timeout: 1_000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  await expect.soft(page).toHaveURL(`/shelves/${shelf.id}`);
  await expect.soft(sheet).toBeVisible();
  write.release();
});

// Delete shelf's good answer goes to the nook; its lost answer, on Cancel, reads a
// page that's gone and stops at the not-found.
test("R2 Delete shelf: Cancel after a lost answer lands on the nook", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, {});
  await lostAnswer(page, "DELETE", `**/api/v1/shelves/${shelf.id}`);
  await page.goto(`/shelves/${shelf.id}`);
  await opens(page, page.getByRole("button", { name: "Delete shelf" }));
  const sheet = sheetOf(page);
  await sheet.getByRole("button", { name: "Delete shelf" }).click();
  await expect(sheet.getByRole("alert")).toHaveText(
    "Couldn't delete the shelf just now. Try again.",
  );
  expect(db(`select count(*) from shelves where id = '${shelf.id}'`)).toBe("0");

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL("/nook");
});

test("guard for R2: a refused Delete shelf stays on the shelf", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, {});
  await page.route(`**/api/v1/shelves/${shelf.id}`, (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 500, body: "{}" })
      : route.continue(),
  );
  await page.goto(`/shelves/${shelf.id}`);
  await opens(page, page.getByRole("button", { name: "Delete shelf" }));
  const sheet = sheetOf(page);
  await sheet.getByRole("button", { name: "Delete shelf" }).click();
  await expect(sheet.getByRole("alert")).toBeVisible();

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 1, name: shelf.name }),
  ).toBeVisible();
  await expect(page).toHaveURL(`/shelves/${shelf.id}`);
});

// `onSaved` takes the offer away, `close(true)` doesn't. The row shows the stars
// that landed and still asks whether you watched it.
test("R3 the shelf's offer goes once a lost Log has landed", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 1 });
  const top1 = shelf.title("Top1");
  await lostAnswer(page, "POST", "**/api/v1/occurrences");
  await page.goto(`/shelves/${shelf.id}`);
  await markDone(page, top1);
  const row = rowOf(page, top1);
  await row.getByRole("button", { name: "Log a watch" }).click();
  const sheet = sheetOf(page);
  await sheet.getByRole("button", { name: "4 stars" }).press("Enter");
  await sheet.getByRole("button", { name: "Log it" }).click();
  await expect(sheet.getByRole("alert")).toBeVisible();

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(row.getByText("★ 4", { exact: true })).toBeVisible();
  await expect(row.getByText("Watched it?")).toHaveCount(0);
});

test("guard for R3: a refused Log keeps the offer", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 1 });
  const top1 = shelf.title("Top1");
  await page.route("**/api/v1/occurrences", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 500, body: "{}" })
      : route.continue(),
  );
  await page.goto(`/shelves/${shelf.id}`);
  await markDone(page, top1);
  const row = rowOf(page, top1);
  await row.getByRole("button", { name: "Log a watch" }).click();
  const sheet = sheetOf(page);
  await sheet.getByRole("button", { name: "Log it" }).click();
  await expect(sheet.getByRole("alert")).toBeVisible();

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await page.waitForTimeout(1_000);
  await expect(row.getByText("Watched it?")).toBeVisible();
});

// New on this branch: the refresh on Cancel empties the row's `open`, so the offer
// left behind no longer finishes the read, it logs a second one (1.6.3 N9's "never
// log a second"). On `dev` the Cancel read nothing, `open` stayed, and a second
// try was a PATCH. Following the offer, seen: 2 reads
// (browse-results/1.8.1-raccoon-probe-2.txt, Q1).
test("R4 N9: the offer goes once a lost finish has landed, so no second read", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 1 });
  const top1 = shelf.title("Top1");
  await post(page, "/api/v1/occurrences", {
    item: itemId(top1),
    status: "in_progress",
    startedOn: "2020-01-05",
    stars: 3.5,
  });
  await lostAnswer(page, "PATCH", "**/api/v1/occurrences/*");
  await page.goto(`/shelves/${shelf.id}`);
  await markDone(page, top1);
  const row = rowOf(page, top1);
  await row.getByRole("button", { name: "Log a watch" }).click();
  const sheet = sheetOf(page);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByRole("alert")).toBeVisible();
  expect(
    db(`select status from occurrences where item = '${itemId(top1)}'`),
  ).toBe("done");

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(row.getByText("Watched it?")).toHaveCount(0);
});

// A sheet held open is still a live form. What goes in while the write is out
// isn't in the write, and the good answer closes the sheet over it without a word:
// the throwing-away 1.6.2 S3 forbade, through a door the hold now props open.
test("R5a Add an entry: words typed while the write is out aren't thrown away", async ({
  signedIn: { page },
}) => {
  const { id, read } = await bookWithRead(page);
  const write = await heldWrite(
    page,
    "POST",
    `**/api/v1/occurrences/${read}/entries`,
  );
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Add an entry" }));
  const sheet = sheetOf(page);
  const entry = sheet.getByLabel("Entry");
  await entry.fill("First words.");
  await sheet.getByRole("button", { name: "Save" }).click();
  await write.arrival;

  await entry.focus();
  await page.keyboard.type(" And a second thought.");
  await expect.soft(entry).toHaveValue("First words.");
  write.release();
  await expect(sheet).toHaveCount(0);
});

test("R5b Log a read: words typed while the write is out aren't thrown away", async ({
  signedIn: { page },
}) => {
  const id = await book(page);
  const write = await heldWrite(page, "POST", "**/api/v1/occurrences");
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Log a read" }));
  const sheet = sheetOf(page);
  const entry = sheet.getByLabel("A first entry, if you like");
  await entry.fill("First words.");
  await sheet.getByRole("button", { name: "Log it" }).click();
  await write.arrival;

  await entry.focus();
  await page.keyboard.type(" And a second thought.");
  await expect.soft(entry).toHaveValue("First words.");
  write.release();
  await expect(sheet).toHaveCount(0);
});

test("R5c Own a copy: a note typed while the write is out isn't thrown away", async ({
  signedIn: { page },
}) => {
  const id = await book(page);
  const write = await heldWrite(page, "POST", "**/api/v1/copies");
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Own a copy" }));
  const sheet = sheetOf(page);
  const note = sheet.getByLabel("Note");
  await note.fill("Signed.");
  await sheet.getByRole("button", { name: "Add it" }).click();
  await write.arrival;

  await note.focus();
  await page.keyboard.type(" Foxed.");
  await expect.soft(note).toHaveValue("Signed.");
  write.release();
  await expect(sheet).toHaveCount(0);
});

test("R5d Edit contents: a tick while the write is out isn't thrown away", async ({
  signedIn: { page },
}) => {
  const { work, edition, first, second } = collectedWithTwoIssues();
  const write = await heldWrite(
    page,
    "PUT",
    `**/api/v1/editions/${edition}/contents`,
  );
  await page.goto(`/items/${work}`);
  await opens(page, page.getByRole("button", { name: "Edit contents" }));
  const sheet = sheetOf(page);
  await sheet.getByRole("checkbox", { name: first }).check();
  await sheet.getByRole("button", { name: "Save contents" }).click();
  await write.arrival;

  await sheet
    .getByRole("checkbox", { name: second })
    .click({ force: true, timeout: 1_000 })
    .catch(() => {});
  await expect.soft(sheet.getByText("1 picked")).toBeVisible();
  write.release();
  await expect(sheet).toHaveCount(0);
});

// The sheet comes back from the page's props, and the page's read is still out on
// a slow line: the new sheet ticks what was, and its Save is a whole replacement.
// So a tick that landed and answered 200 is gone, with nothing lost in the post.
test("R6 Edit contents reopened before the page has read again keeps what landed", async ({
  signedIn: { page },
}) => {
  const { work, edition, first, second } = collectedWithTwoIssues();
  await page.goto(`/items/${work}`);
  await opens(page, page.getByRole("button", { name: "Edit contents" }));

  const slow = Promise.withResolvers<void>();
  await page.route(`**/items/${work}*`, async (route) => {
    if (route.request().headers().rsc) await slow.promise;
    await route.continue();
  });
  const sheet = sheetOf(page);
  await sheet.getByLabel("A series or a title").fill(first);
  await sheet.getByRole("checkbox").check();
  await sheet.getByRole("button", { name: "Save contents" }).click();
  await expect(sheet).toHaveCount(0);
  // Long enough to reopen inside it; a fix that waits on the read gets through.
  setTimeout(() => slow.resolve(), 3_000);

  await opens(page, page.getByRole("button", { name: "Edit contents" }));
  await sheet.getByLabel("A series or a title").fill(second);
  await sheet.getByRole("checkbox").check();
  await sheet.getByRole("button", { name: "Save contents" }).click();
  await expect(sheet).toHaveCount(0);
  expect(
    db(`select count(*) from edition_contents where edition = '${edition}'`),
  ).toBe("2");
});

// R6's window, one door over each: these sheets also send what they opened with,
// so a stale opening puts the old words back over a write that answered 200 (the
// Binder's, from reading B4's neighbours). Copy edits send only what changed.
/** Holds the page's own read past a reopen, until `lands` is called. */
async function slowRead(page: Page, path: string) {
  const slow = Promise.withResolvers<void>();
  await page.route(`**${path}*`, async (route) => {
    if (route.request().headers().rsc) await slow.promise;
    await route.continue();
  });
  return () => setTimeout(() => slow.resolve(), 3_000);
}

test("R6b Edit shelf reopened before the page has read again keeps what landed", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, {});
  const edit = page.getByRole("button", { name: "Edit shelf" });
  await page.goto(`/shelves/${shelf.id}`);
  await opens(page, edit);
  const lands = await slowRead(page, `/shelves/${shelf.id}`);
  const sheet = sheetOf(page);
  await sheet.getByLabel("Name").fill(`Renamed ${shelf.tag}`);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  lands();

  await opens(page, edit);
  await sheet.getByLabel("Description").fill("Later words.");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  expect(db(`select name from shelves where id = '${shelf.id}'`)).toBe(
    `Renamed ${shelf.tag}`,
  );
});

test("R6c Edit this read reopened before the page has read again keeps what landed", async ({
  signedIn: { page },
}) => {
  const { id, read } = await bookWithRead(page);
  const edit = page.getByRole("button", { name: "Edit this read" });
  await page.goto(`/items/${id}`);
  await opens(page, edit);
  const lands = await slowRead(page, `/items/${id}`);
  const sheet = sheetOf(page);
  await sheet.getByLabel("Started").fill("2020-01-05");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  lands();

  await opens(page, edit);
  await sheet.getByRole("button", { name: "4 stars" }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  expect(db(`select started_on from occurrences where id = '${read}'`)).toBe(
    "2020-01-05",
  );
});

/** A book, a read and an entry, ready for Edit entry. */
async function bookWithEntry(page: Page) {
  const { id, read } = await bookWithRead(page);
  const entry = (
    await post(page, `/api/v1/occurrences/${read}/entries`, {
      body: "First words.",
    })
  ).id as string;
  return { id, entry };
}

async function secondEditKeepsBody(
  page: Page,
  entry: string,
  lands: () => void,
) {
  const sheet = sheetOf(page);
  await sheet.getByLabel("Entry").fill("Second words.");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  lands();

  await opens(page, page.getByRole("button", { name: "Edit entry" }));
  await sheet.getByLabel("Where in it, the place").fill("112");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  expect(db(`select body from journal_entries where id = '${entry}'`)).toBe(
    "Second words.",
  );
}

test("R6d Edit entry on the card, reopened before the page has read again, keeps what landed", async ({
  signedIn: { page },
}) => {
  const { id, entry } = await bookWithEntry(page);
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Edit entry" }));
  await secondEditKeepsBody(page, entry, await slowRead(page, `/items/${id}`));
});

test("R6e Edit entry on the Journal page, reopened before the page has read again, keeps what landed", async ({
  signedIn: { page },
}) => {
  const { entry } = await bookWithEntry(page);
  await page.goto("/journal");
  await opens(page, page.getByRole("button", { name: "Edit entry" }));
  await secondEditKeepsBody(page, entry, await slowRead(page, "/journal"));
});

// The row's Add says `aria-busy` (`search.tsx` 474, 661). Its sheet, which now
// holds a person for the whole of an import with Cancel greyed and the × doing
// nothing, says nothing, and the page's own line says sixty issues takes a few
// seconds. The post is aborted at the route: no row of the catalog moves.
test("R7 the series sheet says it's busy while it holds", async ({
  signedIn: { page },
}) => {
  const out = Promise.withResolvers<void>();
  const arrived = Promise.withResolvers<void>();
  await page.route("**/api/v1/series/import", async (route) => {
    arrived.resolve();
    await out.promise;
    await route.abort();
  });
  await page.goto("/search?q=teenage%20mutant%20ninja%20turtles&type=comic");
  await page
    .getByRole("list", { name: "Comic series", exact: true })
    .getByRole("listitem")
    .filter({ has: page.getByText("1993", { exact: true }) })
    .filter({ has: page.getByText("TM-Semic · 3 issues", { exact: true }) })
    .getByRole("button", { name: "Add" })
    .click();
  const sheet = sheetOf(page);
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  // Another spec's hand-entered runs may make it ask first.
  await sheet
    .getByRole("button", { name: "Add anyway" })
    .click({ timeout: 1_500 })
    .catch(() => {});
  await arrived.promise;

  await expect
    .soft(
      page.locator(
        '[role="dialog"][aria-busy="true"], [role="dialog"] [aria-busy="true"]',
      ),
    )
    .not.toHaveCount(0);
  out.resolve();
  await expect(sheet.getByRole("alert")).toBeVisible();
});
