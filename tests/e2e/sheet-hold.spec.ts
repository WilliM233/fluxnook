import type { Page } from "@playwright/test";
import { db } from "./harness/fixtures";
import { expectHeld, heldWrite, lostAnswer, opens } from "./harness/held";
import { film, makeShelf, post } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// Ch 1.8 A1: every sheet that posts holds while its write is out, from one hook
// (`src/components/ui/sheet-hold.ts`). `the hold:` holds the write past every door
// out; `typed:` is words typed on a sheet with paragraphs; `lost:` is House Rules
// step 3's third test on a sheet, where a close after a tried post reads the page.
// Each test works on rows of its own, made through the route.

const sheetOf = (page: Page) => page.getByRole("dialog");

/** A book of the test's own; its id. */
async function book(page: Page, title = `Hold ${crypto.randomUUID()}`) {
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

/** A book with a done read on it, and an entry if asked. */
async function bookWithRead(page: Page, body?: string) {
  const id = await book(page);
  const read = (
    await post(page, "/api/v1/occurrences", { item: id, status: "done" })
  ).id as string;
  const entry = body
    ? ((await post(page, `/api/v1/occurrences/${read}/entries`, { body }))
        .id as string)
    : "";
  return { id, read, entry };
}

const copiesOf = (item: string) =>
  db(`select count(*) from copies c join editions e on e.id = c.edition
    where e.item = '${item}'`);

test("the hold: Own a copy", async ({ signedIn: { page } }) => {
  const id = await book(page);
  const write = await heldWrite(page, "POST", "**/api/v1/copies");
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Own a copy" }));
  const sheet = sheetOf(page);
  await sheet.getByRole("button", { name: "Add it" }).click();
  await write.arrival;

  await expectHeld(page, sheet);
  expect(write.seen()).toBe(1);

  write.release();
  await expect(sheet).toHaveCount(0);
  expect(write.seen()).toBe(1);
  expect(copiesOf(id)).toBe("1");
});

test("the hold: a confirm", async ({ signedIn: { page } }) => {
  const { id, read, entry } = await bookWithRead(page, "Words to let go.");
  const write = await heldWrite(
    page,
    "DELETE",
    `**/api/v1/occurrences/${read}/entries/${entry}`,
  );
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Delete entry" }));
  const sheet = sheetOf(page);
  await sheet.getByRole("button", { name: "Delete" }).click();
  await write.arrival;

  await expectHeld(page, sheet);
  expect(write.seen()).toBe(1);

  write.release();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("entry")).toHaveCount(0);
  expect(write.seen()).toBe(1);
  expect(db(`select count(*) from journal_entries where id = '${entry}'`)).toBe(
    "0",
  );
});

const readsOf = (item: string) =>
  db(`select count(*) from occurrences where item = '${item}'`);
const entriesOf = (read: string) =>
  db(`select count(*) from journal_entries where occurrence = '${read}'`);

test("the hold: Log a read", async ({ signedIn: { page } }) => {
  const id = await book(page);
  const write = await heldWrite(page, "POST", "**/api/v1/occurrences");
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Log a read" }));
  const sheet = sheetOf(page);
  // No words typed: Escape here is the hold's, not `typed`'s.
  await sheet.getByRole("button", { name: "Log it" }).click();
  await write.arrival;

  await expectHeld(page, sheet);
  expect(write.seen()).toBe(1);

  write.release();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("read")).toHaveCount(1);
  expect(write.seen()).toBe(1);
  expect(readsOf(id)).toBe("1");
});

test("the hold: Edit this read", async ({ signedIn: { page } }) => {
  const { id, read } = await bookWithRead(page);
  const write = await heldWrite(page, "PATCH", `**/api/v1/occurrences/${read}`);
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Edit this read" }));
  const sheet = sheetOf(page);
  await sheet.getByRole("button", { name: "4 stars" }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await write.arrival;

  await expectHeld(page, sheet);
  expect(write.seen()).toBe(1);

  write.release();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByTestId("read").getByRole("group", { name: "★ 4" }),
  ).toBeVisible();
  expect(write.seen()).toBe(1);
  expect(db(`select stars from occurrences where id = '${read}'`)).toBe("4.0");
});

