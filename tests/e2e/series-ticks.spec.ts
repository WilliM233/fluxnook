import type { Locator, Page } from "@playwright/test";
import { db } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// A8 on a probe run this file makes for each test: three issues and one
// collected work whose hardcover holds #1 and #2, under a series key no Browse
// volume uses, so `resetComics` and the comics spec never touch them. The real
// run is `search-comics.spec.ts`'s: a second file on that key would delete its
// series mid-test.

const OWN = "I own this";

type Run = {
  series: string;
  one: string;
  two: string;
  three: string;
  trade: string;
  hardcover: string;
  title: (n: number) => string;
  tradeTitle: string;
};

const runs: { tag: string; series: string }[] = [];

/** One row back from an insert ... returning id. */
const id = (sql: string) => db(sql).split("\n")[0];

function makeRun(): Run {
  const tag = `ticks ${crypto.randomUUID().slice(0, 8)}`;
  const key = `volume/98${Math.floor(Math.random() * 1e7)}`;
  const series = id(
    `insert into series (name, volume) values ('${tag} Run', 1) returning id`,
  );
  runs.push({ tag, series });
  db(
    `insert into series_sources (series, source, key) values ('${series}', 'comicvine', '${key}')`,
  );
  const title = (n: number) => `${tag} #${n}`;
  const comic = (name: string, form: string, month: number, number: string) => {
    const item =
      id(`insert into items (type, title, form, released_on, released_precision, source_note)
      values ('comic', '${name}', '${form}', '1984-${month}-01', 'month', '${tag}') returning id`);
    db(`insert into item_comics (item, series_id, number)
      values ('${item}', '${series}', ${number})`);
    return item;
  };
  const one = comic(title(1), "issue", 1, "1");
  const two = comic(title(2), "issue", 2, "2");
  const three = comic(title(3), "issue", 3, "3");
  const tradeTitle = `${tag} Trade`;
  const trade = comic(tradeTitle, "collected", 4, "null");
  const hardcover = id(
    `insert into editions (item, format) values ('${trade}', 'hardcover') returning id`,
  );
  db(`insert into edition_contents (edition, item, position) values
    ('${hardcover}', '${one}', 1), ('${hardcover}', '${two}', 2)`);
  return { series, one, two, three, trade, hardcover, title, tradeTitle };
}

const ownerOf = (email: string) =>
  db(`select id from auth.users where email = '${email}'`);

/** A copy written by SQL: the state a test starts from, not what it tests. */
function hold(email: string, edition: string) {
  db(
    `insert into copies (owner, edition) values ('${ownerOf(email)}', '${edition}')`,
  );
}

test.afterEach(() => {
  for (const { tag, series } of runs.splice(0)) {
    db(`delete from copies where edition in (
      select e.id from editions e join items i on i.id = e.item
      where i.source_note = '${tag}')`);
    db(`delete from items where source_note = '${tag}'`);
    db(`delete from series where id = '${series}'`);
  }
});

const heading = (page: Page) =>
  page.getByText(/in the catalog, in cover-date order/);
const tile = (page: Page, title: string) =>
  page
    .getByRole("list", { name: "Issues" })
    .getByRole("listitem")
    .filter({
      has: page.getByRole("link", { name: title, exact: true }),
    });
const collectedRow = (page: Page, title: string) =>
  page
    .getByRole("list", { name: "Collected in" })
    .getByRole("listitem")
    .filter({
      has: page.getByRole("link", { name: title, exact: true }),
    });

test("nothing held: the heading has no holding, no via line, the Collected in row ends in I own this", async ({
  signedIn: { page },
}) => {
  const run = makeRun();
  await page.goto(`/series/${run.series}`);
  await expect(heading(page)).toHaveText(
    "4 in the catalog, in cover-date order",
  );
  await expect(page.getByTestId("tile-via")).toHaveCount(0);
  await expect(
    collectedRow(page, run.tradeTitle).getByRole("button"),
  ).toHaveText(OWN);
});

