import type { Page } from "@playwright/test";
import { db } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// The 1.7.3 Rummage (Raccoon), on rows of this file's own under a tag. Each was
// seen red at `36b2e71` on a production build; R10 is `tests/db/rummage-shopping.test.ts`.
// The plan's races all held the Add button; these go round it.

const tag = crypto.randomUUID();

type Probe = { id: string; title: string };

function probe(
  type = "book",
  form: string | null = "novel",
  title = `Rummage probe ${crypto.randomUUID().slice(0, 8)}`,
): Probe {
  const id = db(`
    insert into items (type, title, form, source_note)
    values ('${type}', '${title}', ${form ? `'${form}'` : "null"}, '${tag}')
    returning id`).split("\n")[0];
  return { id, title };
}

const printing = (item: string, format = "paperback") =>
  db(`insert into editions (item, format)
    values ('${item}', '${format}') returning id`).split("\n")[0];

async function post(page: Page, url: string, data: object) {
  const answer = await page.request.post(url, { data });
  expect(answer.status(), url).toBe(201);
  return (await answer.json()) as { id: string };
}

async function shelfOf(page: Page, name: string, works: string[]) {
  const { id } = await post(page, "/api/v1/shelves", { name });
  if (works.length > 0) {
    await post(page, `/api/v1/shelves/${id}/entries`, { items: works });
  }
  return id;
}

/** A held printing of a fresh probe, through the route. */
async function held(page: Page, body: object = {}) {
  const work = probe();
  const { id } = await post(page, "/api/v1/copies", {
    edition: printing(work.id),
    ...body,
  });
  return { work, copy: id };
}

const copiesOf = (item: string) =>
  db(`select count(*) from copies c join editions e on e.id = c.edition
    where e.item = '${item}'`);

const sheet = (page: Page) => page.getByRole("dialog");
const shoppingRow = (page: Page, item: string) =>
  page.locator(`[data-testid="shopping-row"][data-item="${item}"]`);
const ownButton = (page: Page, item: string) =>
  shoppingRow(page, item).locator("button");
const collectionRows = (page: Page) => page.getByTestId("collection-row");

