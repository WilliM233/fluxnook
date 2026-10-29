import type { Page } from "@playwright/test";
import { db, loadFixturesFor } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// A7's comics group on the three stubs and the loaded fixtures (Ch 1.4.1).
// Serial: the `in` test claims the 1984 volume's key with a series row of its
// own, and every test reads that row's status.
test.describe.configure({ mode: "serial" });

const TAG = "search-comics e2e";

function resetSeries() {
  db(`delete from series where name = '${TAG}'`);
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

test("the 1984 row: its year, the Series pill, its line, the looks-like line and no Add", async ({
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
  await expect(row.getByRole("button", { name: "Add" })).toHaveCount(0);
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
