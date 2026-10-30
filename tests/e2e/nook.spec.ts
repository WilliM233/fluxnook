import { db, loadFixturesFor } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// A6: the nook as the shelf list, on the fixtures, and New shelf to its page.

const shelfId = (email: string, name: string) =>
  db(`select s.id from shelves s join auth.users u on u.id = s.owner
    where u.email = '${email}' and s.name = '${name.replaceAll("'", "''")}'`);

test("three cards and the counts", async ({ signedIn: { page, email } }) => {
  loadFixturesFor(email);
  await page.goto("/nook");
  await expect(
    page.getByRole("heading", { level: 1, name: "Your nook" }),
  ).toBeVisible();
  await expect(page.getByText("3 shelves · 398 works on them")).toBeVisible();

  const cards = page
    .getByRole("list", { name: "Your shelves" })
    .getByRole("listitem");
  await expect(cards).toHaveCount(3);
  const names = [
    "TMNT, the Mirage run",
    "Stephen King Watch List",
    "Stephen King, publication order",
  ];
  await expect(cards.getByRole("heading", { level: 2 })).toHaveText(names);
  for (const [i, name] of names.entries()) {
    await expect(cards.nth(i).getByRole("link")).toHaveAttribute(
      "href",
      `/shelves/${shelfId(email, name)}`,
    );
  }

  const [tmnt, watch, books] = [cards.nth(0), cards.nth(1), cards.nth(2)];
  await expect(tmnt.getByText("326 works · 14 sections")).toBeVisible();
  await expect(tmnt.getByText("no cover")).toHaveCount(5);
  await expect(tmnt.getByText("+321")).toBeVisible();
  await expect(watch.getByText("61 works · from Letterboxd")).toBeVisible();
  await expect(watch.getByText("no poster")).toHaveCount(5);
  await expect(watch.getByText("+56")).toBeVisible();
  await expect(books.getByText("11 works · from Letterboxd")).toBeVisible();
  await expect(books.getByText("+6")).toBeVisible();
});

test("two across at desktop width, one across at phone width", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  const cards = page
    .getByRole("list", { name: "Your shelves" })
    .getByRole("listitem");

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/nook");
  const [a, b] = [
    await cards.nth(0).boundingBox(),
    await cards.nth(1).boundingBox(),
  ];
  expect(a && b && a.y === b.y && b.x > a.x).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  const [c, d] = [
    await cards.nth(0).boundingBox(),
    await cards.nth(1).boundingBox(),
  ];
  expect(c && d && d.y >= c.y + c.height).toBe(true);
});

test("a nook with no shelves says so, beside New shelf", async ({
  signedIn: { page },
}) => {
  await page.goto("/nook");
  await expect(
    page.getByText("No shelves yet. Make one and it stops being quiet."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "New shelf" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Your shelves" })).toHaveCount(0);
});

test("New shelf makes the shelf and lands on its page", async ({
  signedIn: { page, email },
}) => {
  await page.goto("/nook");
  await page.getByRole("button", { name: "New shelf" }).click();
  const sheet = page.getByRole("dialog", { name: "New shelf" });
  await sheet.getByLabel("Name").fill("Stephen King, in order");
  await sheet
    .getByLabel("Description")
    .fill("The book, then its films, one work per section.");
  await sheet.getByRole("button", { name: "Make shelf" }).click();

  await expect(page).toHaveURL(/\/shelves\/[0-9a-f-]{36}$/);
  const id = shelfId(email, "Stephen King, in order");
  expect(page.url()).toContain(`/shelves/${id}`);
  expect(
    db(
      `select description || ' | ' || visibility from shelves where id = '${id}'`,
    ),
  ).toBe("The book, then its films, one work per section. | private");
});

test("a blank name shows the field's sentence and stays on the sheet", async ({
  signedIn: { page, email },
}) => {
  await page.goto("/nook");
  await page.getByRole("button", { name: "New shelf" }).click();
  const sheet = page.getByRole("dialog", { name: "New shelf" });
  await sheet.getByLabel("Name").fill("   ");
  await sheet.getByRole("button", { name: "Make shelf" }).click();
  await expect(sheet.getByText("Give the shelf a name.")).toBeVisible();
  await expect(page).toHaveURL("/nook");
  expect(
    db(`select count(*) from shelves s join auth.users u on u.id = s.owner
      where u.email = '${email}'`),
  ).toBe("0");
});
