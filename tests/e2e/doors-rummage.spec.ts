import { db } from "./harness/fixtures";
import { film, post } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// The Raccoon's Rummage for 1.5.3 (section 4b of
// docs/plans/1.5.3-three-doors.md): the doors on a stale page, a second call
// that throws, a run past what a query string carries, a question asked
// twice. Each was seen red on the branch at 70cbc73.

const uuids = (n: number) =>
  Array.from({ length: n }, () => crypto.randomUUID());

test("R1 the GET takes the 500 works A3 says it does, signed in", async ({
  signedIn: { page },
}) => {
  // 350 is under the Deferral's "about 430"; 500 is A3's cap. A signed-in
  // session's cookies ride the same 16,384-byte header budget as the URL.
  for (const n of [350, 500]) {
    const response = await page.request.get(
      `/api/v1/shelves?items=${uuids(n).join(",")}`,
    );
    expect(response.status(), `${n} works asked about`).toBe(200);
  }
});

test("R2 a 350-issue run's sheet lists your shelves", async ({
  signedIn: { page },
}) => {
  const tag = crypto.randomUUID().slice(0, 8);
  const series = db(
    `insert into series (name) values ('Rummage ${tag}') returning id`,
  ).split("\n")[0];
  db(`with made as (
      insert into items (type, title, form)
      select 'comic', 'Rummage ${tag} #' || g, 'issue' from generate_series(1, 350) g
      returning id, title)
    insert into item_comics (item, series_id, number)
    select id, '${series}', split_part(title, '#', 2)::int from made`);
  try {
    await post(page, "/api/v1/shelves", { name: `Shelf ${tag}` });
    await page.goto(`/series/${series}`);
    await page.getByRole("button", { name: "Add the run to a shelf" }).click();
    const sheet = page.getByRole("dialog", {
      name: "Add 350 issues to a shelf",
    });
    await expect(
      sheet.getByRole("radio", { name: new RegExp(`^Shelf ${tag}`) }),
    ).toBeVisible();
    await expect(sheet.getByRole("alert")).toHaveCount(0);
  } finally {
    db(`delete from items where id in
      (select item from item_comics where series_id = '${series}')`);
    db(`delete from series where id = '${series}'`);
  }
});

test("R3 a shelf another tab put the work on is disabled, Already on it", async ({
  signedIn: { page },
}) => {
  const tag = crypto.randomUUID().slice(0, 8);
  const { id: shelf } = await post(page, "/api/v1/shelves", {
    name: `Shelf ${tag}`,
  });
  const work = await film(page, `Stale ${tag}`, 1994);
  await page.goto(`/items/${work}`);
  const shelves = page.getByRole("region", { name: "On your shelves" });
  await expect(shelves.getByText("Not on a shelf yet.")).toBeVisible();

  // The other tab.
  await post(page, `/api/v1/shelves/${shelf}/entries`, { items: [work] });

  await shelves.getByRole("button", { name: "Add to shelf" }).click();
  const sheet = page.getByRole("dialog");
  await expect(
    sheet.getByRole("radio", { name: new RegExp(`^Shelf ${tag}`) }),
  ).toBeDisabled();
  await expect(
    sheet.getByTestId("shelf-choice").filter({ hasText: `Shelf ${tag}` }),
  ).toContainText("Already on it");
});

test("R4 a shelf another tab took the work off can be picked again", async ({
  signedIn: { page },
}) => {
  const tag = crypto.randomUUID().slice(0, 8);
  const { id: shelf } = await post(page, "/api/v1/shelves", {
    name: `Shelf ${tag}`,
  });
  const work = await film(page, `Gone ${tag}`, 1995);
  await post(page, `/api/v1/shelves/${shelf}/entries`, { items: [work] });
  await page.goto(`/items/${work}`);
  const shelves = page.getByRole("region", { name: "On your shelves" });
  await expect(
    shelves.getByRole("link", { name: `Shelf ${tag} · #1` }),
  ).toBeVisible();

  // The other tab.
  const entry = db(
    `select id from shelf_entries where shelf = '${shelf}' and item = '${work}'`,
  );
  const removed = await page.request.delete(
    `/api/v1/shelves/${shelf}/entries/${entry}`,
  );
  expect(removed.status()).toBe(204);

  await shelves.getByRole("button", { name: "Add to shelf" }).click();
  const sheet = page.getByRole("dialog");
  await expect(
    sheet.getByRole("radio", { name: new RegExp(`^Shelf ${tag}`) }),
  ).toBeEnabled();
});

test("R5 Or a new shelf says the shelf was made when the second call never answers", async ({
  signedIn: { page, email },
}) => {
  const tag = crypto.randomUUID().slice(0, 8);
  const work = await film(page, `Thrown ${tag}`, 1996);
  await page.route("**/api/v1/shelves/*/entries", (route) =>
    route.abort("connectionreset"),
  );
  await page.goto(`/items/${work}`);
  await page
    .getByRole("region", { name: "On your shelves" })
    .getByRole("button", { name: "Add to shelf" })
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: "Or a new shelf" }).check();
  await sheet.getByLabel("Name").fill(`Made ${tag}`);
  await sheet.getByRole("button", { name: "Add to shelf" }).click();

  await expect(sheet.getByRole("alert")).toContainText("The shelf was made");
  expect(
    db(`select count(*) from shelves s join auth.users u on u.id = s.owner
      where u.email = '${email}' and s.name = 'Made ${tag}'`),
  ).toBe("1");
});

test("R6 a question asked twice is refused, not half-answered", async ({
  signedIn: { page },
}) => {
  const [a, b] = uuids(2);
  for (const query of [`item=${a}&item=${b}`, `items=${a}&items=${b}`]) {
    const response = await page.request.get(`/api/v1/shelves?${query}`);
    expect(response.status(), query).toBe(400);
  }
});