test("a collection held: you hold 3, 2 of them via a collection; #1 and #2 read via it; its row ends Your copy; the note and the closing line as drawn", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  hold(email, run.hardcover);
  await page.goto(`/series/${run.series}`);
  await expect(heading(page)).toHaveText(
    "4 in the catalog, in cover-date order · you hold 3, 2 of them via a collection",
  );
  await expect(tile(page, run.title(1)).getByTestId("tile-via")).toHaveText(
    `via ${run.tradeTitle}`,
  );
  await expect(tile(page, run.title(2)).getByTestId("tile-via")).toHaveText(
    `via ${run.tradeTitle}`,
  );
  await expect(tile(page, run.title(3)).getByTestId("tile-via")).toHaveCount(0);
  await expect(
    collectedRow(page, run.tradeTitle).getByText("Your copy"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "An edition whose contents hold an issue of this run. One you hold covers its issues above.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "A tick makes a floppy of that issue yours; untick to let it go. An issue a collection you hold already covers says so, and can still be ticked when you hold the floppy too.",
    ),
  ).toBeVisible();
});

test("I own this on a Collected in row: Your copy, the tiles it holds read via, the heading counts them, with no reload", async ({
  signedIn: { page },
}) => {
  const run = makeRun();
  await page.goto(`/series/${run.series}`);
  const row = collectedRow(page, run.tradeTitle);
  await expect(heading(page)).toHaveText(
    "4 in the catalog, in cover-date order",
  );
  // Prove hydration by opening a sheet first: a retry here would be a second copy.
  await expect(async () => {
    await page.getByRole("button", { name: "Add the run to a shelf" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 500 });
  }).toPass();
  await page.getByRole("button", { name: "Cancel" }).click();

  await row.getByRole("button", { name: OWN }).click();
  await expect(row.getByText("Your copy")).toBeVisible();
  await expect(tile(page, run.title(1)).getByTestId("tile-via")).toHaveText(
    `via ${run.tradeTitle}`,
  );
  await expect(heading(page)).toHaveText(
    "4 in the catalog, in cover-date order · you hold 3, 2 of them via a collection",
  );
});

test("a collected tile has no box and reads Your copy when held", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  await page.goto(`/series/${run.series}`);
  const trade = tile(page, run.tradeTitle);
  await expect(trade.getByRole("link", { name: run.tradeTitle })).toBeVisible();
  await expect(trade.getByRole("checkbox")).toHaveCount(0);
  await expect(trade.getByText("Your copy")).toHaveCount(0);

  hold(email, run.hardcover);
  await page.reload();
  await expect(trade.getByText("Your copy")).toBeVisible();
  await expect(trade.getByRole("checkbox")).toHaveCount(0);
});

/** The box of a tile, once the page can answer it (hydration is its `disabled`). */
async function box(page: Page, title: string) {
  const found = tile(page, title).getByRole("checkbox", {
    name: `Owned, ${title}`,
  });
  await expect(found).toBeEnabled();
  return found;
}
const label = (page: Page, title: string) =>
  tile(page, title).getByTestId("tick-label");
const line = (page: Page) =>
  page.getByRole("alert").filter({ hasText: "Couldn't change that" });
/** A box takes no click until its own refresh lands; a retry here would be a second copy. */
const settled = (box: Locator) =>
  expect(box).toHaveAttribute("aria-busy", "false");

/** The caller's copies of this work, by SQL. */
const copiesOf = (email: string, item: string) =>
  Number(
    db(`select count(*) from copies c join editions e on e.id = c.edition
      where c.owner = '${ownerOf(email)}' and e.item = '${item}'`),
  );
/** A floppy printing of this work, and a copy of it with these words on it. */
function floppy(
  email: string,
  item: string,
  words: { condition?: string; note?: string; acquiredOn?: string } = {},
) {
  const edition =
    db(
      `select id from editions where item = '${item}' and format = 'floppy'`,
    ) ||
    id(
      `insert into editions (item, format) values ('${item}', 'floppy') returning id`,
    );
  return id(`insert into copies (owner, edition, condition, note, acquired_on)
    values ('${ownerOf(email)}', '${edition}',
      ${words.condition ? `'${words.condition}'` : "null"},
      '${words.note ?? ""}',
      ${words.acquiredOn ? `'${words.acquiredOn}'` : "null"}) returning id`);
}

