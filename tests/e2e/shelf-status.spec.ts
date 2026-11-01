import { db, loadFixturesFor } from "./harness/fixtures";
import { makeShelf, shelfId } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// A9: the three-way status on every row, and the counts that follow it.

const statuses = (id: string) =>
  db(
    `select string_agg(status, ',' order by position) from shelf_entries where shelf = '${id}'`,
  );

test("Done and Skipped update the row, the section line and the header", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 1, sections: [["A", 2]] });
  await page.goto(`/shelves/${shelf.id}`);
  await expect(
    page.getByText("3 works · 1 section", { exact: true }),
  ).toBeVisible();

  const top = page.getByRole("group", {
    name: `Status of ${shelf.title("Top1")}`,
  });
  await top.getByRole("button", { name: "Done" }).click();
  await expect(
    top.getByRole("button", { name: "Done", pressed: true }),
  ).toBeVisible();
  await expect(
    page.getByText("3 works · 1 done · 1 section", { exact: true }),
  ).toBeVisible();

  const a2 = page.getByRole("group", {
    name: `Status of ${shelf.title("A2")}`,
  });
  await a2.getByRole("button", { name: "Skipped" }).click();
  await expect(page.getByRole("link", { name: shelf.title("A2") })).toHaveCSS(
    "text-decoration-line",
    "line-through",
  );
  const section = page.getByRole("region", { name: "A", exact: true });
  await expect(
    section.getByText("2 works · 1 skipped", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("3 works · 1 done · 1 skipped · 1 section", { exact: true }),
  ).toBeVisible();

  expect(statuses(shelf.id)).toBe("done,unmarked,skipped");
});

test("Unmarked again clears it", async ({ signedIn: { page } }) => {
  const shelf = await makeShelf(page, { top: 1, sections: [["A", 2]] });
  await page.goto(`/shelves/${shelf.id}`);
  const top = page.getByRole("group", {
    name: `Status of ${shelf.title("Top1")}`,
  });
  await top.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByText("3 works · 1 done · 1 section", { exact: true }),
  ).toBeVisible();
  await top.getByRole("button", { name: "Unmarked" }).click();
  await expect(
    page.getByText("3 works · 1 section", { exact: true }),
  ).toBeVisible();
  await expect(
    top.getByRole("button", { name: "Unmarked", pressed: true }),
  ).toBeVisible();
  expect(statuses(shelf.id)).toBe("unmarked,unmarked,unmarked");
});

test("the group is named Status of <title> and the current button is pressed", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 2 });
  await page.goto(`/shelves/${shelf.id}`);
  for (const label of ["Top1", "Top2"]) {
    const group = page.getByRole("group", {
      name: `Status of ${shelf.title(label)}`,
    });
    await expect(group.getByRole("button")).toHaveText([
      "Unmarked",
      "Done",
      "Skipped",
    ]);
    await expect(
      group.getByRole("button", { name: "Unmarked", pressed: true }),
    ).toBeVisible();
    await expect(
      group.getByRole("button", { name: "Done", pressed: false }),
    ).toBeVisible();
  }
});

test("a 500 on the status leaves the row as it was and says so", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 1 });
  await page.route(`**/api/v1/shelves/${shelf.id}/entries/*`, (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, body: "" })
      : route.continue(),
  );
  await page.goto(`/shelves/${shelf.id}`);
  const top = page.getByRole("group", {
    name: `Status of ${shelf.title("Top1")}`,
  });
  await top.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Couldn't save that. Try again.")).toBeVisible();
  await expect(
    top.getByRole("button", { name: "Unmarked", pressed: true }),
  ).toBeVisible();
  await expect(page.getByText("1 work", { exact: true })).toBeVisible();
  expect(statuses(shelf.id)).toBe("unmarked");
});

test("the fixture's 26 done occurrences mark no entry", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  const owner = `(select id from auth.users where email = '${email}')`;
  expect(
    db(
      `select count(*) from occurrences where owner = ${owner} and status = 'done'`,
    ),
  ).toBe("26");
  await page.goto(`/shelves/${shelfId(email, "TMNT, the Mirage run")}`);
  await expect(
    page.getByText("326 works · 14 sections", { exact: true }),
  ).toBeVisible();
  expect(
    db(`select count(*) from shelf_entries e join shelves s on s.id = e.shelf
      where s.owner = ${owner} and e.status = 'done'`),
  ).toBe("0");
});
