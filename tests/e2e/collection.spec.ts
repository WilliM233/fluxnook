import type { Locator, Page } from "@playwright/test";
import { db, loadFixturesFor } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// Ch 1.7 A10, on rows of this file's own under a tag, tidied after, so a
// parallel spec's fixture rows never move. The fixture's own five are read by
// an account that loads them.

const tag = crypto.randomUUID();

type Probe = { id: string; title: string };

function probe(type = "book", form: string | null = "novel"): Probe {
  const title = `Collection probe ${crypto.randomUUID().slice(0, 8)}`;
  const id = db(`
    insert into items (type, title, form, source_note)
    values ('${type}', '${title}', ${form ? `'${form}'` : "null"}, '${tag}')
    returning id`).split("\n")[0];
  return { id, title };
}

const printing = (item: string, format = "paperback", publisher = "") =>
  db(`insert into editions (item, format, publisher)
    values ('${item}', '${format}', ${publisher ? `'${publisher}'` : "null"})
    returning id`).split("\n")[0];

const account = (email: string) =>
  db(`select id from auth.users where email = '${email}'`);

/** n copies in one statement, so they share a `created_at` and only the id orders them. */
const fill = (email: string, edition: string, n: number) =>
  db(`insert into copies (owner, edition)
    select '${account(email)}', '${edition}' from generate_series(1, ${n})`);

/** A held printing of a fresh probe, through the route, as a person's click makes one. */
async function held(page: Page, body: object = {}) {
  const work = probe();
  const edition = printing(work.id);
  const answer = await page.request.post("/api/v1/copies", {
    data: { edition, ...body },
  });
  expect(answer.status()).toBe(201);
  const { id } = await answer.json();
  return { work, edition, copy: id as string };
}

const rows = (page: Page) => page.getByTestId("collection-row");
const sheet = (page: Page) => page.getByRole("dialog");
const lede = (page: Page) => page.getByRole("main").locator("p").first();
const chips = (page: Page) =>
  page.getByRole("navigation", { name: "Filter by type" });