/** Holds the matching request until released; `seen` counts every match. */
async function hold1(
  page: Page,
  method: string,
  match: (url: URL, body: { item?: string } | null) => boolean,
) {
  const held = { seen: 0, release: () => {}, fail: () => {} };
  const arrived = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<"go" | "fail">();
  held.release = () => gate.resolve("go");
  held.fail = () => gate.resolve("fail");
  await page.route(
    (url) => match(url, null),
    async (route) => {
      const request = route.request();
      const body = request.method() === "POST" ? request.postDataJSON() : null;
      if (request.method() !== method || !match(new URL(request.url()), body)) {
        await route.fallback();
        return;
      }
      held.seen += 1;
      arrived.resolve();
      if ((await gate.promise) === "fail") {
        await route.fulfill({ status: 500, json: { error: {} } });
      } else {
        await route.continue();
      }
    },
  );
  return { held, arrived: arrived.promise };
}
const copiesRoute = (url: URL) => url.pathname === "/api/v1/copies";
const oneCopyRoute = (url: URL) => url.pathname.startsWith("/api/v1/copies/");
const theRead = (url: URL) =>
  url.pathname === "/api/v1/copies" && url.searchParams.has("item");

test("the server's HTML has every box disabled, and it enables", async ({
  signedIn: { page },
}) => {
  const run = makeRun();
  const html = await (await page.request.get(`/series/${run.series}`)).text();
  const boxes = html.match(/<input[^>]*data-testid="tick"[^>]*>/g) ?? [];
  expect(boxes).toHaveLength(3);
  expect(boxes.every((b) => b.includes('disabled=""'))).toBe(true);

  await page.goto(`/series/${run.series}`);
  for (const n of [1, 2, 3]) {
    await expect(await box(page, run.title(n))).not.toBeChecked();
  }
});

test("a tick makes one floppy: the printing, the copy, the label, the heading", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  await page.goto(`/series/${run.series}`);
  await expect(label(page, run.title(3))).toHaveText("Owned");
  const three = await box(page, run.title(3));
  await three.click();
  await expect(label(page, run.title(3))).toHaveText("Owned · Floppy");
  await expect(three).toBeChecked();
  await expect(heading(page)).toHaveText(
    "4 in the catalog, in cover-date order · you hold 1",
  );
  expect(
    db(`select format, title, publisher, pages, released_on from editions
      where item = '${run.three}'`),
  ).toBe("floppy||||");
  expect(
    db(`select condition, note, visibility, owner = '${ownerOf(email)}' from copies c
      join editions e on e.id = c.edition where e.item = '${run.three}'`),
  ).toBe("||private|t");
});

test("a tick on an issue a collection covers reads also via and the heading doesn't move", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  hold(email, run.hardcover);
  await page.goto(`/series/${run.series}`);
  const holding =
    "4 in the catalog, in cover-date order · you hold 3, 2 of them via a collection";
  await expect(heading(page)).toHaveText(holding);
  const via = tile(page, run.title(1)).getByTestId("tile-via");
  await expect(via).toHaveText(`via ${run.tradeTitle}`);

  await (await box(page, run.title(1))).click();
  await expect(label(page, run.title(1))).toHaveText("Owned · Floppy");
  await expect(via).toHaveText(`also via ${run.tradeTitle}`);
  await page.reload();
  await expect(via).toHaveText(`also via ${run.tradeTitle}`);
  await expect(heading(page)).toHaveText(holding);
});

