import type { Page } from "@playwright/test";
import { db, itemFor, loadFixturesFor, resetComics } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// A7's comics group on the three stubs and the loaded fixtures (Ch 1.4.1),
// and from 1.4.2 the import and the series page. Serial: the `in` test
// claims the 1984 volume's key with a series row of its own, the imports
// attach onto the fixture rows every other test reads, and each test starts
// from the loader's rows.
test.describe.configure({ mode: "serial" });

const TAG = "search-comics e2e";

function resetSeries() {
  resetComics();
  db(`delete from series where name = '${TAG}'`);
  db(`delete from items where title like '${TAG}%'`);
}

test.beforeEach(() => resetSeries());
test.afterAll(() => resetSeries());

const TURTLES = "/search?q=teenage%20mutant%20ninja%20turtles";

// Comic Vine has twenty volumes by this name; the year and publisher pick one.
function seriesRow(page: Page, year: number, line: string) {
  return page
    .getByRole("list", { name: "Comic series", exact: true })
    .getByRole("listitem")
    .filter({ has: page.getByText(String(year), { exact: true }) })
    .filter({ has: page.getByText(line, { exact: true }) });
}

test("Comics asks Comic Vine only, and rides the URL", async ({
  signedIn: { page },
}) => {
  await page.goto(TURTLES);
  await page.getByRole("button", { name: "Comics" }).click();
  await expect(page).toHaveURL(
    "/search?q=teenage+mutant+ninja+turtles&type=comic",
  );
  await expect(page.getByRole("button", { name: "Comics" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("list", { name: "Comic series", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "Results" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Books" })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Comic series · from Comic Vine" }),
  ).toBeVisible();
});

test("the 1984 row: its year, the Series pill, its line, the looks-like line and Add", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  await page.goto(`${TURTLES}&type=comic`);
  const row = seriesRow(page, 1984, "Mirage · 62 issues");
  await expect(row).toHaveCount(1);
  await expect(row.getByText("Series", { exact: true })).toBeVisible();
  await expect(
    row.getByText(
      "Looks like one you have: Teenage Mutant Ninja Turtles (Mirage) Vol. 1, 62 issues added by hand",
    ),
  ).toBeVisible();
  await expect(row.getByRole("button", { name: "Add" })).toBeVisible();
  // The cover from the stub, at Comic Vine's path on the stub's origin.
  await expect(row.locator("img")).toHaveAttribute(
    "src",
    /^http:\/\/127\.0\.0\.1:4012\/a\/uploads\//,
  );
  await expect(
    page.getByText(
      "Add brings the series and every issue Comic Vine lists for it into the catalog.",
      { exact: false },
    ),
  ).toBeVisible();
});

test("the 1996 Image row looks like the Image Vol. 3; the IDW 2011 and TM-Semic rows say nothing", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  await page.goto(`${TURTLES}&type=comic`);
  await expect(
    seriesRow(page, 1996, "Image · 23 issues").getByText(
      "Looks like one you have: Teenage Mutant Ninja Turtles (Image) Vol. 3, 23 issues added by hand",
    ),
  ).toBeVisible();
  for (const row of [
    seriesRow(page, 2011, "IDW Publishing · 150 issues"),
    seriesRow(page, 1993, "TM-Semic · 3 issues"),
  ]) {
    await expect(row).toHaveCount(1);
    await expect(row.getByText(/Looks like|In your catalog/)).toHaveCount(0);
  }
});

test("All shows three groups in order, the comics label linking to Comic Vine", async ({
  signedIn: { page },
}) => {
  await page.goto(TURTLES);
  const headings = page.getByRole("heading", { level: 2 });
  await expect(
    page.getByRole("heading", { name: "Comic series · from Comic Vine" }),
  ).toBeVisible();
  await expect(headings).toHaveText([
    "Films and TV · from TMDB",
    "Books · from Open Library",
    "Comic series · from Comic Vine",
  ]);
  await expect(
    page
      .getByRole("heading", { name: "Comic series · from Comic Vine" })
      .getByRole("link", { name: "Comic Vine" }),
  ).toHaveAttribute("href", "https://comicvine.gamespot.com");
});

test("the TMNT Ultimate Collection says 5 collected editions added by hand", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  await page.goto(
    "/search?q=teenage%20mutant%20ninja%20turtles%20ultimate%20collection&type=comic",
  );
  await expect(
    seriesRow(page, 2011, "IDW Publishing · 7 issues").getByText(
      "Looks like one you have: 5 collected editions added by hand",
    ),
  ).toBeVisible();
});

