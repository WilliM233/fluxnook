import { db } from "./harness/fixtures";
import { film, post } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// The Raccoon's Rummage for 1.5.3 (section 4b of
// docs/plans/1.5.3-three-doors.md): the doors on a stale page, a second call
// that throws, a run past what a query string carries, a question asked
// twice. Each was seen red on the branch at 70cbc73.

const uuids = (n: number) =>
  Array.from({ length: n }, () => crypto.randomUUID());

test("R1 the GET takes the 200 works A3 says it does, signed in, and refuses 201 itself", async ({
  signedIn: { page },
}) => {
  // A signed-in session's cookies ride the same 16,384-byte header budget as
  // the URL, so 500 never reached the route (431 from ~345). L's call on B1:
  // the cap is 200 and the sheet asks in chunks. 201 is the route's own 400,
  // with a sentence, never Node's bare 431.
  const at = (n: number) =>
    page.request.get(`/api/v1/shelves?items=${uuids(n).join(",")}`);
  expect((await at(200)).status(), "200 works asked about").toBe(200);
  const over = await at(201);
  expect(over.status(), "201 works asked about").toBe(400);
  expect((await over.json()).error.fields).toEqual({
    items: "At most 200 works in one go.",
  });
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
