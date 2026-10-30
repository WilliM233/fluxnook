import type { Page } from "@playwright/test";
import { db } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// A10 on probe comics this file makes itself (Ch 1.4.3): the pill row, the
// Series fact, Collected in and a collected edition's Contents line. Probe
// rows under a series key no Browse volume uses, so `resetComics` and the
// serial comics spec never touch them.

const tag = `probe ${crypto.randomUUID().slice(0, 8)}`;
const KEY = `volume/99${Math.floor(Math.random() * 1e7)}`;
const RUN = `${tag} Run Vol. 1`;
const CV = "https://comicvine.gamespot.com/probe/4000-1/";

const ids = {} as Record<
  "series" | "one" | "two" | "four" | "shot" | "uc1" | "uc2" | "hc" | "tpb",
  string
>;

/** One row back from an insert ... returning id. */
const id = (sql: string) => db(sql).split("\n")[0];

function comic(
  title: string,
  form: string,
  released: string | null,
  c: { number?: number; kind?: string; series?: boolean },
) {
  const item =
    id(`insert into items (type, title, form, released_on, released_precision, source_note)
    values ('comic', '${title}', '${form}', ${released ? `'${released}', 'month'` : "null, null"}, '${tag}')
    returning id`);
  db(`insert into item_comics (item, series, series_id, series_kind, number)
    values ('${item}', ${c.series ? `'${RUN}', '${ids.series}'` : "null, null"},
      ${c.kind ? `'${c.kind}'` : "null"}, ${c.number ?? "null"})`);
  return item;
}

test.beforeAll(() => {
  ids.series =
    id(`insert into series (name, volume, year_began, year_ended, publisher)
    values ('${tag} Run', 1, 1984, 1993, 'Mirage') returning id`);
  db(
    `insert into series_sources (series, source, key) values ('${ids.series}', 'comicvine', '${KEY}')`,
  );
  const issue = { series: true, kind: "ongoing" };
  ids.one = comic(`${tag} #1`, "issue", "1984-05-01", { ...issue, number: 1 });
  ids.two = comic(`${tag} #2`, "issue", "1984-10-01", { ...issue, number: 2 });
  ids.four = comic(`${tag} #4`, "issue", "1985-06-01", { ...issue, number: 4 });
  ids.shot = comic(`${tag} Micro: Me`, "one-shot", "1985-04-01", {
    kind: "micro-series",
  });
  ids.uc1 = comic(`${tag} Collection 1`, "collected", "2011-08-01", {});
  ids.uc2 = comic(`${tag} Collection 2`, "collected", null, {});
  db(
    `update items set cover_path = 'comicvine/issue-990000001.jpg' where id = '${ids.one}'`,
  );
  db(`insert into item_sources (item, source, key, url) values
    ('${ids.one}', 'manual', '${tag}-1', null),
    ('${ids.one}', 'comicvine', 'issue/${KEY.slice(7)}', '${CV}')`);
  ids.hc =
    id(`insert into editions (item, format, released_on, released_precision, publisher)
    values ('${ids.uc1}', 'hardcover', '2011-08-01', 'month', 'IDW Publishing') returning id`);
  ids.tpb = id(
    `insert into editions (item, format) values ('${ids.uc2}', 'tpb') returning id`,
  );
  db(`insert into edition_sources (edition, source, key, url)
    values ('${ids.hc}', 'comicvine', 'issue/${KEY.slice(7)}0', '${CV}')`);
  db(`insert into edition_contents (edition, item, position) values
    ('${ids.hc}', '${ids.one}', 1), ('${ids.hc}', '${ids.two}', 2), ('${ids.hc}', '${ids.shot}', 3)`);
});

test.afterAll(() => {
  db(`delete from items where source_note = '${tag}'`);
  db(`delete from series where id = '${ids.series}'`);
});

const seriesFact = (page: Page) =>
  page.locator("dt", { hasText: "Series" }).locator("+ dd");

/** The pill and the facts beside it, in order, the dots left out. */
const pillParts = (page: Page) =>
  page.getByTestId("pills").locator(":scope > :not([aria-hidden])");