test("a volume whose key is a series' source says In your catalog, with Open to its page", async ({
  signedIn: { page },
}) => {
  const id = db(
    `insert into series (name) values ('${TAG}') returning id`,
  ).split("\n")[0];
  db(
    `insert into series_sources (series, source, key) values ('${id}', 'comicvine', 'volume/20281')`,
  );
  await page.goto(`${TURTLES}&type=comic`);
  const row = seriesRow(page, 1984, "Mirage · 62 issues");
  await expect(row.getByText("In your catalog")).toBeVisible();
  await expect(row.getByRole("link", { name: "Open" })).toHaveAttribute(
    "href",
    `/series/${id}`,
  );
});

// Rummage R4 (1.4.1): a run entered by hand can be one issue long, and the
// fixture has nine such groups. The line is written for many.
test("a one-issue group says 1 issue, not 1 issues", async ({
  signedIn: { page },
}) => {
  const id = db(
    `insert into items (type, title, form, released_on, released_precision) values ('comic', '${TAG} The Works 1', 'issue', '2013-06-01', 'month') returning id`,
  ).split("\n")[0];
  db(
    `insert into item_comics (item, series, number) values ('${id}', 'Teenage Mutant Ninja Turtles: The Works', 1)`,
  );
  await page.goto(`${TURTLES}&type=comic`);
  const row = seriesRow(page, 2013, "IDW Publishing · 5 issues");
  await expect(
    row.getByText(
      "Looks like one you have: Teenage Mutant Ninja Turtles: The Works, 1 issue added by hand",
    ),
  ).toBeVisible();
});

test("Comic Vine down: its group says so, the other two still answer", async ({
  signedIn: { page },
}) => {
  await page.goto("/search?q=__comicvine_down__");
  await expect(
    page.getByText("Comic Vine didn't answer. Try again in a moment."),
  ).toBeVisible();
  await expect(page.getByText("Nothing by that name at TMDB.")).toBeVisible();
  await expect(
    page.getByText("Nothing by that name at Open Library."),
  ).toBeVisible();
});

test("Comic Vine busy: the group says so", async ({ signedIn: { page } }) => {
  await page.goto("/search?q=__comicvine_busy__&type=comic");
  await expect(
    page.getByText("Comic Vine is busy. Try again in a few minutes."),
  ).toBeVisible();
});

test("the hint names three providers and the way to add one by hand", async ({
  signedIn: { page },
}) => {
  await page.goto("/search");
  await expect(
    page.getByText("Results from TMDB, Open Library and Comic Vine."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add one by hand" }),
  ).toHaveAttribute("href", "/items/new");
});

const MIRAGE_VOL_1 = "Teenage Mutant Ninja Turtles (Mirage) Vol. 1";

test.describe("the series page", () => {
  test("the 1984 run attached by the route: the header, the lede, the facts, 62 tiles in order", async ({
    signedIn: { page, email },
  }) => {
    loadFixturesFor(email);
    const response = await page.request.post("/api/v1/series/import", {
      data: {
        source: "comicvine",
        key: "volume/20281",
        form: "issue",
        attachTo: { series: MIRAGE_VOL_1 },
      },
    });
    expect(response.status()).toBe(201);
    const { id, attached } = await response.json();
    expect(attached).toBe(62);

    await page.goto(`/series/${id}`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Teenage Mutant Ninja Turtles",
      }),
    ).toBeVisible();
    await expect(page.getByText("1984 to 1993", { exact: true })).toBeVisible();
    await expect(page.getByText("62 issues", { exact: true })).toBeVisible();
    await expect(page.getByText("Vol. 1. Volume 1.")).toBeVisible();
    await expect(
      page.getByRole("definition").filter({ hasText: /^Mirage$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Comic Vine" }),
    ).toHaveAttribute(
      "href",
      "https://comicvine.gamespot.com/teenage-mutant-ninja-turtles/4050-20281/",
    );
    await expect(
      page.getByText("62 in the catalog, in cover-date order"),
    ).toBeVisible();
    const tiles = page
      .getByRole("list", { name: "Issues", exact: true })
      .getByRole("listitem");
    await expect(tiles).toHaveCount(62);
    const first = tiles.first();
    await expect(first.getByText("#1 · May 1984")).toBeVisible();
    await expect(
      first.getByRole("link", { name: "The Turtles' Origin is Told" }),
    ).toHaveAttribute(
      "href",
      `/items/${itemFor("manual", "tmnt-mirage-v1-1")}`,
    );
    await expect(first.locator("img")).toHaveAttribute(
      "src",
      /\/storage\/v1\/object\/public\/covers\/comicvine\/issue-121041\.jpg$/,
    );
  });

  test("a run with no end year prints its start alone", async ({
    signedIn: { page },
  }) => {
    const id = db(
      `insert into series (name, year_began, publisher) values ('${TAG}', 2011, 'IDW Publishing') returning id`,
    ).split("\n")[0];
    await page.goto(`/series/${id}`);
    await expect(page.getByText("2011", { exact: true })).toBeVisible();
    await expect(
      page.getByText("IDW Publishing", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("0 issues", { exact: true })).toBeVisible();
    await expect(page.getByText("None in the catalog.")).toBeVisible();
  });

  test("a bad uuid and an unknown one are the in-shell not-found", async ({
    signedIn: { page },
  }) => {
    for (const path of [
      "/series/not-a-uuid",
      `/series/${crypto.randomUUID()}`,
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: "Nothing on this shelf" }),
      ).toBeVisible();
    }
  });
});

