import { db } from "./harness/fixtures";
import { makeShelf } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// A7's section writes: New section, Rename, and Delete section, whose works
// move above the first section.

const region = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("region", { name, exact: true });

test("New section appends an empty heading", async ({ signedIn: { page } }) => {
  const shelf = await makeShelf(page, { sections: [["A", 1]] });
  await page.goto(`/shelves/${shelf.id}`);
  await page.getByRole("button", { name: "New section" }).click();
  const sheet = page.getByRole("dialog", { name: "New section" });
  await sheet.getByLabel("Name").fill("Scratch");
  await sheet.getByRole("button", { name: "Make section" }).click();

  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "A",
    "Scratch",
  ]);
  await expect(
    region(page, "Scratch").getByText("0 works", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("1 work · 2 sections", { exact: true }),
  ).toBeVisible();
  expect(
    db(
      `select position from shelf_sections where shelf = '${shelf.id}' and name = 'Scratch'`,
    ),
  ).toBe("2");
});

test("a name the shelf has, in another case, is refused in the sheet", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { sections: [["Carrie", 0]] });
  await page.goto(`/shelves/${shelf.id}`);
  await page.getByRole("button", { name: "New section" }).click();
  const sheet = page.getByRole("dialog", { name: "New section" });
  await sheet.getByLabel("Name").fill("carrie");
  await sheet.getByRole("button", { name: "Make section" }).click();
  await expect(
    sheet.getByText("The shelf already has a section named Carrie."),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Carrie"]);
  expect(
    db(`select count(*) from shelf_sections where shelf = '${shelf.id}'`),
  ).toBe("1");
});

test("Rename keeps the rows", async ({ signedIn: { page } }) => {
  const shelf = await makeShelf(page, { sections: [["A", 2]] });
  await page.goto(`/shelves/${shelf.id}`);
  await page.getByRole("button", { name: "Rename A" }).click();
  const sheet = page.getByRole("dialog", { name: "Rename A" });
  await expect(sheet.getByLabel("Name")).toHaveValue("A");
  await sheet.getByLabel("Name").fill("Carrie");
  await sheet.getByRole("button", { name: "Rename" }).click();

  await expect(sheet).toHaveCount(0);
  const carrie = region(page, "Carrie");
  await expect(carrie.getByTestId("entry").getByRole("link")).toHaveText([
    shelf.title("A1"),
    shelf.title("A2"),
  ]);
  await expect(carrie.getByTestId("entry").first()).toContainText("1");
  await expect(carrie.getByTestId("entry").last()).toContainText("2");
});

test("Delete section moves its rows above the first section, numbered through", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, {
    top: 1,
    sections: [
      ["A", 2],
      ["B", 1],
    ],
  });
  await page.goto(`/shelves/${shelf.id}`);
  await page.getByRole("button", { name: "Delete section A" }).click();
  const sheet = page.getByRole("dialog", { name: "Delete section" });
  await expect(
    sheet.getByText("Delete A? Its 2 works move above the first section."),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Delete section" }).click();

  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["B"]);
  const above = page.getByRole("list", { name: "Above the first section" });
  await expect(above.getByTestId("entry").getByRole("link")).toHaveText([
    shelf.title("Top1"),
    shelf.title("A1"),
    shelf.title("A2"),
  ]);
  const rows = page.getByTestId("entry");
  for (const [i, n] of ["1", "2", "3", "4"].entries()) {
    await expect(rows.nth(i).getByText(n, { exact: true })).toBeVisible();
  }
  await expect(
    page.getByText(
      "A work above the first section is on the shelf, not in a section. Drag it into one, or leave it.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("4 works · 1 section", { exact: true }),
  ).toBeVisible();
  expect(
    db(`select string_agg(coalesce(x.name, '-') || '@' || e.position, ',' order by e.position)
      from shelf_entries e left join shelf_sections x on x.id = e.section
      where e.shelf = '${shelf.id}'`),
  ).toBe("-@1,-@2,-@3,B@4");
});

test("Cancel keeps the section", async ({ signedIn: { page } }) => {
  const shelf = await makeShelf(page, { sections: [["A", 1]] });
  await page.goto(`/shelves/${shelf.id}`);
  await page.getByRole("button", { name: "Delete section A" }).click();
  const sheet = page.getByRole("dialog", { name: "Delete section" });
  await expect(
    sheet.getByText("Delete A? Its 1 work moves above the first section."),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["A"]);
  expect(
    db(`select count(*) from shelf_sections where shelf = '${shelf.id}'`),
  ).toBe("1");
});