test("#1: the pill row with the series link, the Series fact, the sources, Collected in", async ({
  signedIn: { page },
}) => {
  await page.goto(`/items/${ids.one}`);
  const pills = page.getByTestId("pills");
  await expect(pillParts(page)).toHaveText([
    "Comic",
    "1984",
    `${tag} Run`,
    "Vol. 1",
    "Ongoing",
    "#1",
  ]);
  await expect(pills.getByRole("link", { name: `${tag} Run` })).toHaveAttribute(
    "href",
    `/series/${ids.series}`,
  );

  const fact = seriesFact(page);
  await expect(fact).toHaveText(`${tag} Run, Vol. 1 · #1 of 3 · next #2`);
  await expect(fact.getByRole("link", { name: "#2" })).toHaveAttribute(
    "href",
    `/items/${ids.two}`,
  );

  const sources = page.locator("dt", { hasText: "Sources" }).locator("+ dd");
  await expect(sources.getByText("Added by hand")).toBeVisible();
  await expect(
    sources.getByRole("link", { name: "Comic Vine" }),
  ).toHaveAttribute("href", CV);
  await expect(page.getByText("Cover from Comic Vine")).toBeVisible();

  const collected = page
    .getByRole("list", { name: "Collected in", exact: true })
    .getByRole("listitem");
  await expect(collected).toHaveText([
    `${tag} Collection 1 · Hardcover · 2011 · with #2, and ${tag} Micro: Me`,
  ]);
  await expect(
    collected.getByRole("link", { name: `${tag} Collection 1` }),
  ).toHaveAttribute("href", `/items/${ids.uc1}`);
});

test("#2's Series fact reads previous #1 and next #4", async ({
  signedIn: { page },
}) => {
  await page.goto(`/items/${ids.two}`);
  const fact = seriesFact(page);
  await expect(fact).toHaveText(
    `${tag} Run, Vol. 1 · #2 of 3 · previous #1 · next #4`,
  );
  await expect(fact.getByRole("link", { name: "#1" })).toHaveAttribute(
    "href",
    `/items/${ids.one}`,
  );
  await expect(fact.getByRole("link", { name: "#4" })).toHaveAttribute(
    "href",
    `/items/${ids.four}`,
  );
});

test("the one-shot: its kind, no Series fact, Collected in by its others", async ({
  signedIn: { page },
}) => {
  await page.goto(`/items/${ids.shot}`);
  await expect(pillParts(page)).toHaveText(["Comic", "1985", "Micro-series"]);
  await expect(page.locator("dt", { hasText: "Series" })).toHaveCount(0);
  await expect(
    page
      .getByRole("list", { name: "Collected in", exact: true })
      .getByRole("listitem"),
  ).toHaveText([
    `${tag} Collection 1 · Hardcover · 2011 · with ${RUN} #1 to #2`,
  ]);
});

test("a collected edition: its Contents line, the line above it, the Comic Vine link", async ({
  signedIn: { page },
}) => {
  await page.goto(`/items/${ids.uc1}`);
  await expect(
    page.getByText("Not collected in anything the catalog knows."),
  ).toBeVisible();
  const row = page
    .getByRole("region", { name: "Editions" })
    .getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row.getByText("Hardcover", { exact: true })).toBeVisible();
  await expect(
    row.getByText("IDW Publishing · 2011 · 3 issues", { exact: true }),
  ).toBeVisible();
  await expect(
    row.getByText(`Contents: ${RUN} #1 to #2, ${tag} Micro: Me`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(row.getByRole("link", { name: "Comic Vine" })).toHaveAttribute(
    "href",
    CV,
  );
});

test("an empty trade paperback: Contents nothing yet, no Comic Vine link", async ({
  signedIn: { page },
}) => {
  await page.goto(`/items/${ids.uc2}`);
  const row = page
    .getByRole("region", { name: "Editions" })
    .getByRole("listitem");
  await expect(row.getByText("Trade paperback", { exact: true })).toBeVisible();
  await expect(
    row.getByText("Contents: Nothing yet", { exact: true }),
  ).toBeVisible();
  await expect(row.getByRole("link", { name: "Comic Vine" })).toHaveCount(0);
});