// An import runs 62 covers through the stub before it answers.
const LANDS = { timeout: 30_000 };

test.describe("the import sheet", () => {
  test("Same on 1984 attaches the run: the two sides, Single issues, the series page, then In your catalog", async ({
    signedIn: { page, email },
  }) => {
    loadFixturesFor(email);
    await page.goto(`${TURTLES}&type=comic`);
    await seriesRow(page, 1984, "Mirage · 62 issues")
      .getByRole("button", { name: "Add" })
      .click();
    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByRole("heading", {
        name: "Is this one already in your catalog?",
      }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("region", { name: "From Comic Vine" }),
    ).toContainText("1984 · Mirage · 62 issues");
    const held = sheet.getByRole("region", { name: "In your catalog" });
    await expect(held).toContainText(MIRAGE_VOL_1);
    await expect(held).toContainText(
      "62 issues added by hand · first issue 1984 · on TMNT, the Mirage run",
    );
    await expect(
      sheet.getByRole("radio", { name: "Single issues" }),
    ).toBeChecked();
    await sheet
      .getByRole("button", { name: "Same, add Comic Vine's details to it" })
      .click();
    await expect(page).toHaveURL(/\/series\/[0-9a-f-]{36}$/, LANDS);
    const series = page.url().split("/series/")[1];
    const tiles = page
      .getByRole("list", { name: "Issues", exact: true })
      .getByRole("listitem");
    await expect(tiles).toHaveCount(62);
    await expect(
      tiles.nth(2).getByRole("link", { name: "The Great Chase" }),
    ).toBeVisible();

    await page.goto(`${TURTLES}&type=comic`);
    const row = seriesRow(page, 1984, "Mirage · 62 issues");
    await expect(row.getByText("In your catalog")).toBeVisible();
    await expect(row.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      `/series/${series}`,
    );
  });

  test("Different on 1984 makes a second run, titled by Comic Vine, and leaves the fixture's alone", async ({
    signedIn: { page, email },
  }) => {
    loadFixturesFor(email);
    await page.goto(`${TURTLES}&type=comic`);
    await seriesRow(page, 1984, "Mirage · 62 issues")
      .getByRole("button", { name: "Add" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Different, add as a new run" })
      .click();
    await expect(page).toHaveURL(/\/series\/[0-9a-f-]{36}$/, LANDS);
    const tiles = page
      .getByRole("list", { name: "Issues", exact: true })
      .getByRole("listitem");
    await expect(tiles).toHaveCount(62);
    await expect(
      tiles
        .first()
        .getByRole("link", { name: "Teenage Mutant Ninja Turtles #1" }),
    ).toBeVisible();
    await expect(
      tiles.nth(1).getByRole("link", { name: "TMNT vs. the Mousers" }),
    ).toBeVisible();
    const fixtureOne = itemFor("manual", "tmnt-mirage-v1-1");
    expect(
      db(
        `select i.title || '|' || coalesce(c.series_id::text, 'none') from items i join item_comics c on c.item = i.id where i.id = '${fixtureOne}'`,
      ),
    ).toBe("The Turtles' Origin is Told|none");
  });

  test("Tales of the TMNT is new; the select picks the Tales Vol. 2 group, and Add lands on 71 tiles", async ({
    signedIn: { page, email },
  }) => {
    loadFixturesFor(email);
    await page.goto("/search?q=tales%20of%20the%20tmnt&type=comic");
    const row = seriesRow(page, 2004, "Mirage · 71 issues");
    await expect(row.getByText(/Looks like|In your catalog/)).toHaveCount(0);
    await row.getByRole("button", { name: "Add" }).click();
    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByRole("heading", { name: "Add this series" }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("region", { name: "In your catalog" }),
    ).toHaveCount(0);
    await sheet
      .getByRole("combobox", { name: "Same as a run you added by hand?" })
      .selectOption({
        label: "Tales of the Teenage Mutant Ninja Turtles Vol. 2, 70 issues",
      });
    await sheet.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page).toHaveURL(/\/series\/[0-9a-f-]{36}$/, LANDS);
    await expect(page.getByText("2004 to 2011", { exact: true })).toBeVisible();
    await expect(page.getByText("71 issues", { exact: true })).toBeVisible();
    const tiles = page
      .getByRole("list", { name: "Issues", exact: true })
      .getByRole("listitem");
    await expect(tiles).toHaveCount(71);
    const last = tiles.last();
    await expect(last.getByText("#71 · June 2011")).toBeVisible();
    await expect(
      last.getByRole("link", { name: "The Paradox of Chudnovsky" }),
    ).toBeVisible();
  });

  test("the Ultimate Collection: Collected and Hardcover preselected, the five on the catalog side, Same lands on 7 tiles", async ({
    signedIn: { page, email },
  }) => {
    loadFixturesFor(email);
    await page.goto(
      "/search?q=teenage%20mutant%20ninja%20turtles%20ultimate%20collection&type=comic",
    );
    await seriesRow(page, 2011, "IDW Publishing · 7 issues")
      .getByRole("button", { name: "Add" })
      .click();
    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByRole("radio", { name: "Collected editions" }),
    ).toBeChecked();
    await expect(sheet.getByRole("combobox", { name: "Format" })).toHaveValue(
      "hardcover",
    );
    const held = sheet.getByRole("region", { name: "In your catalog" });
    await expect(held).toContainText("Ultimate Collection");
    await expect(held).toContainText("5 collected editions added by hand");
    await sheet
      .getByRole("button", { name: "Same, add Comic Vine's details to it" })
      .click();
    await expect(page).toHaveURL(/\/series\/[0-9a-f-]{36}$/, LANDS);
    await expect(page.getByText("2011 to 2023", { exact: true })).toBeVisible();
    await expect(
      page.getByText("IDW Publishing", { exact: true }).first(),
    ).toBeVisible();
    const tiles = page
      .getByRole("list", { name: "Issues", exact: true })
      .getByRole("listitem");
    await expect(tiles).toHaveCount(7);
    await expect(
      tiles.getByRole("link", { name: "Ultimate Collection 6" }),
    ).toBeVisible();
    await expect(
      tiles.getByRole("link", { name: "Ultimate Collection 1" }),
    ).toBeVisible();
  });

  test("a run attached elsewhere while the sheet is open: Same shows the 409, nothing written", async ({
    signedIn: { page, email },
  }) => {
    loadFixturesFor(email);
    await page.goto(`${TURTLES}&type=comic`);
    await seriesRow(page, 1984, "Mirage · 62 issues")
      .getByRole("button", { name: "Add" })
      .click();
    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByRole("region", { name: "In your catalog" }),
    ).toBeVisible();
    // Another tab attaches the fixture's #1 to some other volume meanwhile.
    const fixtureOne = itemFor("manual", "tmnt-mirage-v1-1");
    db(
      `insert into item_sources (item, source, key) values ('${fixtureOne}', 'comicvine', 'issue/999999999')`,
    );
    const before = db("select count(*) from items");
    await sheet
      .getByRole("button", { name: "Same, add Comic Vine's details to it" })
      .click();
    await expect(sheet.getByRole("alert")).toHaveText(
      "That run is already attached to another Comic Vine volume.",
      LANDS,
    );
    expect(db("select count(*) from items")).toBe(before);
    expect(
      db("select count(*) from series_sources where key = 'volume/20281'"),
    ).toBe("0");
    db("delete from item_sources where key = 'issue/999999999'");
  });

  test("choosing Single issues takes the collected stems out of the select", async ({
    signedIn: { page, email },
  }) => {
    loadFixturesFor(email);
    await page.goto("/search?q=tales%20of%20the%20tmnt&type=comic");
    await seriesRow(page, 2004, "Mirage · 71 issues")
      .getByRole("button", { name: "Add" })
      .click();
    const sheet = page.getByRole("dialog");
    const select = sheet.getByRole("combobox", {
      name: "Same as a run you added by hand?",
    });
    const stem = select.getByRole("option", {
      name: "Ultimate Collection, 5 collected editions",
    });
    await expect(stem).toHaveCount(0);
    await sheet.getByRole("radio", { name: "Collected editions" }).check();
    await expect(stem).toHaveCount(1);
    await select.selectOption({
      label: "Ultimate Collection, 5 collected editions",
    });
    await sheet.getByRole("radio", { name: "Single issues" }).check();
    await expect(stem).toHaveCount(0);
    await expect(select).toHaveValue("");
  });
});