test("a second tick after an untick uses the same printing", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  await page.goto(`/series/${run.series}`);
  const three = await box(page, run.title(3));
  await three.click();
  await expect(label(page, run.title(3))).toHaveText("Owned · Floppy");
  expect(copiesOf(email, run.three)).toBe(1);
  await settled(three);
  await three.click();
  await expect(label(page, run.title(3))).toHaveText("Owned");
  expect(copiesOf(email, run.three)).toBe(0);
  await expect(heading(page)).not.toContainText("you hold");
  await settled(three);
  await three.click();
  await expect(label(page, run.title(3))).toHaveText("Owned · Floppy");
  expect(copiesOf(email, run.three)).toBe(1);
  expect(db(`select count(*) from editions where item = '${run.three}'`)).toBe(
    "1",
  );
});

test("an untick with no words deletes with no confirm and leaves the printing", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  floppy(email, run.three, { acquiredOn: "2019-03-12" });
  await page.goto(`/series/${run.series}`);
  await expect(label(page, run.title(3))).toHaveText("Owned · Floppy");
  await (await box(page, run.title(3))).click();
  await expect(label(page, run.title(3))).toHaveText("Owned");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(heading(page)).not.toContainText("you hold");
  expect(copiesOf(email, run.three)).toBe(0);
  expect(db(`select count(*) from editions where item = '${run.three}'`)).toBe(
    "1",
  );
});

test("a floppy with only a condition asks in its own words", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  floppy(email, run.three, { condition: "good" });
  await page.goto(`/series/${run.series}`);
  await (await box(page, run.title(3))).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Let go of this floppy?")).toBeVisible();
  await expect(sheet.getByText("Its condition goes with it.")).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(await box(page, run.title(3))).toBeChecked();
  expect(copiesOf(email, run.three)).toBe(1);
});

test("A14: an untick on a noted floppy: the confirm, Cancel keeps it", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  floppy(email, run.three, { note: "Signed." });
  await page.goto(`/series/${run.series}`);
  let deletes = 0;
  page.on("request", (request) => {
    if (request.method() === "DELETE") deletes += 1;
  });

  const three = await box(page, run.title(3));
  await three.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Let go of this floppy?")).toBeVisible();
  await expect(sheet.getByText("Its note goes with it.")).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(three).toBeChecked();
  await expect(label(page, run.title(3))).toHaveText("Owned · Floppy");
  expect(deletes).toBe(0);
  expect(
    db(`select note from copies c join editions e on e.id = c.edition
      where e.item = '${run.three}'`),
  ).toBe("Signed.");

  // Remove takes it, once the page has read again behind the Cancel.
  await settled(three);
  await three.click();
  await sheet.getByRole("button", { name: "Remove" }).click();
  await expect(label(page, run.title(3))).toHaveText("Owned");
  await expect(three).not.toBeChecked();
  expect(copiesOf(email, run.three)).toBe(0);
});

test("A14: the tick's route answered 500: the box back and the line", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  await page.goto(`/series/${run.series}`);
  await page.route("**/api/v1/copies", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 500, json: { error: {} } })
      : route.fallback(),
  );
  const three = await box(page, run.title(3));
  await three.click();
  await expect(line(page)).toHaveCount(1);
  await expect(line(page)).toHaveText("Couldn't change that. Try again.");
  await expect(three).not.toBeChecked();
  await expect(label(page, run.title(3))).toHaveText("Owned");
  expect(copiesOf(email, run.three)).toBe(0);

  // The route off, a tick lands and the line is gone. The box takes it once the
  // page has read again behind the refusal (Rummage S1).
  await page.unroute("**/api/v1/copies");
  await settled(three);
  await three.click();
  await expect(label(page, run.title(3))).toHaveText("Owned · Floppy");
  await expect(line(page)).toHaveCount(0);
  expect(copiesOf(email, run.three)).toBe(1);
});

test("the untick's DELETE answered 500: the box ticked and the line", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  floppy(email, run.three);
  await page.goto(`/series/${run.series}`);
  await page.route("**/api/v1/copies/*", (route) =>
    route.fulfill({ status: 500, json: { error: {} } }),
  );
  const three = await box(page, run.title(3));
  await three.click();
  await expect(line(page)).toHaveCount(1);
  await expect(three).toBeChecked();
  await expect(label(page, run.title(3))).toHaveText("Owned · Floppy");
  expect(copiesOf(email, run.three)).toBe(1);
});

