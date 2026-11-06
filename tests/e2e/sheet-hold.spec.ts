import type { Page } from "@playwright/test";
import { db } from "./harness/fixtures";
import { expectHeld, heldWrite, lostAnswer, opens } from "./harness/held";
import { post } from "./harness/shelves";
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
  const write = await heldWrite(
    page,
    "PATCH",
    `**/api/v1/occurrences/${read}`,
  );
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
