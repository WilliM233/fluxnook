import type { Locator, Page } from "@playwright/test";
import { db, itemFor, loadFixturesFor } from "./harness/fixtures";
import { post } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// Ch 1.6.2: the Journal section's controls and sheets, from a person's side.
// Each test logs on a work of its own, made through the route, so no test
// leans on another's reads (1.6.1 N2); the fixture read is TMNT #1's.

/** A book of the test's own; its id. */
async function book(page: Page, title: string) {
  return (
    await post(page, "/api/v1/items", {
      type: "book",
      title,
      year: 1974,
      form: "novel",
      author: "Test Author",
    })
  ).id as string;
}

/** Clicks a star's left or right half, measured from its box. */
async function half(star: Locator, side: "left" | "right") {
  const box = await star.boundingBox();
  if (!box) throw new Error("the star has no box");
  await star.click({
    position: {
      x: box.width * (side === "left" ? 0.25 : 0.75),
      y: box.height / 2,
    },
  });
}

/** The answer to the next request of `method` on a path ending in `tail`. */
const answered = (page: Page, method: string, tail: RegExp) =>
  page.waitForResponse(
    (r) =>
      r.request().method() === method && tail.test(new URL(r.url()).pathname),
  );

test("a star click on the card posts the stars and a reload keeps them", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  const tmnt = itemFor("manual", "tmnt-mirage-v1-1");
  await page.goto(`/items/${tmnt}`);
  const journal = page.getByRole("region", { name: "Journal" });
  const card = journal.getByTestId("read");
  const stars = card.getByRole("group", { name: "Unrated" });

  const saved = answered(page, "PATCH", /\/api\/v1\/occurrences\/[^/]+$/);
  await half(stars.getByRole("button", { name: "4 stars" }), "right");
  expect((await saved).status()).toBe(200);
  await expect(card.getByRole("group", { name: "★ 4" })).toBeVisible();
  await expect(
    journal.getByText("1 read · last finished at ★ 4", { exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(card.getByRole("group", { name: "★ 4" })).toBeVisible();
  await expect(
    journal.getByText("1 read · last finished at ★ 4", { exact: true }),
  ).toBeVisible();
  expect(
    db(`select o.stars from occurrences o join auth.users u on u.id = o.owner
      where u.email = '${email}' and o.item = '${tmnt}'`),
  ).toBe("4.0");
});

test("the left half of a star is its half, and the arrows move a half step", async ({
  signedIn: { page },
}) => {
  const id = await book(page, `Halves ${crypto.randomUUID()}`);
  await post(page, "/api/v1/occurrences", { item: id, status: "done" });
  await page.goto(`/items/${id}`);
  const card = page.getByTestId("read");

  let saved = answered(page, "PATCH", /\/occurrences\/[^/]+$/);
  await half(card.getByRole("button", { name: "5 stars" }), "left");
  await saved;
  await expect(card.getByRole("group", { name: "★ 4.5" })).toBeVisible();

  const fifth = card.getByRole("button", { name: "5 stars" });
  for (const [key, name] of [
    ["ArrowLeft", "★ 4"],
    ["ArrowRight", "★ 4.5"],
    ["ArrowRight", "★ 5"],
  ]) {
    saved = answered(page, "PATCH", /\/occurrences\/[^/]+$/);
    await fifth.press(key);
    expect((await saved).status()).toBe(200);
    await expect(card.getByRole("group", { name })).toBeVisible();
  }
  await page.reload();
  await expect(card.getByRole("group", { name: "★ 5" })).toBeVisible();
});

test("a 500 on the stars leaves the card as it was and says so", async ({
  signedIn: { page },
}) => {
  const id = await book(page, `Refused ${crypto.randomUUID()}`);
  await post(page, "/api/v1/occurrences", { item: id, status: "done" });
  await page.route("**/api/v1/occurrences/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, body: "" })
      : route.continue(),
  );
  await page.goto(`/items/${id}`);
  const card = page.getByTestId("read");
  await half(card.getByRole("button", { name: "3 stars" }), "right");
  await expect(card.getByRole("alert")).toHaveText(
    "Couldn't save that. Try again.",
  );
  await expect(card.getByRole("group", { name: "Unrated" })).toBeVisible();
});
