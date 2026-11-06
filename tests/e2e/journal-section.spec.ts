import { itemFor, loadFixturesFor } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// Ch 1.6.1 A5 as it reads and A11's first sentence: the item page's Journal
// section on the fixtures, from the signed-in user's side.

const CLOSING =
  "A read is one time through. Stars are how it felt, in half steps; the journal is what you wrote along the way, pinned to a page when you say which. Done on a shelf is the shelf's; a read is logged here.";

test("TMNT #1's fixture read: one Done card, no dates, five empty stars, 1 read", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  await page.goto(`/items/${itemFor("manual", "tmnt-mirage-v1-1")}`);
  const journal = page.getByRole("region", { name: "Journal" });
  await expect(journal.getByText("1 read", { exact: true })).toBeVisible();
  const reads = journal.getByTestId("read");
  await expect(reads).toHaveCount(1);
  await expect(reads.getByText("Done", { exact: true })).toBeVisible();
  await expect(reads).not.toContainText("Started");
  await expect(reads).not.toContainText("Finished");
  await expect(reads).not.toContainText(" to ");
  await expect(reads.getByRole("group", { name: "Unrated" })).toBeVisible();
  await expect(reads.locator('svg[data-fill="empty"]')).toHaveCount(5);
  await expect(journal.getByTestId("entry")).toHaveCount(0);
  await expect(journal.getByText(CLOSING)).toBeVisible();
});

test("the card's stars are a control, and the page's static stars are gone", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  await page.goto(`/items/${itemFor("manual", "tmnt-mirage-v1-1")}`);
  const journal = page.getByRole("region", { name: "Journal" });
  const stars = journal.getByRole("group", { name: "Unrated" });
  for (const name of ["1 star", "2 stars", "3 stars", "4 stars", "5 stars"]) {
    await expect(
      stars.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }
  await expect(journal.getByRole("img")).toHaveCount(0);
});

test("a work with no read says so, and Journal sits between the facts and On your shelves", async ({
  signedIn: { page },
}) => {
  await page.goto(`/items/${itemFor("manual", "carrie-1974")}`);
  const journal = page.getByRole("region", { name: "Journal" });
  await expect(
    journal.getByText(
      "Nothing logged yet. Log a read and the journal starts here.",
    ),
  ).toBeVisible();
  await expect(journal.getByTestId("read")).toHaveCount(0);

  const top = async (box: Promise<{ y: number } | null>) =>
    (await box)?.y ?? -1;
  const facts = await top(page.locator("dl").first().boundingBox());
  const journalTop = await top(journal.boundingBox());
  const shelves = await top(
    page.getByRole("region", { name: "On your shelves" }).boundingBox(),
  );
  const connected = await top(
    page.getByRole("region", { name: "Connected" }).boundingBox(),
  );
  expect(facts).toBeGreaterThan(0);
  expect(facts).toBeLessThan(journalTop);
  expect(journalTop).toBeLessThan(shelves);
  expect(shelves).toBeLessThan(connected);
});

test("a film's empty Journal speaks of a watch", async ({
  signedIn: { page },
}) => {
  await page.goto(`/items/${itemFor("letterboxd", "20ZQ")}`);
  await expect(
    page
      .getByRole("region", { name: "Journal" })
      .getByText(
        "Nothing logged yet. Log a watch and the journal starts here.",
      ),
  ).toBeVisible();
});