test("the untick's read answered 500: the same, nothing deleted", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  floppy(email, run.three);
  await page.goto(`/series/${run.series}`);
  let deletes = 0;
  page.on("request", (request) => {
    if (request.method() === "DELETE") deletes += 1;
  });
  await page.route(theRead, (route) =>
    route.fulfill({ status: 500, json: { error: {} } }),
  );
  const three = await box(page, run.title(3));
  await three.click();
  await expect(line(page)).toHaveCount(1);
  await expect(three).toBeChecked();
  expect(deletes).toBe(0);
  expect(copiesOf(email, run.three)).toBe(1);
});

test("two floppies: the label; an untick takes the newest and the box stays ticked at Owned · Floppy", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  const older = floppy(email, run.three);
  floppy(email, run.three);
  await page.goto(`/series/${run.series}`);
  await expect(label(page, run.title(3))).toHaveText("Owned · 2 floppies");
  const three = await box(page, run.title(3));
  await three.click();
  await expect(label(page, run.title(3))).toHaveText("Owned · Floppy");
  await expect(three).toBeChecked();
  expect(
    db(`select c.id from copies c join editions e on e.id = c.edition
      where e.item = '${run.three}'`),
  ).toBe(older);
});

test("a noted older floppy doesn't ask, a noted newest does", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  floppy(email, run.three, { note: "Older, signed." });
  floppy(email, run.three);
  await page.goto(`/series/${run.series}`);
  const three = await box(page, run.title(3));
  await three.click();
  await expect(label(page, run.title(3))).toHaveText("Owned · Floppy");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    db(`select note from copies c join editions e on e.id = c.edition
      where e.item = '${run.three}'`),
  ).toBe("Older, signed.");

  // Now the only one is the noted one, and it asks.
  await settled(three);
  await three.click();
  await expect(
    page.getByRole("dialog").getByText("Its note goes with it."),
  ).toBeVisible();
});

test("a second tab ticks the issue between the click and the answer: both copies stand and the tile reads 2 floppies", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  await page.goto(`/series/${run.series}`);
  const { held, arrived } = await hold1(page, "POST", copiesRoute);
  const three = await box(page, run.title(3));
  await three.click();
  await arrived;
  await expect(three).toBeChecked();

  const other = await page.context().newPage();
  await other.goto(`/series/${run.series}`);
  await (await box(other, run.title(3))).click();
  await expect(label(other, run.title(3))).toHaveText("Owned · Floppy");
  expect(copiesOf(email, run.three)).toBe(1);

  held.release();
  await expect(label(page, run.title(3))).toHaveText("Owned · 2 floppies");
  await expect(three).toBeChecked();
  await expect(line(page)).toHaveCount(0);
  await expect(heading(page)).toContainText("you hold 1");
  expect(copiesOf(email, run.three)).toBe(2);
  expect(db(`select count(*) from editions where item = '${run.three}'`)).toBe(
    "1",
  );
  await other.close();
});

test("a second tab lets the floppy go between the click and the answer: no line, the box empty", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  floppy(email, run.three);
  await page.goto(`/series/${run.series}`);
  const { held, arrived } = await hold1(page, "DELETE", oneCopyRoute);
  const three = await box(page, run.title(3));
  await three.click();
  await arrived;

  const other = await page.context().newPage();
  await other.goto(`/series/${run.series}`);
  await (await box(other, run.title(3))).click();
  await expect(label(other, run.title(3))).toHaveText("Owned");
  expect(copiesOf(email, run.three)).toBe(0);

  held.release();
  await expect(label(page, run.title(3))).toHaveText("Owned");
  await expect(three).not.toBeChecked();
  await expect(line(page)).toHaveCount(0);
  await other.close();
});

test("a note saved in a second tab after the load: the untick asks", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  const copy = floppy(email, run.three);
  await page.goto(`/series/${run.series}`);
  const three = await box(page, run.title(3));
  const saved = await page.request.patch(`/api/v1/copies/${copy}`, {
    data: { note: "Saved elsewhere." },
  });
  expect(saved.status()).toBe(200);

  await three.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Its note goes with it.")).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(three).toBeChecked();
  expect(db(`select note from copies where id = '${copy}'`)).toBe(
    "Saved elsewhere.",
  );
});

