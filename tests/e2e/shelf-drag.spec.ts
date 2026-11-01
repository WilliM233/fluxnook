import type { Page } from "@playwright/test";
import { db, loadFixturesFor } from "./harness/fixtures";
import { makeShelf, shelfId, shelfOrder } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// A8 by keyboard: the grip, Space, the arrows, Space or Escape; the live
// region; the move answered 500 (A13's sixth red). The pointer path is the
// Browse's, by hand.

/** dnd-kit's one live region. */
const live = (page: Page) => page.locator('[id^="DndLiveRegion"]');

/**
 * Picks a row up by its grip and presses each key, waiting for the region to
 * speak. dnd-kit listens for the next key a tick after the pick-up, so the
 * region naming the work (picked up, or over its own place at once) is the
 * signal to go on.
 */
async function pickUp(page: Page, title: string, keys: string[]) {
  const grip = page.getByRole("button", { name: `Reorder ${title}` });
  await grip.focus();
  await page.keyboard.press("Space");
  await expect(grip).toHaveAttribute("aria-pressed", "true");
  await expect(live(page)).toContainText(title);
  for (const key of keys) {
    const before = (await live(page).textContent()) ?? "";
    await page.keyboard.press(key);
    await expect(live(page)).not.toHaveText(before);
  }
}

/** Counts the move PATCHes the page sends for a shelf. */
async function countMoves(page: Page, shelf: string) {
  const sent = { moves: 0 };
  await page.route(`**/api/v1/shelves/${shelf}/entries/*`, (route) => {
    if (route.request().method() === "PATCH") sent.moves += 1;
    return route.continue();
  });
  return sent;
}

const region = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });

test("a keyboard move across a section boundary reads the new number and the live region says so", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, {
    sections: [
      ["A", 2],
      ["B", 2],
    ],
  });
  const a1 = shelf.title("A1");
  await page.goto(`/shelves/${shelf.id}`);
  await pickUp(page, a1, ["ArrowDown", "ArrowDown"]);
  await page.keyboard.press("Space");

  await expect(live(page)).toHaveText(`${a1} moved to B, number 2`);
  const b = region(page, "B").getByTestId("entry");
  await expect(b.first().getByRole("link")).toHaveText(a1);
  await expect(b.first().getByText("2", { exact: true })).toBeVisible();
  await expect(region(page, "A").getByTestId("entry")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: `Reorder ${a1}` }),
  ).toBeFocused();
  // The page shows the move before the route answers; the table follows.
  await expect
    .poll(() => shelfOrder(shelf.id))
    .toBe(
      [
        `${shelf.title("A2")}@1`,
        `${a1}@2`,
        `${shelf.title("B1")}@3`,
        `${shelf.title("B2")}@4`,
      ].join(","),
    );
  expect(
    db(`select x.name from shelf_entries e join shelf_sections x on x.id = e.section
      join items i on i.id = e.item where i.title = '${a1}'`),
  ).toBe("B");
});

test("Escape puts it back", async ({ signedIn: { page } }) => {
  const shelf = await makeShelf(page, { sections: [["A", 3]] });
  const before = shelfOrder(shelf.id);
  const sent = await countMoves(page, shelf.id);
  await page.goto(`/shelves/${shelf.id}`);
  await pickUp(page, shelf.title("A1"), ["ArrowDown"]);
  await page.keyboard.press("Escape");

  await expect(live(page)).toHaveText(`${shelf.title("A1")} back at number 1.`);
  await expect(page.getByTestId("entry").getByRole("link")).toHaveText([
    shelf.title("A1"),
    shelf.title("A2"),
    shelf.title("A3"),
  ]);
  expect(shelfOrder(shelf.id)).toBe(before);
  expect(sent.moves).toBe(0);
});

test("a move above the first section", async ({ signedIn: { page } }) => {
  const shelf = await makeShelf(page, {
    sections: [
      ["A", 2],
      ["B", 2],
    ],
  });
  const b1 = shelf.title("B1");
  await page.goto(`/shelves/${shelf.id}`);
  const dim =
    "A work above the first section is on the shelf, not in a section. Drag it into one, or leave it.";
  await expect(page.getByText(dim)).toHaveCount(0);
  // Up past B's heading, A2, A1 and A's heading: four places.
  await pickUp(page, b1, ["ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp"]);
  await page.keyboard.press("Space");

  await expect(live(page)).toHaveText(
    `${b1} moved above the first section, number 1`,
  );
  const above = page.getByRole("list", { name: "Above the first section" });
  await expect(above.getByTestId("entry").getByRole("link")).toHaveText([b1]);
  await expect(page.getByText(dim)).toBeVisible();
  await expect.poll(() => shelfOrder(shelf.id).split(",")[0]).toBe(`${b1}@1`);
});

