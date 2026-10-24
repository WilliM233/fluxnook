import { itemFor, loadFixturesFor } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// A8 on the fixtures: Carrie (1976) as Letterboxd loaded it, and the novel
// it adapts, from the signed-in user's side.

test("Carrie (1976): facts, sources, the novel and the shelf", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  await page.goto(`/items/${itemFor("letterboxd", "20ZQ")}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Carrie");
  await expect(page.getByText("Film", { exact: true })).toBeVisible();
  await expect(page.getByText("No poster")).toBeVisible();
  const released = page.locator("dt", { hasText: "Released" }).locator("+ dd");
  await expect(released).toHaveText("1976");
  await expect(page.getByRole("link", { name: "Letterboxd" })).toHaveAttribute(
    "href",
    "https://boxd.it/20ZQ",
  );
  const connected = page.getByRole("region", { name: "Connected" });
  await expect(connected.getByText("Adaptation of")).toBeVisible();
  await expect(connected.getByRole("link", { name: "Carrie" })).toHaveAttribute(
    "href",
    `/items/${itemFor("manual", "carrie-1974")}`,
  );
  const shelves = page.getByRole("region", { name: "On your shelves" });
  await expect(shelves.getByText("Stephen King Watch List")).toBeVisible();
  await expect(shelves.getByText(/^#\d+$/)).toBeVisible();
});

test("the novel lists its four adaptations and contains nothing", async ({
  signedIn: { page },
}) => {
  await page.goto(`/items/${itemFor("manual", "carrie-1974")}`);
  const connected = page.getByRole("region", { name: "Connected" });
  await expect(connected.getByText("Adapted as")).toHaveCount(4);
  await expect(connected.getByText("Contains")).toHaveCount(0);
});

test("an id the catalog doesn't hold is a 404 inside the shell", async ({
  signedIn: { page },
}) => {
  for (const id of [crypto.randomUUID(), "not-a-uuid"]) {
    const response = await page.goto(`/items/${id}`);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Search" }),
    ).toBeVisible();
  }
});

test("at phone width the cover sits above the title", async ({
  signedIn: { page },
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/items/${itemFor("letterboxd", "20ZQ")}`);
  const cover = await page.getByTestId("cover").boundingBox();
  const title = await page.getByRole("heading", { level: 1 }).boundingBox();
  expect(cover && title && cover.y + cover.height <= title.y).toBe(true);
});
