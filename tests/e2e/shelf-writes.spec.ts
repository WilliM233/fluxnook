import { db } from "./harness/fixtures";
import { makeShelf } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// A7's writes on the shelf itself: Edit shelf, Delete shelf and its
// confirm, and Remove on a row.

const words = (id: string) =>
  db(`select name || '|' || description from shelves where id = '${id}'`);

test("Edit shelf renames and the header follows", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 1 });
  await page.goto(`/shelves/${shelf.id}`);
  await page.getByRole("button", { name: "Edit shelf" }).click();
  const sheet = page.getByRole("dialog", { name: `Edit ${shelf.name}` });
  await expect(sheet.getByLabel("Name")).toHaveValue(shelf.name);
  await expect(sheet.getByLabel("Description")).toHaveValue("");

  await sheet.getByLabel("Name").fill(`Renamed ${shelf.tag}`);
  await sheet.getByLabel("Description").fill("The book, then its films.");
  await sheet.getByRole("button", { name: "Save" }).click();

  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `Renamed ${shelf.tag}`,
  );
  await expect(page.getByText("The book, then its films.")).toBeVisible();
  expect(words(shelf.id)).toBe(
    `Renamed ${shelf.tag}|The book, then its films.`,
  );
});

test("a blank name in Edit shelf shows the field's sentence and stays", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, {});
  await page.goto(`/shelves/${shelf.id}`);
  await page.getByRole("button", { name: "Edit shelf" }).click();
  const sheet = page.getByRole("dialog", { name: `Edit ${shelf.name}` });
  await sheet.getByLabel("Name").fill("   ");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Give the shelf a name.")).toBeVisible();
  await expect(sheet).toBeVisible();
  expect(words(shelf.id)).toBe(`${shelf.name}|`);
});

test("an unchanged Save moves nothing", async ({ signedIn: { page } }) => {
  const shelf = await makeShelf(page, { top: 1 });
  const touched = () =>
    db(`select updated_at from shelves where id = '${shelf.id}'`);
  const before = touched();
  await page.goto(`/shelves/${shelf.id}`);
  await page.getByRole("button", { name: "Edit shelf" }).click();
  const sheet = page.getByRole("dialog", { name: `Edit ${shelf.name}` });
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  expect(touched()).toBe(before);
});

test("Delete shelf asks once and lands on the nook", async ({
  signedIn: { page, email },
}) => {
  const shelf = await makeShelf(page, { top: 2 });
  const items = db(
    `select string_agg(item::text, ',' order by item) from shelf_entries where shelf = '${shelf.id}'`,
  );
  await page.goto(`/shelves/${shelf.id}`);
  await page.getByRole("button", { name: "Delete shelf" }).click();
  const sheet = page.getByRole("dialog", { name: "Delete shelf" });
  await expect(
    sheet.getByText(
      `Delete ${shelf.name} and its 2 works from it? The works stay in the catalog.`,
    ),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Delete shelf" }).click();

  await expect(page).toHaveURL(/\/nook$/);
  await expect(page.getByRole("heading", { name: shelf.name })).toHaveCount(0);
  expect(
    db(`select count(*) from shelves s join auth.users u on u.id = s.owner
      where u.email = '${email}'`),
  ).toBe("0");
  const [a, b] = items.split(",");
  expect(db(`select count(*) from items where id in ('${a}', '${b}')`)).toBe(
    "2",
  );
});

test("Cancel on the confirm deletes nothing", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 1 });
  await page.goto(`/shelves/${shelf.id}`);
  await page.getByRole("button", { name: "Delete shelf" }).click();
  const sheet = page.getByRole("dialog", { name: "Delete shelf" });
  await expect(
    sheet.getByText(
      `Delete ${shelf.name} and its 1 work from it? The works stay in the catalog.`,
    ),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/shelves/${shelf.id}$`));
  expect(db(`select count(*) from shelves where id = '${shelf.id}'`)).toBe("1");
});

test("Remove takes the row off and closes the gap", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 3 });
  const removed = db(
    `select item from shelf_entries where shelf = '${shelf.id}' and position = 2`,
  );
  await page.goto(`/shelves/${shelf.id}`);
  await page
    .getByRole("button", { name: `Remove ${shelf.title("Top2")}` })
    .click();

  const rows = page.getByTestId("entry");
  await expect(rows.getByRole("link")).toHaveText([
    shelf.title("Top1"),
    shelf.title("Top3"),
  ]);
  await expect(rows.nth(1).getByText("2", { exact: true })).toBeVisible();
  await expect(page.getByText("2 works", { exact: true })).toBeVisible();
  expect(
    db(`select count(*) from shelf_entries where shelf = '${shelf.id}'`),
  ).toBe("2");
  expect(db(`select count(*) from items where id = '${removed}'`)).toBe("1");
});

test("an empty shelf's confirm says it holds no works", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, {});
  await page.goto(`/shelves/${shelf.id}`);
  await page.getByRole("button", { name: "Delete shelf" }).click();
  const sheet = page.getByRole("dialog", { name: "Delete shelf" });
  await expect(
    sheet.getByText(`Delete ${shelf.name}? It holds no works.`),
  ).toBeVisible();
});