test("a move onto an empty section's heading lands in it", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, {
    sections: [
      ["A", 2],
      ["B", 2],
      ["C", 0],
    ],
  });
  const b2 = shelf.title("B2");
  await page.goto(`/shelves/${shelf.id}`);
  await pickUp(page, b2, ["ArrowDown"]);
  await page.keyboard.press("Space");

  await expect(live(page)).toHaveText(`${b2} moved to C, number 4`);
  const c = region(page, "C");
  await expect(c.getByTestId("entry").getByRole("link")).toHaveText([b2]);
  await expect(c.getByText("1 work", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      db(`select x.name || '@' || e.position from shelf_entries e
        join shelf_sections x on x.id = e.section join items i on i.id = e.item
        where i.title = '${b2}'`),
    )
    .toBe("C@4");
});

test("the move route answered 500 puts the row back and says so", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { sections: [["A", 3]] });
  const before = shelfOrder(shelf.id);
  const sent = { moves: 0 };
  const pattern = `**/api/v1/shelves/${shelf.id}/entries/*`;
  await page.route(pattern, (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    sent.moves += 1;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "internal", message: "Something broke." },
      }),
    });
  });
  await page.goto(`/shelves/${shelf.id}`);
  const titles = page.getByTestId("entry").getByRole("link");
  const a1 = shelf.title("A1");

  await pickUp(page, a1, ["ArrowDown"]);
  await page.keyboard.press("Space");
  await expect(page.getByText("Couldn't move that. Try again.")).toBeVisible();
  await expect(titles).toHaveText([a1, shelf.title("A2"), shelf.title("A3")]);
  await expect(
    page.getByTestId("entry").first().getByText("1", { exact: true }),
  ).toBeVisible();
  expect(sent.moves).toBe(1);
  expect(shelfOrder(shelf.id)).toBe(before);

  await page.unroute(pattern);
  await pickUp(page, a1, ["ArrowDown"]);
  await page.keyboard.press("Space");
  await expect(titles).toHaveText([shelf.title("A2"), a1, shelf.title("A3")]);
  await expect(page.getByText("Couldn't move that. Try again.")).toHaveCount(0);
  await expect
    .poll(() => shelfOrder(shelf.id))
    .toBe(`${shelf.title("A2")}@1,${a1}@2,${shelf.title("A3")}@3`);
});

test("a drop in place posts nothing", async ({ signedIn: { page } }) => {
  const shelf = await makeShelf(page, { sections: [["A", 2]] });
  const before = shelfOrder(shelf.id);
  const sent = await countMoves(page, shelf.id);
  await page.goto(`/shelves/${shelf.id}`);
  const grip = page.getByRole("button", {
    name: `Reorder ${shelf.title("A1")}`,
  });
  await pickUp(page, shelf.title("A1"), []);
  await page.keyboard.press("Space");
  await expect(grip).not.toHaveAttribute("aria-pressed", "true");
  await expect(live(page)).toHaveText(
    `${shelf.title("A1")} stays at number 1.`,
  );
  await expect(page.getByTestId("entry").getByRole("link")).toHaveText([
    shelf.title("A1"),
    shelf.title("A2"),
  ]);
  expect(shelfOrder(shelf.id)).toBe(before);
  expect(sent.moves).toBe(0);
});

test("the grip is a button named Reorder <title>, one per row", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 1, sections: [["A", 2]] });
  await page.goto(`/shelves/${shelf.id}`);
  for (const label of ["Top1", "A1", "A2"]) {
    await expect(
      page.getByRole("button", { name: `Reorder ${shelf.title(label)}` }),
    ).toHaveCount(1);
  }
  await expect(page.getByRole("button", { name: /^Reorder / })).toHaveCount(3);
});

test("the last row of Tales 2 moves into Mini Series by keyboard on the TMNT shelf", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  const tmnt = shelfId(email, "TMNT, the Mirage run");
  await page.goto(`/shelves/${tmnt}`);
  const row = page.getByTestId("entry").nth(300);
  await expect(row.getByText("301", { exact: true })).toBeVisible();
  const title = (await row.getByRole("link").textContent()) ?? "";

  const grip = row.getByRole("button", { name: /^Reorder / });
  await grip.focus();
  await page.keyboard.press("Space");
  await expect(grip).toHaveAttribute("aria-pressed", "true");
  const before = (await live(page).textContent()) ?? "";
  await page.keyboard.press("ArrowDown");
  await expect(live(page)).not.toHaveText(before);
  await page.keyboard.press("Space");

  await expect(live(page)).toHaveText(
    `${title} moved to Volume 4 · Mini Series, number 301`,
  );
  const mini = region(page, "Volume 4 · Mini Series");
  await expect(mini.getByTestId("entry")).toHaveCount(17);
  await expect(mini.getByTestId("entry").first()).toContainText(title);
  await expect(
    mini.getByTestId("entry").first().getByText("301", { exact: true }),
  ).toBeVisible();
  await expect(
    region(
      page,
      "Volume 4 · Tales of the Teenage Mutant Ninja Turtles 2",
    ).getByText("69 works", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      db(`select count(*) = 326 and min(position) = 1 and max(position) = 326
        and count(distinct position) = 326 from shelf_entries where shelf = '${tmnt}'`),
    )
    .toBe("t");
  expect(
    db(`select x.name from shelf_entries e join shelf_sections x on x.id = e.section
      where e.shelf = '${tmnt}' and e.position = 301`),
  ).toBe("Volume 4 · Mini Series");
});