/** Clicks until the sheet shows: a click before hydration has no handler. */
async function opensOwn(page: Page, item: string) {
  await expect(async () => {
    await ownButton(page, item).click();
    await expect(sheet(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

async function opensOnRow(page: Page, name: string) {
  const button = collectionRows(page).getByRole("button", { name });
  await expect(async () => {
    await button.click();
    await expect(sheet(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

/** A route that answers only when told, with a promise for its arrival. */
async function heldRoute(page: Page, url: string) {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived = () => {};
  const arrival = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route(url, async (route) => {
    arrived();
    await released;
    await route.continue();
  });
  return { release, arrival };
}

/** Lets a refresh the close fired finish, so it can't read what lands after it. */
async function settled(page: Page) {
  await page.waitForTimeout(500);
  await expect(page.locator("main button:disabled")).toHaveCount(0, {
    timeout: 20_000,
  });
}

/** Clicks Cancel if a hold leaves it enabled; a disabled one is the other fix. */
async function tryCancel(page: Page) {
  await sheet(page)
    .getByRole("button", { name: "Cancel" })
    .click({ timeout: 1_000 })
    .catch(() => {});
}

const sideways = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

test.afterAll(() => {
  db(`delete from copies where edition in (
    select e.id from editions e join items i on i.id = e.item
    where i.source_note = '${tag}')`);
  db(`delete from shelf_entries where item in (
    select id from items where source_note = '${tag}')`);
  db(`delete from items where source_note = '${tag}'`);
});

test("R1 Save out on a Collection row: Cancel holds, so the note isn't overwritten behind a closed sheet", async ({
  signedIn: { page },
}) => {
  const { copy } = await held(page, { condition: "fine", note: "Keep this." });
  const { release, arrival } = await heldRoute(
    page,
    `**/api/v1/copies/${copy}`,
  );
  await page.goto("/collection");
  await opensOnRow(page, "Edit this copy");
  await sheet(page).getByLabel("Note").fill("Thought better of it.");
  await sheet(page).getByRole("button", { name: "Save" }).click();
  await arrival;

  try {
    // As `confirm-sheet.tsx` holds since 1.7.2 B1: while it's out, Cancel can't promise.
    await expect(
      sheet(page).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled({ timeout: 2_000 });
  } finally {
    release();
  }
});

test("R2 Add it out on a Shopping row, Cancel, I own this again, Add it: one copy", async ({
  signedIn: { page },
}) => {
  const work = probe();
  await shelfOf(page, "Twice", [work.id]);
  const { release, arrival } = await heldRoute(page, "**/api/v1/copies");
  await page.goto("/collection/shopping");
  await opensOwn(page, work.id);
  await sheet(page).getByRole("button", { name: "Add it" }).click();
  await arrival;

  // A disabled Cancel is the fix: the sheet stays and there's no second door.
  await tryCancel(page);
  if ((await sheet(page).count()) === 0) {
    await settled(page);
    await opensOwn(page, work.id);
    await sheet(page).getByRole("button", { name: "Add it" }).click();
  }
  release();
  await expect.poll(() => copiesOf(work.id)).not.toBe("0");
  await expect(shoppingRow(page, work.id)).toHaveCount(0);
  await page.waitForTimeout(1_000);
  expect(copiesOf(work.id)).toBe("1");
});

test("R3 Remove lands, its answer is lost, Cancel: the row is gone and the lede moves", async ({
  signedIn: { page },
}) => {
  await held(page);
  const { copy, work } = await held(page);
  await page.route(`**/api/v1/copies/${copy}`, async (route) => {
    await route.fetch();
    await route.abort();
  });
  await page.goto("/collection");
  const row = page.locator(
    `[data-testid="collection-row"][data-item="${work.id}"]`,
  );
  await expect(async () => {
    await row.getByRole("button", { name: "Remove this copy" }).click();
    await expect(sheet(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await sheet(page).getByRole("button", { name: "Remove" }).click();
  await expect(sheet(page).getByRole("alert")).toHaveText(
    "Couldn't remove that copy just now. Try again.",
  );
  expect(db(`select count(*) from copies where id = '${copy}'`)).toBe("0");

  await sheet(page).getByRole("button", { name: "Cancel" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(row).toHaveCount(0);
  await expect(page.getByText("1 copy of 1 work, newest first.")).toBeVisible();
});

test("R4 Cancel with nothing posted doesn't read the whole list again", async ({
  signedIn: { page },
}) => {
  const work = probe();
  await shelfOf(page, "Quiet", [work.id]);
  await page.goto("/collection/shopping");
  await opensOwn(page, work.id);
  await page.waitForTimeout(1_000);

  const reads: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/collection/shopping") reads.push(url.href);
  });
  await sheet(page).getByRole("button", { name: "Cancel" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await page.waitForTimeout(1_000);
  expect(reads).toEqual([]);
});

test("R5 a shelf of nothing but an unheld backup: the lede doesn't say it's yours", async ({
  signedIn: { page },
}) => {
  const story = probe("comic", "backup");
  await shelfOf(page, "Backups only", [story.id]);
  await page.goto("/collection/shopping");
  await expect(
    page
      .getByRole("region", { name: "Backups only" })
      .getByText("1 backup left out: you'd buy what it's printed in."),
  ).toBeVisible();
  await expect(
    page.getByText("Every work on your shelves is yours."),
  ).toHaveCount(0);
});

test("R6 an empty shelf: the lede doesn't say every work on it is yours", async ({
  signedIn: { page },
}) => {
  await shelfOf(page, "Bare", []);
  await page.goto("/collection/shopping");
  await expect(page.getByText("Nothing on this shelf yet.")).toBeVisible();
  await expect(
    page.getByText("Every work on your shelves is yours."),
  ).toHaveCount(0);
});

test("R7 Escape from the sheet puts the keyboard back on the row it came from", async ({
  signedIn: { page },
}) => {
  const works = [probe(), probe(), probe()];
  await shelfOf(
    page,
    "Keyboard",
    works.map((w) => w.id),
  );
  await page.goto("/collection/shopping");
  const middle = ownButton(page, works[1].id);
  await expect(async () => {
    await middle.focus();
    await page.keyboard.press("Enter");
    await expect(sheet(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();

  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await settled(page);
  await expect(middle).toBeFocused();
});

test("R8 a long unbroken title on a Collection row doesn't push a phone sideways", async ({
  signedIn: { page },
}) => {
  const work = probe("book", "novel", "Longtitle".repeat(14));
  await post(page, "/api/v1/copies", { edition: printing(work.id) });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/collection");
  await expect(collectionRows(page)).toHaveCount(1);
  expect(await sideways(page)).toBe(0);
});

test("R9 a long unbroken shelf name on Shopping doesn't push a phone sideways", async ({
  signedIn: { page },
}) => {
  const name = "Longshelf".repeat(13);
  const work = probe();
  await shelfOf(page, name, [work.id]);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/collection/shopping");
  await expect(shoppingRow(page, work.id)).toHaveCount(1);
  expect(await sideways(page)).toBe(0);
});
