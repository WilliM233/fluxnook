import type { Locator, Page } from "@playwright/test";
import { db } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// The Raccoon's list for 1.7.2, the tile's half; the card's is in
// `search-isbn.spec.ts` and `search-books.spec.ts`, which hold those rows. Probe runs as `series-ticks.spec.ts` builds them,
// under a key no Browse volume uses.

type Run = {
  series: string;
  one: string;
  two: string;
  three: string;
  hardcover: string;
  title: (n: number) => string;
  tradeTitle: string;
};

const runs: { tag: string; series: string }[] = [];
const id = (sql: string) => db(sql).split("\n")[0];

function makeRun(): Run {
  const tag = `raccoon ${crypto.randomUUID().slice(0, 8)}`;
  const key = `volume/97${Math.floor(Math.random() * 1e7)}`;
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
  return { series, one, two, three, hardcover, title, tradeTitle };
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

const ownerOf = (email: string) =>
  db(`select id from auth.users where email = '${email}'`);
const tile = (page: Page, title: string) =>
  page
    .getByRole("list", { name: "Issues" })
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) });
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
const settled = (found: Locator) =>
  expect(found).toHaveAttribute("aria-busy", "false");
const copiesOf = (email: string, item: string) =>
  Number(
    db(`select count(*) from copies c join editions e on e.id = c.edition
      where c.owner = '${ownerOf(email)}' and e.item = '${item}'`),
  );
function floppy(
  email: string,
  item: string,
  words: { condition?: string; note?: string } = {},
) {
  const edition =
    db(
      `select id from editions where item = '${item}' and format = 'floppy'`,
    ) ||
    id(
      `insert into editions (item, format) values ('${item}', 'floppy') returning id`,
    );
  return id(`insert into copies (owner, edition, condition, note)
    values ('${ownerOf(email)}', '${edition}',
      ${words.condition ? `'${words.condition}'` : "null"},
      '${words.note ?? ""}') returning id`);
}
const copiesPath = (url: URL) => url.pathname === "/api/v1/copies";
const oneCopyPath = (url: URL) => url.pathname.startsWith("/api/v1/copies/");

test("R1 a tick that landed and lost its answer: the tile reads what the server holds", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  await page.goto(`/series/${run.series}`);
  let lost = false;
  await page.route(copiesPath, async (route) => {
    if (route.request().method() !== "POST" || lost) return route.fallback();
    lost = true;
    await route.fetch();
    await route.abort("connectionreset");
  });
  const three = await box(page, run.title(3));
  await three.click();
  await expect(line(page)).toHaveCount(1);
  expect(copiesOf(email, run.three)).toBe(1);
  // The line says try again; a box left empty over a copy makes that a second one.
  await expect(label(page, run.title(3))).toHaveText("Owned · Floppy");
  await expect(three).toBeChecked();
});

test("R2 a tick refused because the issue is gone: the tile goes with it", async ({
  signedIn: { page },
}) => {
  const run = makeRun();
  await page.goto(`/series/${run.series}`);
  const three = await box(page, run.title(3));
  db(`delete from items where id = '${run.three}'`);
  await three.click();
  await expect(line(page)).toHaveCount(1);
  await expect(tile(page, run.title(3))).toHaveCount(0);
});

test("R3 Cancel past a slow Remove: the sheet stays until the answer says what happened", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  floppy(email, run.three, { note: "Signed." });
  await page.goto(`/series/${run.series}`);
  const gate = Promise.withResolvers<void>();
  const arrived = Promise.withResolvers<void>();
  await page.route(oneCopyPath, async (route) => {
    arrived.resolve();
    await gate.promise;
    await route.continue();
  });
  const three = await box(page, run.title(3));
  await three.click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Remove" }).click();
  await arrived.promise;

  // Cancel, then Escape, while the DELETE is out. A14's "Cancel keeps it" is the
  // only promise this sheet makes; a closed sheet over a delete in flight breaks it.
  await sheet
    .getByRole("button", { name: "Cancel" })
    .click({ timeout: 1_000 })
    .catch(() => {});
  await page.keyboard.press("Escape");
  await expect(sheet).toBeVisible();

  gate.resolve();
  await expect(sheet).toHaveCount(0);
  await expect(label(page, run.title(3))).toHaveText("Owned");
  expect(copiesOf(email, run.three)).toBe(0);
});

test("R4 what the untick's read learned survives Cancel: a second floppy from another tab stays on the label", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  floppy(email, run.three);
  await page.goto(`/series/${run.series}`);
  await expect(label(page, run.title(3))).toHaveText("Owned · Floppy");
  const three = await box(page, run.title(3));

  floppy(email, run.three, { note: "From the other tab." });
  await three.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Its note goes with it.")).toBeVisible();
  // The modal hides the page from role queries, so this one goes by the attribute.
  await expect(
    page
      .locator("li", { has: page.locator(`a[href="/items/${run.three}"]`) })
      .getByTestId("tick-label"),
  ).toHaveText("Owned · 2 floppies");
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await settled(three);
  await expect(label(page, run.title(3))).toHaveText("Owned · 2 floppies");
});

test("R5 the via line moves on the answer, not the click: a held tick isn't also via yet, and a refused one never was", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  db(
    `insert into copies (owner, edition) values ('${ownerOf(email)}', '${run.hardcover}')`,
  );
  await page.goto(`/series/${run.series}`);
  const via = tile(page, run.title(1)).getByTestId("tile-via");
  await expect(via).toHaveText(`via ${run.tradeTitle}`);
  const gate = Promise.withResolvers<void>();
  const arrived = Promise.withResolvers<void>();
  await page.route(copiesPath, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    arrived.resolve();
    await gate.promise;
    await route.fulfill({ status: 500, json: { error: {} } });
  });
  await (await box(page, run.title(1))).click();
  await arrived.promise;
  await expect(label(page, run.title(1))).toHaveText("Owned");
  await expect(via).toHaveText(`via ${run.tradeTitle}`);
  gate.resolve();
  await expect(line(page)).toHaveCount(1);
  await expect(via).toHaveText(`via ${run.tradeTitle}`);
});
