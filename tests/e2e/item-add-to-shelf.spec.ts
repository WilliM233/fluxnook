import { db, itemFor, loadFixturesFor } from "./harness/fixtures";
import { film, makeShelf, post, shelfId } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// The item page's door (A10): the chips as links naming the section, and
// the Add to shelf sheet, "Or a new shelf" included (Ch 1.5.3).

test("Add to shelf from the item page to the chip", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  const carrie = itemFor("manual", "carrie-1974");
  await page.goto(`/items/${carrie}`);
  const shelves = page.getByRole("region", { name: "On your shelves" });
  await expect(
    shelves.getByRole("link", { name: "Stephen King, publication order · #1" }),
  ).toHaveAttribute(
    "href",
    `/shelves/${shelfId(email, "Stephen King, publication order")}`,
  );
  // The number keeps its own element (item-page.spec.ts reads it so).
  await expect(shelves.getByText(/^#[0-9]+$/)).toHaveText("#1");

  await shelves.getByRole("button", { name: "Add to shelf" }).click();
  const sheet = page.getByRole("dialog", { name: "Add Carrie to a shelf" });
  await expect(
    sheet.getByText(
      "It goes after what's already there, in the section you pick or outside the sections. A work sits on a shelf once.",
    ),
  ).toBeVisible();
  const choice = (name: string) =>
    sheet.getByTestId("shelf-choice").filter({ hasText: name });
  await expect(
    sheet.getByRole("radio", { name: /^Stephen King, publication order/ }),
  ).toBeDisabled();
  await expect(choice("Stephen King, publication order")).toContainText(
    "Already on it, #1",
  );
  await expect(choice("TMNT, the Mirage run")).toContainText(
    "326 works · 14 sections",
  );
  await sheet.getByRole("radio", { name: /^Stephen King Watch List/ }).check();
  // The Watch List has no sections, so there is nothing to pick Into.
  await expect(sheet.getByLabel("Into")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Add to shelf" }).click();

  await expect(sheet).toBeHidden();
  const watch = shelfId(email, "Stephen King Watch List");
  const first = shelves.getByRole("link").first();
  await expect(first).toHaveText("Stephen King Watch List · #62");
  await expect(first).toHaveAttribute("href", `/shelves/${watch}`);
  expect(
    db(
      `select position from shelf_entries where shelf = '${watch}' and item = '${carrie}'`,
    ),
  ).toBe("62");
});

test("Into a section names it on the chip", async ({ signedIn: { page } }) => {
  const shelf = await makeShelf(page, { sections: [["A", 1]] });
  const work = await film(page, `Into ${shelf.tag}`, 1990);
  await page.goto(`/items/${work}`);
  const shelves = page.getByRole("region", { name: "On your shelves" });
  await expect(shelves.getByText("Not on a shelf yet.")).toBeVisible();

  await shelves.getByRole("button", { name: "Add to shelf" }).click();
  const sheet = page.getByRole("dialog", {
    name: `Add Into ${shelf.tag} to a shelf`,
  });
  await sheet
    .getByRole("radio", { name: new RegExp(`^${shelf.name}`) })
    .check();
  // Unsectioned works sit above the first section, so it isn't "the end".
  await expect(sheet.getByLabel("Into").locator("option").first()).toHaveText(
    "No section",
  );
  await sheet.getByLabel("Into").selectOption({ label: "A" });
  await sheet.getByRole("button", { name: "Add to shelf" }).click();

  await expect(sheet).toBeHidden();
  await expect(
    shelves.getByRole("link", { name: `${shelf.name} · A · #2` }),
  ).toHaveAttribute("href", `/shelves/${shelf.id}`);
  expect(
    db(`select x.name || '|' || e.position from shelf_entries e
      join shelf_sections x on x.id = e.section where e.item = '${work}'`),
  ).toBe("A|2");
});

test("Or a new shelf makes it and adds in two calls", async ({
  signedIn: { page, email },
}) => {
  const tag = crypto.randomUUID().slice(0, 8);
  const work = await film(page, `New ${tag}`, 1991);
  const calls: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path.startsWith("/api/v1/shelves")) {
      calls.push(path.endsWith("/entries") ? "entries" : path);
    }
  });
  await page.goto(`/items/${work}`);
  const shelves = page.getByRole("region", { name: "On your shelves" });
  await shelves.getByRole("button", { name: "Add to shelf" }).click();
  const sheet = page.getByRole("dialog", { name: `Add New ${tag} to a shelf` });
  await expect(
    sheet.getByText("No shelves yet. Or a new shelf, below."),
  ).toBeVisible();
  await sheet.getByRole("radio", { name: "Or a new shelf" }).check();
  await sheet.getByLabel("Name").fill(`Scratch ${tag}`);
  await sheet.getByRole("button", { name: "Add to shelf" }).click();

  await expect(sheet).toBeHidden();
  await expect(
    shelves.getByRole("link", { name: `Scratch ${tag} · #1` }),
  ).toBeVisible();
  expect(calls).toEqual(["/api/v1/shelves", "entries"]);
  expect(
    db(`select s.visibility || '|' || count(e.id) || '|' || min(e.position)
      from shelves s join auth.users u on u.id = s.owner
        left join shelf_entries e on e.shelf = s.id
      where u.email = '${email}' and s.name = 'Scratch ${tag}'
      group by s.id`),
  ).toBe("private|1|1");
});

test("a blank new-shelf name shows the field's sentence and stays", async ({
  signedIn: { page, email },
}) => {
  const work = await film(
    page,
    `Blank ${crypto.randomUUID().slice(0, 8)}`,
    1992,
  );
  await page.goto(`/items/${work}`);
  const shelves = page.getByRole("region", { name: "On your shelves" });
  await shelves.getByRole("button", { name: "Add to shelf" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: "Or a new shelf" }).check();
  await sheet.getByLabel("Name").fill("   ");
  await sheet.getByRole("button", { name: "Add to shelf" }).click();

  await expect(sheet.getByText("Give the shelf a name.")).toBeVisible();
  await expect(sheet).toBeVisible();
  expect(
    db(`select count(*) from shelves s join auth.users u on u.id = s.owner
      where u.email = '${email}'`),
  ).toBe("0");
});

test("a refused add says so and keeps the sheet", async ({
  signedIn: { page },
}) => {
  const tag = crypto.randomUUID().slice(0, 8);
  const { id } = await post(page, "/api/v1/shelves", { name: `Shelf ${tag}` });
  const work = await film(page, `Refused ${tag}`, 1993);
  await page.route("**/api/v1/shelves/*/entries", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "server_error", message: "The shelf is out to lunch." },
      }),
    }),
  );
  await page.goto(`/items/${work}`);
  const shelves = page.getByRole("region", { name: "On your shelves" });
  await shelves.getByRole("button", { name: "Add to shelf" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: new RegExp(`^Shelf ${tag}`) }).check();
  await sheet.getByRole("button", { name: "Add to shelf" }).click();

  await expect(sheet.getByRole("alert")).toHaveText(
    "The shelf is out to lunch.",
  );
  await expect(sheet).toBeVisible();
  expect(db(`select count(*) from shelf_entries where shelf = '${id}'`)).toBe(
    "0",
  );
});