test("the floppy gone in a second tab before the click: no line, no DELETE, the box empty", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  const copy = floppy(email, run.three);
  await page.goto(`/series/${run.series}`);
  const three = await box(page, run.title(3));
  db(`delete from copies where id = '${copy}'`);
  let deletes = 0;
  page.on("request", (request) => {
    if (request.method() === "DELETE") deletes += 1;
  });

  await three.click();
  await expect(three).not.toBeChecked();
  await expect(label(page, run.title(3))).toHaveText("Owned");
  await expect(line(page)).toHaveCount(0);
  expect(deletes).toBe(0);
});

test("a tick slowed past a second click posts once", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  await page.goto(`/series/${run.series}`);
  const { held, arrived } = await hold1(page, "POST", copiesRoute);
  const three = await box(page, run.title(3));
  await three.click();
  await arrived;
  await expect(three).toBeChecked();

  await three.dispatchEvent("click");
  await expect(three).toBeChecked();
  expect(held.seen).toBe(1);

  held.release();
  await expect(label(page, run.title(3))).toHaveText("Owned · Floppy");
  expect(held.seen).toBe(1);
  expect(copiesOf(email, run.three)).toBe(1);
});

test("an untick slowed past a second click deletes once and posts nothing", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  floppy(email, run.three);
  await page.goto(`/series/${run.series}`);
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") posts += 1;
  });
  const { held, arrived } = await hold1(page, "DELETE", oneCopyRoute);
  const three = await box(page, run.title(3));
  await three.click();
  await arrived;
  await expect(three).not.toBeChecked();

  await three.dispatchEvent("click");
  await expect(three).not.toBeChecked();
  expect(held.seen).toBe(1);
  expect(posts).toBe(0);

  held.release();
  await expect(label(page, run.title(3))).toHaveText("Owned");
  await expect(three).not.toBeChecked();
  expect(held.seen).toBe(1);
  expect(posts).toBe(0);
  expect(copiesOf(email, run.three)).toBe(0);
});

test("a neighbour's tick and its refresh land while this one is held: both stand", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  await page.goto(`/series/${run.series}`);
  const { held, arrived } = await hold1(
    page,
    "POST",
    (url, body) =>
      copiesRoute(url) && (body === null || body.item === run.three),
  );
  const three = await box(page, run.title(3));
  await three.click();
  await arrived;

  await (await box(page, run.title(2))).click();
  await expect(label(page, run.title(2))).toHaveText("Owned · Floppy");
  await expect(heading(page)).toContainText("you hold 1");
  await expect(three).toBeChecked();
  await expect(line(page)).toHaveCount(0);

  held.release();
  await expect(label(page, run.title(3))).toHaveText("Owned · Floppy");
  await expect(label(page, run.title(2))).toHaveText("Owned · Floppy");
  await expect(heading(page)).toContainText("you hold 2");
  expect(copiesOf(email, run.three)).toBe(1);
  expect(copiesOf(email, run.two)).toBe(1);
});

test("held past a neighbour's refresh, then refused: the box back and the line, the neighbour kept", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  await page.goto(`/series/${run.series}`);
  const { held, arrived } = await hold1(
    page,
    "POST",
    (url, body) =>
      copiesRoute(url) && (body === null || body.item === run.three),
  );
  const three = await box(page, run.title(3));
  await three.click();
  await arrived;

  const two = await box(page, run.title(2));
  await two.click();
  await expect(label(page, run.title(2))).toHaveText("Owned · Floppy");
  await expect(heading(page)).toContainText("you hold 1");

  held.fail();
  await expect(line(page)).toHaveCount(1);
  await expect(three).not.toBeChecked();
  await expect(two).toBeChecked();
  expect(copiesOf(email, run.three)).toBe(0);
  expect(copiesOf(email, run.two)).toBe(1);
});
