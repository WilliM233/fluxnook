import type { Page } from "@playwright/test";
import { db } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// Raccoon, Ch 1.4.3. R2: a Save that changed nothing keeps the printing
// order the edition already had; today it rewrites positions to the
// picker's list order (series groups first), so a hand-entered order with a
// one-shot up front is lost on a Save that only meant to add a tick. R4:
// when the server answers 401 (a session that expired while the sheet was
// open), the sheet says what the body says, not "Couldn't save just now",
// and the ticks stay for the retry.

const tag = `raccoon ${crypto.randomUUID().slice(0, 8)}`;
const RUN = `${tag} Run Vol. 1`;
const ids = {} as Record<"shot" | "one" | "two" | "col" | "tpb", string>;

const id = (sql: string) => db(sql).split("\n")[0];

function comic(title: string, form: string, c: { number?: number }) {
  const item = id(
    `insert into items (type, title, form, source_note) values ('comic', '${title}', '${form}', '${tag}') returning id`,
  );
  db(`insert into item_comics (item, series, number) values ('${item}',
    ${c.number ? `'${RUN}'` : "null"}, ${c.number ?? "null"})`);
  return item;
}

const stored = () =>
  db(
    `select item || ':' || position from edition_contents where edition = '${ids.tpb}' order by position`,
  );

test.beforeAll(() => {
  ids.shot = comic(`${tag} Prologue`, "one-shot", {});
  ids.one = comic(`${tag} #1`, "issue", { number: 1 });
  ids.two = comic(`${tag} #2`, "issue", { number: 2 });
  ids.col = comic(`${tag} Collection`, "collected", {});
  ids.tpb = id(
    `insert into editions (item, format) values ('${ids.col}', 'tpb') returning id`,
  );
  // The printing puts the one-shot first; the picker's list puts it last.
  db(`insert into edition_contents (edition, item, position) values
    ('${ids.tpb}', '${ids.shot}', 1), ('${ids.tpb}', '${ids.one}', 2), ('${ids.tpb}', '${ids.two}', 3)`);
});

test.afterAll(() => {
  db(`delete from items where source_note = '${tag}'`);
});

async function openPicker(page: Page) {
  await page.goto(`/items/${ids.col}`);
  await page.getByRole("button", { name: "Edit contents" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("3 picked")).toBeVisible();
  return sheet;
}

test("R2: Save with nothing changed keeps the edition's printing order", async ({
  signedIn: { page },
}) => {
  const before = stored();
  expect(before).toBe(`${ids.shot}:1\n${ids.one}:2\n${ids.two}:3`);
  const sheet = await openPicker(page);
  await sheet.getByRole("button", { name: "Save contents" }).click();
  await expect(sheet).toBeHidden();
  expect(stored()).toBe(before);
});

test("R4: a 401 on Save shows the server's sentence and keeps the ticks", async ({
  signedIn: { page },
}) => {
  await page.route("**/api/v1/editions/*/contents", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "unauthorized",
          message: "Sign in to edit the catalog.",
        },
      }),
    }),
  );
  const sheet = await openPicker(page);
  await sheet.getByRole("button", { name: "Save contents" }).click();
  await expect(sheet.getByRole("alert")).toHaveText(
    "Sign in to edit the catalog.",
  );
  await expect(sheet.getByText("3 picked")).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Save contents" }),
  ).toBeEnabled();
});
