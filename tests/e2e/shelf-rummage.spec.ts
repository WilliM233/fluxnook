import type { BrowserContext, Page, Route } from "@playwright/test";
import { db, loadFixturesFor } from "./harness/fixtures";
import { makeShelf, shelfId, shelfOrder } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// The 1.5.2 Rummage (plan section 4): what a second write in flight, a
// second tab, or a pointer low on a long shelf does to the page.

/** dnd-kit's one live region. */
const live = (page: Page) => page.locator('[id^="DndLiveRegion"]');

/** The numbers the page prints, top to bottom. */
const numbers = (page: Page) =>
  page.getByTestId("entry").locator("span.tabular-nums");

/** Picks a row up by its grip, presses each key, and drops it. */
async function keyMove(page: Page, title: string, keys: string[]) {
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
  await page.keyboard.press("Space");
}

/** Whether a PATCH on an entry is a move (a section and an index), not a status. */
const isMove = (route: Route) =>
  route.request().method() === "PATCH" &&
  "index" in (route.request().postDataJSON() ?? {});

/**
 * Holds every move the page sends for `ms` before it reaches the server (or
 * answers 500 instead), so a second write can land while it is out.
 */
async function holdMoves(
  page: Page,
  shelf: string,
  ms: number,
  answer: "continue" | 500 = "continue",
) {
  await page.route(`**/api/v1/shelves/${shelf}/entries/*`, async (route) => {
    if (!isMove(route)) return route.continue();
    await new Promise((resolve) => setTimeout(resolve, ms));
    if (answer === "continue") return route.continue();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "Broke." } }),
    });
  });
}

const status = (page: Page, title: string) =>
  page.getByRole("group", { name: `Status of ${title}` });

test("R1 a status marked while a move is out is still marked when the move answers", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 3 });
  const top1 = shelf.title("Top1");
  const top3 = shelf.title("Top3");
  await holdMoves(page, shelf.id, 1500);
  await page.goto(`/shelves/${shelf.id}`);

  await keyMove(page, top1, ["ArrowDown"]);
  await expect(numbers(page)).toHaveText(["1", "2", "3"]);
  // The move is out for 1.5 s; mark Top3 done meanwhile.
  await status(page, top3).getByRole("button", { name: "Done" }).click();
  await expect(
    status(page, top3).getByRole("button", { name: "Done", pressed: true }),
  ).toBeVisible();
  await expect(
    page.getByText("3 works · 1 done", { exact: true }),
  ).toBeVisible();

  // The move lands on the server.
  await expect
    .poll(() => shelfOrder(shelf.id), { timeout: 5000 })
    .toBe(`${shelf.title("Top2")}@1,${top1}@2,${top3}@3`);
  await expect(page.getByTestId("entry").getByRole("link")).toHaveText([
    shelf.title("Top2"),
    top1,
    top3,
  ]);
  // The table says done; the page must not have forgotten it.
  expect(
    db(`select status from shelf_entries e join items i on i.id = e.item
      where e.shelf = '${shelf.id}' and i.title = '${top3}'`),
  ).toBe("done");
  await expect(
    status(page, top3).getByRole("button", { name: "Done", pressed: true }),
  ).toBeVisible();
  await expect(
    page.getByText("3 works · 1 done", { exact: true }),
  ).toBeVisible();
});

test("R2 a refused move puts the rows back and keeps a status marked meanwhile", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 3 });
  const top1 = shelf.title("Top1");
  const top3 = shelf.title("Top3");
  await holdMoves(page, shelf.id, 1500, 500);
  await page.goto(`/shelves/${shelf.id}`);

  await keyMove(page, top1, ["ArrowDown"]);
  await status(page, top3).getByRole("button", { name: "Done" }).click();
  await expect(
    status(page, top3).getByRole("button", { name: "Done", pressed: true }),
  ).toBeVisible();

  await expect(page.getByText("Couldn't move that. Try again.")).toBeVisible();
  await expect(page.getByTestId("entry").getByRole("link")).toHaveText([
    top1,
    shelf.title("Top2"),
    top3,
  ]);
  expect(
    db(`select status from shelf_entries e join items i on i.id = e.item
      where e.shelf = '${shelf.id}' and i.title = '${top3}'`),
  ).toBe("done");
  await expect(
    status(page, top3).getByRole("button", { name: "Done", pressed: true }),
  ).toBeVisible();
  await expect(
    page.getByText("3 works · 1 done", { exact: true }),
  ).toBeVisible();
});

test("R3 a work removed while a move is out does not come back when the move answers", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 3 });
  const top1 = shelf.title("Top1");
  const top3 = shelf.title("Top3");
  await holdMoves(page, shelf.id, 1500);
  await page.goto(`/shelves/${shelf.id}`);

  await keyMove(page, top1, ["ArrowDown"]);
  await page.getByRole("button", { name: `Remove ${top3}` }).click();
  await expect(page.getByTestId("entry")).toHaveCount(2);

  // The move lands on the server after the remove.
  await expect
    .poll(() => shelfOrder(shelf.id), { timeout: 5000 })
    .toBe(`${shelf.title("Top2")}@1,${top1}@2`);
  // Give the page its answer, then look again: two rows, not a ghost third.
  await page.waitForTimeout(500);
  await expect(page.getByTestId("entry")).toHaveCount(2);
  await expect(page.getByTestId("entry").getByRole("link")).toHaveText([
    shelf.title("Top2"),
    top1,
  ]);
  await expect(page.getByText("2 works", { exact: true })).toBeVisible();
});