test("the hold: Add an entry", async ({ signedIn: { page } }) => {
  const { id, read } = await bookWithRead(page);
  const write = await heldWrite(
    page,
    "POST",
    `**/api/v1/occurrences/${read}/entries`,
  );
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Add an entry" }));
  const sheet = sheetOf(page);
  // Words are typed, so Escape stays either way: Cancel is the door that proves it.
  await sheet.getByLabel("Entry").fill("Words on their way.");
  await sheet.getByRole("button", { name: "Save" }).click();
  await write.arrival;

  await expectHeld(page, sheet);
  expect(write.seen()).toBe(1);

  write.release();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("entry")).toHaveCount(1);
  expect(write.seen()).toBe(1);
  expect(entriesOf(read)).toBe("1");
});

test("the hold: Edit entry", async ({ signedIn: { page } }) => {
  const { id, read, entry } = await bookWithRead(page, "Words already here.");
  const write = await heldWrite(
    page,
    "PATCH",
    `**/api/v1/occurrences/${read}/entries/${entry}`,
  );
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Edit entry" }));
  const sheet = sheetOf(page);
  // Only the place changes: the words are as they were, so `typed` holds nothing.
  await sheet.getByLabel("Where in it, the place").fill("112");
  await sheet.getByRole("button", { name: "Save" }).click();
  await write.arrival;

  await expectHeld(page, sheet);
  expect(write.seen()).toBe(1);

  write.release();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("entry").getByText("p. 112")).toBeVisible();
  expect(write.seen()).toBe(1);
  expect(entriesOf(read)).toBe("1");
});

test("typed: Log a read", async ({ signedIn: { page } }) => {
  const id = await book(page);
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Log a read" }));
  const sheet = sheetOf(page);
  await sheet.getByLabel("A first entry, if you like").fill("A paragraph.");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await expect(sheet).toBeVisible();
  await page.mouse.click(5, 5);
  await page.waitForTimeout(150);
  await expect(sheet).toBeVisible();

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  expect(readsOf(id)).toBe("0");
});

test("typed: an entry", async ({ signedIn: { page } }) => {
  const { id, read } = await bookWithRead(page);
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Add an entry" }));
  const sheet = sheetOf(page);
  await sheet.getByLabel("Entry").fill("A paragraph.");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await expect(sheet).toBeVisible();
  await page.mouse.click(5, 5);
  await page.waitForTimeout(150);
  await expect(sheet).toBeVisible();

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  expect(entriesOf(read)).toBe("0");
});

const entriesOn = (shelf: string) =>
  db(`select count(*) from shelf_entries where shelf = '${shelf}'`);

test("the hold: New section", async ({ signedIn: { page } }) => {
  const shelf = await makeShelf(page, {});
  const write = await heldWrite(
    page,
    "POST",
    `**/api/v1/shelves/${shelf.id}/sections`,
  );
  await page.goto(`/shelves/${shelf.id}`);
  await opens(page, page.getByRole("button", { name: "New section" }));
  const sheet = sheetOf(page);
  await sheet.getByLabel("Name").fill("Scratch");
  await sheet.getByRole("button", { name: "Make section" }).click();
  await write.arrival;

  await expectHeld(page, sheet);
  expect(write.seen()).toBe(1);

  write.release();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Scratch" })).toBeVisible();
  expect(write.seen()).toBe(1);
  expect(
    db(`select count(*) from shelf_sections where shelf = '${shelf.id}'`),
  ).toBe("1");
});

test("the hold: Edit shelf", async ({ signedIn: { page } }) => {
  const shelf = await makeShelf(page, {});
  const write = await heldWrite(page, "PATCH", `**/api/v1/shelves/${shelf.id}`);
  await page.goto(`/shelves/${shelf.id}`);
  await opens(page, page.getByRole("button", { name: "Edit shelf" }));
  const sheet = sheetOf(page);
  await sheet.getByLabel("Name").fill(`Renamed ${shelf.tag}`);
  await sheet.getByRole("button", { name: "Save" }).click();
  await write.arrival;

  await expectHeld(page, sheet);
  expect(write.seen()).toBe(1);

  write.release();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 1, name: `Renamed ${shelf.tag}` }),
  ).toBeVisible();
  expect(write.seen()).toBe(1);
});

/** A shelf and a film not on it; Add works found and ticked. */
async function pickedOnAddWorks(page: Page) {
  const shelf = await makeShelf(page, {});
  const title = `Pick ${shelf.tag}`;
  await film(page, title, 1984);
  return { shelf, title };
}

async function tickWork(page: Page, title: string) {
  const sheet = sheetOf(page);
  await sheet.getByLabel("Find").fill(title);
  await sheet.getByTestId("pick").getByRole("checkbox").check();
  await sheet.getByRole("button", { name: "Add 1 work" }).click();
}

