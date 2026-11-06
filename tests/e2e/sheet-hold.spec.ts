import type { Page } from "@playwright/test";
import { db } from "./harness/fixtures";
import { expectHeld, heldWrite, opens } from "./harness/held";
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
