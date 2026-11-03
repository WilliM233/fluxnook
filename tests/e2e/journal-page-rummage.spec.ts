import type { Page } from "@playwright/test";
import { db } from "./harness/fixtures";
import { makeShelf, post } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// Ch 1.6.3 Rummage: the Journal page under a pasted address and a pasted
// URL, and the shelf's offer under a second tab. Each line was seen red
// before the Binder's fix.

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

/** A row's status buttons, by its title. */
const statusOf = (page: Page, title: string) =>
  page.getByRole("group", { name: `Status of ${title}` });

/** The shelf's row for a work, by its title. */
const rowOf = (page: Page, title: string) =>
  page.getByTestId("entry").filter({ hasText: title });

/** Clicks a status until it shows pressed (a click before hydration sends nothing). */
async function mark(page: Page, title: string, name: "Done" | "Skipped") {
  const group = statusOf(page, title);
  await expect(async () => {
    await group.getByRole("button", { name }).click();
    await expect(
      group.getByRole("button", { name, pressed: true }),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

test("R1 a before that has the shape but isn't a date is the in-shell 404, not a 500", async ({
  signedIn: { page },
}) => {
  // The regex passes these; Postgres throws "date/time field value out of
  // range" at ::timestamptz, and the page dies where A8 says not-found.
  for (const at of [
    "2026-02-30T00:00:00.000000Z",
    "2026-13-01T00:00:00.000000Z",
    "0000-01-01T00:00:00.000000Z",
  ]) {
    const response = await page.goto(
      `/journal?before=${encodeURIComponent(`${at},${crypto.randomUUID()}`)}`,
    );
    expect(response?.status(), at).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Nothing on this shelf" }),
    ).toBeVisible();
  }
});

test("R2 an offer doesn't outlive a refresh that shows the row isn't Done any more", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 2 });
  const [top1, top2] = [shelf.title("Top1"), shelf.title("Top2")];
  await page.goto(`/shelves/${shelf.id}`);

  // This tab: Done on Top1, the offer stands.
  await mark(page, top1, "Done");
  await expect(rowOf(page, top1).getByText("Watched it?")).toBeVisible();

  // Another tab (the request context shares the session): Top1 back to
  // Unmarked on the server.
  const entry = db(
    `select e.id from shelf_entries e join items i on i.id = e.item
     where e.shelf = '${shelf.id}' and i.title = '${top1}'`,
  );
  const undone = await page.request.patch(
    `/api/v1/shelves/${shelf.id}/entries/${entry}`,
    { data: { status: "unmarked" } },
  );
  expect(undone.status()).toBe(200);

  // This tab logs Top2 through its own offer; the sheet's success reads the
  // shelf again, and Top1 comes back Unmarked.
  await mark(page, top2, "Done");
  await rowOf(page, top2).getByRole("button", { name: "Log a watch" }).click();
  const sheet = page.getByRole("dialog", { name: `Log a watch of ${top2}` });
  await sheet.getByRole("button", { name: "Log it" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    statusOf(page, top1).getByRole("button", {
      name: "Unmarked",
      pressed: true,
    }),
  ).toBeVisible();

  // A10: the offer follows a click answered Done. This row isn't Done.
  await expect(rowOf(page, top1).getByText("Watched it?")).toHaveCount(0);
  await expect(
    rowOf(page, top1).getByRole("button", { name: `Remove ${top1}` }),
  ).toBeVisible();
});

/** How far an element's content runs past its own box, in px; 0 when it fits. */
const overflowOf = (el: Element) => el.scrollWidth - el.clientWidth;

test("R3 a pasted URL with no space in it stays inside the Journal row, and the card", async ({
  signedIn: { page },
}) => {
  const { id, read } = await bookWithRead(page, "Unbroken");
  const url = `https://example.com/${"a".repeat(400)}`;
  await post(page, `/api/v1/occurrences/${read}/entries`, {
    body: `Found this: ${url}`,
  });

  await page.goto("/journal");
  const row = page.getByTestId("journal-row").first();
  await expect(row).toContainText("Found this:");
  expect(await row.evaluate(overflowOf), "the Journal row").toBe(0);

  // The item page's card prints the same body on the same classes.
  await page.goto(`/items/${id}`);
  const body = page.getByText("Found this:", { exact: false }).first();
  await expect(body).toBeVisible();
  const card = body.locator("xpath=ancestor::li[1]");
  expect(await card.evaluate(overflowOf), "the item page's card").toBe(0);
});

test("R4 a cursor page with nothing left on it says so, not the whole journal's count over an empty list", async ({
  signedIn: { page },
}) => {
  // The way there: Older entries, then Delete on page 2's last row; the
  // page keeps its ?before= and reads again. The cheap way: the same
  // address with one entry newer than the cursor.
  const { read } = await bookWithRead(page, "Past the end");
  await post(page, `/api/v1/occurrences/${read}/entries`, { body: "Only." });
  await page.goto(
    `/journal?before=0001-01-01T00:00:00.000000Z,${crypto.randomUUID()}`,
  );
  await expect(page.getByTestId("journal-row")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Older entries" })).toHaveCount(
    0,
  );
  // A8's lede promises rows, newest first; with none under it the page
  // needs a line that says this page is past the end (the words are the
  // Binder's; the test takes any that say so).
  await expect(
    page.getByRole("main").getByText(/nothing older|no older entries/i),
  ).toBeVisible();
});

test("R5 Edit on a row another tab deleted: the sheet says so, and the row is gone when the sheet closes", async ({
  signedIn: { page },
}) => {
  const { read } = await bookWithRead(page, "Ghost");
  await post(page, `/api/v1/occurrences/${read}/entries`, { body: "Keep me." });
  const gone = (
    await post(page, `/api/v1/occurrences/${read}/entries`, {
      body: "Gone soon.",
    })
  ).id as string;

  await page.goto("/journal");
  const rows = page.getByTestId("journal-row");
  await expect(rows).toHaveCount(2);

  // Another tab deletes the newer entry.
  const deleted = await page.request.delete(
    `/api/v1/occurrences/${read}/entries/${gone}`,
  );
  expect(deleted.status()).toBe(204);

  await rows.first().getByRole("button", { name: "Edit entry" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit entry" });
  await sheet.getByLabel("Entry").fill("Gone soon, edited.");
  await sheet.getByRole("button", { name: "Save" }).click();
  // The route's own sentence, as 1.6.2 prints a refusal.
  await expect(sheet.getByRole("alert")).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);

  // 1.6.2 R2 and R3: no ghost under a line about a thing that isn't there.
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Keep me.");
});