test("the hold: Add works", async ({ signedIn: { page } }) => {
  const { shelf, title } = await pickedOnAddWorks(page);
  const write = await heldWrite(
    page,
    "POST",
    `**/api/v1/shelves/${shelf.id}/entries`,
  );
  await page.goto(`/shelves/${shelf.id}`);
  await opens(page, page.getByRole("button", { name: "Add works" }));
  await tickWork(page, title);
  await write.arrival;

  await expectHeld(page, sheetOf(page));
  expect(write.seen()).toBe(1);

  write.release();
  await expect(sheetOf(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  expect(write.seen()).toBe(1);
  expect(entriesOn(shelf.id)).toBe("1");
});

/** The item page's Add to shelf, the shelf picked, sent. */
async function addToShelf(page: Page, name: string) {
  const sheet = sheetOf(page);
  await sheet.getByRole("radio", { name }).check();
  await sheet.getByRole("button", { name: "Add to shelf" }).click();
}

const chips = (page: Page) =>
  page.getByRole("region", { name: "On your shelves" }).getByRole("link");

test("the hold: Add to shelf", async ({ signedIn: { page } }) => {
  const id = await book(page);
  const shelf = await makeShelf(page, {});
  const write = await heldWrite(
    page,
    "POST",
    `**/api/v1/shelves/${shelf.id}/entries`,
  );
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Add to shelf" }));
  await addToShelf(page, shelf.name);
  await write.arrival;

  await expectHeld(page, sheetOf(page));
  expect(write.seen()).toBe(1);

  write.release();
  await expect(sheetOf(page)).toHaveCount(0);
  await expect(chips(page)).toHaveCount(1);
  expect(write.seen()).toBe(1);
  expect(entriesOn(shelf.id)).toBe("1");
});

// The picker's rows by SQL, as `rummage-contents-picker.spec.ts` makes them.
const tag = `sheet-hold ${crypto.randomUUID().slice(0, 8)}`;

function collectedWithIssue() {
  const made = (title: string, form: string) =>
    db(`insert into items (type, title, form, source_note)
      values ('comic', '${title}', '${form}', '${tag}') returning id`).split(
      "\n",
    )[0];
  const unique = crypto.randomUUID().slice(0, 8);
  const issue = made(`${tag} ${unique} #1`, "issue");
  db(`insert into item_comics (item, series, number)
    values ('${issue}', '${tag} ${unique} Run', 1)`);
  const work = made(`${tag} ${unique} Collection`, "collected");
  const edition = db(`insert into editions (item, format)
    values ('${work}', 'tpb') returning id`).split("\n")[0];
  return { issue, work, edition, title: `${tag} ${unique} #1` };
}

test.afterAll(() => {
  db(`delete from items where source_note = '${tag}'`);
});

const contentsOf = (edition: string) =>
  db(`select count(*) from edition_contents where edition = '${edition}'`);

async function saveOneTick(page: Page, title: string) {
  const sheet = sheetOf(page);
  await sheet.getByLabel("A series or a title").fill(title);
  await sheet.getByRole("checkbox").check();
  await sheet.getByRole("button", { name: "Save contents" }).click();
}

test("the hold: Edit contents", async ({ signedIn: { page } }) => {
  const { work, edition, title } = collectedWithIssue();
  const write = await heldWrite(
    page,
    "PUT",
    `**/api/v1/editions/${edition}/contents`,
  );
  await page.goto(`/items/${work}`);
  await opens(page, page.getByRole("button", { name: "Edit contents" }));
  await saveOneTick(page, title);
  await write.arrival;

  await expectHeld(page, sheetOf(page));
  expect(write.seen()).toBe(1);

  write.release();
  await expect(sheetOf(page)).toHaveCount(0);
  await expect(page.getByText("Contents: Nothing yet")).toHaveCount(0);
  expect(write.seen()).toBe(1);
  expect(contentsOf(edition)).toBe("1");
});

test("lost: Edit contents", async ({ signedIn: { page } }) => {
  const { work, edition, title } = collectedWithIssue();
  await lostAnswer(page, "PUT", `**/api/v1/editions/${edition}/contents`);
  await page.goto(`/items/${work}`);
  await opens(page, page.getByRole("button", { name: "Edit contents" }));
  await saveOneTick(page, title);
  const sheet = sheetOf(page);
  await expect(sheet.getByRole("alert")).toHaveText(
    "Couldn't save just now. Try again.",
  );
  expect(contentsOf(edition)).toBe("1");

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText("Contents: Nothing yet")).toHaveCount(0);
});

test("lost: New section", async ({ signedIn: { page } }) => {
  const shelf = await makeShelf(page, {});
  await lostAnswer(page, "POST", `**/api/v1/shelves/${shelf.id}/sections`);
  await page.goto(`/shelves/${shelf.id}`);
  await opens(page, page.getByRole("button", { name: "New section" }));
  const sheet = sheetOf(page);
  await sheet.getByLabel("Name").fill("Scratch");
  await sheet.getByRole("button", { name: "Make section" }).click();
  await expect(sheet.getByRole("alert")).toHaveText(
    "Couldn't make the section just now. Try again.",
  );

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Scratch" })).toBeVisible();
});

test("lost: Edit shelf", async ({ signedIn: { page } }) => {
  const shelf = await makeShelf(page, {});
  await lostAnswer(page, "PATCH", `**/api/v1/shelves/${shelf.id}`);
  await page.goto(`/shelves/${shelf.id}`);
  await opens(page, page.getByRole("button", { name: "Edit shelf" }));
  const sheet = sheetOf(page);
  await sheet.getByLabel("Name").fill(`Renamed ${shelf.tag}`);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByRole("alert")).toHaveText(
    "Couldn't save the shelf just now. Try again.",
  );

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 1, name: `Renamed ${shelf.tag}` }),
  ).toBeVisible();
});