/** A second tab on the same account: the page's cookies in a new context. */
async function secondTab(
  page: Page,
): Promise<{ tab: Page; ctx: BrowserContext }> {
  const browser = page.context().browser();
  if (!browser) throw new Error("no browser");
  const ctx = await browser.newContext({ baseURL: "http://localhost:3000" });
  await ctx.addCookies(await page.context().cookies());
  return { tab: await ctx.newPage(), ctx };
}

test("R4 two tabs: a move on a stale tab shows the server's rows in the server's sections", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, {
    sections: [
      ["A", 2],
      ["B", 2],
    ],
  });
  const a1 = shelf.title("A1");
  const b1 = shelf.title("B1");
  const { tab, ctx } = await secondTab(page);
  try {
    await page.goto(`/shelves/${shelf.id}`);
    await tab.goto(`/shelves/${shelf.id}`);

    // Tab one moves A1 into B, at its top.
    await keyMove(page, a1, ["ArrowDown", "ArrowDown"]);
    await expect
      .poll(() => shelfOrder(shelf.id))
      .toBe(`${shelf.title("A2")}@1,${a1}@2,${b1}@3,${shelf.title("B2")}@4`);

    // Tab two, still showing A1 in A, moves B2 one up: to B's index 0 as it
    // sees B, which the server reads as the top of B, above A1.
    await keyMove(tab, shelf.title("B2"), ["ArrowUp"]);
    await expect
      .poll(() => shelfOrder(shelf.id))
      .toBe(`${shelf.title("A2")}@1,${shelf.title("B2")}@2,${a1}@3,${b1}@4`);

    // Tab two shows the server's numbering (A8), so its rows read 1 to 4
    // top to bottom and A1 sits under B, where the server has it.
    await expect(numbers(tab)).toHaveText(["1", "2", "3", "4"]);
    await expect(
      tab.getByRole("region", { name: "B", exact: true }).getByTestId("entry"),
    ).toHaveCount(3);
    await expect(
      tab.getByRole("region", { name: "A", exact: true }).getByTestId("entry"),
    ).toHaveCount(1);
  } finally {
    await ctx.close();
  }
});

// Seen red by taking `{...listeners}` off the grip (sortable-row.tsx), the
// way A13's sixth red was seen by taking the restore out of drag.ts.
test("R5 a pointer drag at row 300 of the TMNT shelf lands in the next section and the table holds 1..326", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  const tmnt = shelfId(email, "TMNT, the Mirage run");
  await page.goto(`/shelves/${tmnt}`);
  const rows = page.getByTestId("entry");
  const row = rows.nth(300);
  await expect(row.getByText("301", { exact: true })).toBeVisible();
  const title = (await row.getByRole("link").textContent()) ?? "";
  const grip = row.getByRole("button", { name: /^Reorder / });
  await grip.scrollIntoViewIfNeeded();

  // The first row of Volume 4 · Mini Series, the next section down.
  const target = rows.nth(301);
  await expect(target.getByText("302", { exact: true })).toBeVisible();
  const from = await grip.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("no boxes");
  const fx = from.x + from.width / 2;
  const fy = from.y + from.height / 2;
  await page.mouse.move(fx, fy);
  await page.mouse.down();
  // Past the 4 px activation distance, then onto the target's centre.
  await page.mouse.move(fx, fy + 8, { steps: 2 });
  await page.mouse.move(fx, to.y + to.height / 2, { steps: 12 });
  await expect(grip).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();

  // Dropped on a row from above, it lands after that row, as the moving-aside
  // showed: second in Mini Series, number 302.
  await expect(live(page)).toHaveText(
    `${title} moved to Volume 4 · Mini Series, number 302`,
  );
  const mini = page.getByRole("region", {
    name: "Volume 4 · Mini Series",
    exact: true,
  });
  await expect(mini.getByTestId("entry")).toHaveCount(17);
  await expect(mini.getByTestId("entry").nth(1)).toContainText(title);
  await expect(
    page
      .getByRole("region", {
        name: "Volume 4 · Tales of the Teenage Mutant Ninja Turtles 2",
        exact: true,
      })
      .getByText("69 works", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      db(`select count(*) = 326 and min(position) = 1 and max(position) = 326
        and count(distinct position) = 326 from shelf_entries where shelf = '${tmnt}'`),
    )
    .toBe("t");
  expect(
    db(`select x.name || '@' || e.position from shelf_entries e
      join shelf_sections x on x.id = e.section join items i on i.id = e.item
      where e.shelf = '${tmnt}' and i.title = '${title.replaceAll("'", "''")}'`),
  ).toBe("Volume 4 · Mini Series@302");
});
