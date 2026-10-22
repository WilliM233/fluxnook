import { expect, test } from "./harness/signed-in";

test("a fresh address gets a magic link and lands on /nook", async ({
  signedIn: { page, email },
}) => {
  await expect(page).toHaveURL("/nook");
  await expect(page.getByText(email)).toBeVisible();

  const me = await page.request.get("/api/v1/me");
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({ email });
});