test("lost: Add works", async ({ signedIn: { page } }) => {
  const { shelf, title } = await pickedOnAddWorks(page);
  await lostAnswer(page, "POST", `**/api/v1/shelves/${shelf.id}/entries`);
  await page.goto(`/shelves/${shelf.id}`);
  await opens(page, page.getByRole("button", { name: "Add works" }));
  await tickWork(page, title);
  const sheet = sheetOf(page);
  await expect(sheet.getByRole("alert")).toHaveText(
    "Couldn't add those just now. Try again.",
  );
  expect(entriesOn(shelf.id)).toBe("1");

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("lost: Add to shelf", async ({ signedIn: { page } }) => {
  const id = await book(page);
  const shelf = await makeShelf(page, {});
  await lostAnswer(page, "POST", `**/api/v1/shelves/${shelf.id}/entries`);
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Add to shelf" }));
  await addToShelf(page, shelf.name);
  const sheet = sheetOf(page);
  await expect(sheet.getByRole("alert")).toHaveText(
    "Couldn't add that just now. Try again.",
  );
  expect(entriesOn(shelf.id)).toBe("1");

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(chips(page)).toHaveCount(1);
});

test("lost: Log a read", async ({ signedIn: { page } }) => {
  const id = await book(page);
  await lostAnswer(page, "POST", "**/api/v1/occurrences");
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Log a read" }));
  const sheet = sheetOf(page);
  await sheet.getByRole("button", { name: "Log it" }).click();
  await expect(sheet.getByRole("alert")).toHaveText(
    "Couldn't log that read just now. Try again.",
  );
  expect(readsOf(id)).toBe("1");

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("read")).toHaveCount(1);
  await expect(page.getByText(/^1 read\b/)).toBeVisible();
});

test("lost: an entry", async ({ signedIn: { page } }) => {
  const { id, read } = await bookWithRead(page);
  await lostAnswer(page, "POST", `**/api/v1/occurrences/${read}/entries`);
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Add an entry" }));
  const sheet = sheetOf(page);
  await sheet.getByLabel("Entry").fill("Landed, unanswered.");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByRole("alert")).toHaveText(
    "Couldn't save the entry just now. Try again.",
  );
  expect(entriesOf(read)).toBe("1");

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("entry")).toHaveText(/Landed, unanswered\./);
});

test("lost: a confirm", async ({ signedIn: { page } }) => {
  const { id, read, entry } = await bookWithRead(page, "Gone, unanswered.");
  await lostAnswer(
    page,
    "DELETE",
    `**/api/v1/occurrences/${read}/entries/${entry}`,
  );
  await page.goto(`/items/${id}`);
  await opens(page, page.getByRole("button", { name: "Delete entry" }));
  const sheet = sheetOf(page);
  await sheet.getByRole("button", { name: "Delete" }).click();
  await expect(sheet.getByRole("alert")).toHaveText(
    "Couldn't delete the entry just now. Try again.",
  );
  expect(entriesOf(read)).toBe("0");

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("entry")).toHaveCount(0);
});