/** Clicks until the sheet shows: a click before hydration has no handler. */
async function opens(page: Page, within: Locator, name: string) {
  const button = within.getByRole("button", { name });
  await expect(async () => {
    await button.click();
    await expect(sheet(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

test.afterAll(() => {
  db(`delete from copies where edition in (
    select e.id from editions e join items i on i.id = e.item
    where i.source_note = '${tag}')`);
  db(`delete from items where source_note = '${tag}'`);
});

test("a fresh account: Nothing held yet, no rows, no rail, Shopping · 0 to find", async ({
  signedIn: { page },
}) => {
  await page.goto("/collection");
  await expect(
    page.getByRole("heading", { level: 1, name: "Your collection" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Nothing held yet. Own a copy from a work's page, or tick a run on its series page.",
    ),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await expect(chips(page)).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Shopping · 0 to find" }),
  ).toHaveAttribute("href", "/collection/shopping");
});

test("the fixture: the lede, five rows, Hardcover · covers n issues, no third line, Shopping · 314 to find", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  await page.goto("/collection");
  await expect(
    page.getByText(
      "5 copies of 5 works, newest first. 38 more works are yours through what they collect.",
    ),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(5);
  await expect(
    rows(page).getByText("Hardcover · covers 8 issues", { exact: true }),
  ).toHaveCount(2);
  await expect(
    rows(page).getByText("Hardcover · covers 7 issues", { exact: true }),
  ).toHaveCount(3);
  await expect(page.getByTestId("row-third")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Shopping · 314 to find" }),
  ).toBeVisible();
  await expect(page.getByText(/A copy is a thing you hold/)).toBeVisible();
});

test("the chip rail: All picked; Comics filters; Films says Nothing here yet; the lede stays; All returns", async ({
  signedIn: { page },
}) => {
  const book = probe();
  const comic = probe("comic", "issue");
  for (const edition of [printing(book.id), printing(comic.id, "floppy")]) {
    const answer = await page.request.post("/api/v1/copies", {
      data: { edition },
    });
    expect(answer.status()).toBe(201);
  }
  const LEDE = "2 copies of 2 works, newest first.";

  await page.goto("/collection");
  await expect(rows(page)).toHaveCount(2);
  const rail = chips(page);
  await expect(rail.getByRole("link")).toHaveText([
    "All",
    "Books",
    "Comics",
    "Films",
    "TV",
  ]);
  await expect(rail.getByRole("link", { name: "All" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await rail.getByRole("link", { name: "Comics" }).click();
  await expect(page).toHaveURL("/collection?type=comic");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).getByRole("link")).toHaveText(comic.title);
  await expect(rail.getByRole("link", { name: "Comics" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText(LEDE)).toBeVisible();

  await rail.getByRole("link", { name: "Films" }).click();
  await expect(page).toHaveURL("/collection?type=film");
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText("Nothing here yet.")).toBeVisible();
  await expect(page.getByText(LEDE)).toBeVisible();

  await rail.getByRole("link", { name: "All" }).click();
  await expect(page).toHaveURL("/collection");
  await expect(rows(page)).toHaveCount(2);
});

test("a bad type and a bad before are the in-shell 404", async ({
  signedIn: { page },
}) => {
  for (const query of [
    "type=nope",
    "type=all",
    "type=book&type=film",
    "before=nope",
    `before=2026-02-30T00:00:00.000000Z,${crypto.randomUUID()}`,
  ]) {
    const response = await page.goto(`/collection?${query}`);
    expect(response?.status(), query).toBe(404);
    await expect(page.getByText("Nothing on this shelf")).toBeVisible();
  }
});

test("Older copies at 51: 50 rows, the link, one row, no link", async ({
  signedIn: { page, email },
}) => {
  fill(email, printing(probe().id), 51);
  await page.goto("/collection");
  await expect(
    page.getByText("51 copies of 1 work, newest first."),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(50);
  await expect(page.getByText("50 a page, newest first.")).toBeVisible();
  await page.getByRole("link", { name: "Older copies" }).click();
  await expect(page).toHaveURL(/\/collection\?before=/);
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Older copies" })).toHaveCount(0);
});

test("Older under a chip keeps the chip", async ({
  signedIn: { page, email },
}) => {
  fill(email, printing(probe().id), 51);
  const film = probe("film", null);
  fill(email, printing(film.id, "blu-ray"), 1);
  await page.goto("/collection?type=book");
  await expect(rows(page)).toHaveCount(50);
  await page.getByRole("link", { name: "Older copies" }).click();
  await expect(page).toHaveURL(/\/collection\?type=book&before=/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).getByRole("link")).not.toHaveText(film.title);
  await expect(
    chips(page).getByRole("link", { name: "Books" }),
  ).toHaveAttribute("aria-current", "page");
});

test("a row's three lines: a noted copy, a bare one, a film; the title links to its page", async ({
  signedIn: { page },
}) => {
  const noted = probe();
  const anchor = printing(noted.id, "paperback", "Anchor Books");
  db(`update editions set released_on = '2011-04-05', released_precision = 'day'
    where id = '${anchor}'`);
  expect(
    (
      await page.request.post("/api/v1/copies", {
        data: {
          edition: anchor,
          condition: "good",
          acquiredOn: "2019-03-12",
          note: "The one with the Sissy Spacek cover.",
        },
      })
    ).status(),
  ).toBe(201);
  const film = probe("film", null);
  db(`update items set released_on = '1976-11-03', released_precision = 'day'
    where id = '${film.id}'`);
  expect(
    (
      await page.request.post("/api/v1/copies", {
        data: { item: film.id, format: "blu-ray", condition: "fine" },
      })
    ).status(),
  ).toBe(201);
  const bare = probe();
  expect(
    (
      await page.request.post("/api/v1/copies", {
        data: { edition: printing(bare.id, "hardcover") },
      })
    ).status(),
  ).toBe(201);

  await page.goto("/collection");
  const row = (work: Probe) =>
    page.locator(`[data-testid="collection-row"][data-item="${work.id}"]`);

  await expect(row(noted).getByTestId("row-line")).toHaveText(
    "Paperback · Anchor Books · 2011",
  );
  await expect(row(noted).getByTestId("row-third")).toHaveText(
    "Good · since 12 March 2019 · The one with the Sissy Spacek cover.",
  );
  await expect(row(film).getByTestId("row-line")).toHaveText("Blu-ray · 1976");
  await expect(row(film).getByTestId("row-third")).toHaveText("Fine");
  await expect(row(bare).getByTestId("row-line")).toHaveText(
    "Hardcover · Novel",
  );
  await expect(row(bare).getByTestId("row-third")).toHaveCount(0);
  await expect(row(bare).getByRole("link")).toHaveAttribute(
    "href",
    `/items/${bare.id}`,
  );
  // Newest first.
  await expect(rows(page).getByRole("link")).toHaveText([
    bare.title,
    film.title,
    noted.title,
  ]);
});

test("Edit on a row: Format as text, Save, the third line moves with no reload", async ({
  signedIn: { page },
}) => {
  const { work } = await held(page, { condition: "fine" });
  await page.goto("/collection");
  const row = rows(page);
  await expect(row.getByTestId("row-third")).toHaveText("Fine");
  await page.evaluate(() => {
    (window as unknown as { kept: boolean }).kept = true;
  });

  await opens(page, row, "Edit this copy");
  await expect(
    sheet(page).getByRole("heading", { name: "Edit this copy" }),
  ).toBeVisible();
  await expect(sheet(page).getByLabel("Format")).toHaveCount(0);
  await expect(
    sheet(page).getByText("Paperback", { exact: true }),
  ).toBeVisible();
  await sheet(page).getByLabel("Note").fill("The Arrow disc.");
  await sheet(page).getByRole("button", { name: "Save" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(row.getByTestId("row-third")).toHaveText(
    "Fine · The Arrow disc.",
  );
  expect(
    await page.evaluate(() => (window as unknown as { kept: boolean }).kept),
  ).toBe(true);
  expect(db(`select count(*) from editions where item = '${work.id}'`)).toBe(
    "1",
  );
});

test("Remove on a row: the note's first line quoted; Cancel keeps it; Remove takes the row, the lede moves, the printing stays", async ({
  signedIn: { page },
}) => {
  await held(page);
  const { work } = await held(page, { note: "Sealed.\nNever opened." });
  await page.goto("/collection");
  await expect(rows(page)).toHaveCount(2);
  await expect(lede(page)).toHaveText("2 copies of 2 works, newest first.");

  const row = page.locator(
    `[data-testid="collection-row"][data-item="${work.id}"]`,
  );
  await opens(page, row, "Remove this copy");
  await expect(
    sheet(page).getByRole("heading", { name: "Let go of this copy?" }),
  ).toBeVisible();
  await expect(
    sheet(page).getByText(
      '"Sealed." goes with it. The printing stays in the catalog.',
    ),
  ).toBeVisible();
  await sheet(page).getByRole("button", { name: "Cancel" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(2);

  await opens(page, row, "Remove this copy");
  await sheet(page).getByRole("button", { name: "Remove" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);
  await expect(lede(page)).toHaveText("1 copy of 1 work, newest first.");
  expect(db(`select count(*) from editions where item = '${work.id}'`)).toBe(
    "1",
  );
});

test("Remove on an older page's last row: Nothing older than this", async ({
  signedIn: { page, email },
}) => {
  fill(email, printing(probe().id), 51);
  await page.goto("/collection");
  await page.getByRole("link", { name: "Older copies" }).click();
  await expect(rows(page)).toHaveCount(1);
  await opens(page, rows(page), "Remove this copy");
  await sheet(page).getByRole("button", { name: "Remove" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText("Nothing older than this.")).toBeVisible();
  await page.getByRole("link", { name: "Back to the newest" }).click();
  await expect(rows(page)).toHaveCount(50);
});

test.describe("the door this chapter opened (the plan's pick)", () => {
  test("Remove held: Cancel and Escape do nothing, then the row leaves", async ({
    signedIn: { page },
  }) => {
    const { copy } = await held(page);
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/v1/copies/${copy}`, async (route) => {
      await released;
      await route.continue();
    });
    await page.goto("/collection");
    await opens(page, rows(page), "Remove this copy");
    await sheet(page).getByRole("button", { name: "Remove" }).click();

    await expect(
      sheet(page).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeVisible();
    await expect(rows(page)).toHaveCount(1);

    release();
    await expect(sheet(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(0);
  });

  test("Remove lands and its answer is lost: the sheet's line; Remove again is done, the row gone", async ({
    signedIn: { page },
  }) => {
    const { copy } = await held(page);
    await page.route(`**/api/v1/copies/${copy}`, async (route) => {
      await route.fetch();
      await route.abort();
    });
    await page.goto("/collection");
    await opens(page, rows(page), "Remove this copy");
    await sheet(page).getByRole("button", { name: "Remove" }).click();
    await expect(sheet(page).getByRole("alert")).toHaveText(
      "Couldn't remove that copy just now. Try again.",
    );
    expect(db(`select count(*) from copies where id = '${copy}'`)).toBe("0");

    await page.unroute(`**/api/v1/copies/${copy}`);
    await sheet(page).getByRole("button", { name: "Remove" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(0);
  });

  test("Remove on a copy a second tab removed: done, no line", async ({
    signedIn: { page },
  }) => {
    const { copy } = await held(page);
    await page.goto("/collection");
    await opens(page, rows(page), "Remove this copy");
    expect((await page.request.delete(`/api/v1/copies/${copy}`)).status()).toBe(
      204,
    );
    await sheet(page).getByRole("button", { name: "Remove" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(0);
  });

  test("Edit on a copy a second tab removed: the sheet's line, Cancel reads the page again", async ({
    signedIn: { page },
  }) => {
    const { copy } = await held(page);
    await page.goto("/collection");
    await opens(page, rows(page), "Edit this copy");
    await sheet(page).getByLabel("Note").fill("Words typed.");
    expect((await page.request.delete(`/api/v1/copies/${copy}`)).status()).toBe(
      204,
    );
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page).getByRole("alert")).toHaveText(
      "No copy by that id.",
    );
    await sheet(page).getByRole("button", { name: "Cancel" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(0);
  });
});
