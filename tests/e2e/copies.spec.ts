import type { Locator, Page } from "@playwright/test";
import { db, itemFor, loadFixturesFor } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// Ch 1.7.1, on rows of this file's own under a tag, tidied after, so a
// parallel spec's Carrie never moves: the Editions section on every type, Own
// a copy, I own this, Edit, Remove. The fixture's own copies are read in the
// last block, by accounts that load them.

const tag = crypto.randomUUID();

type Probe = { id: string; title: string };

/** A work of this file's own; each test takes a fresh one. */
function probe(type = "book", form: string | null = "novel"): Probe {
  const title = `Copies probe ${crypto.randomUUID().slice(0, 8)}`;
  const id = db(`
    insert into items (type, title, form, source_note)
    values ('${type}', '${title}', ${form ? `'${form}'` : "null"}, '${tag}')
    returning id`).split("\n")[0];
  return { id, title };
}

const printing = (item: string, format: string, more = "") =>
  db(`insert into editions (item, format${more ? ", publisher" : ""})
    values ('${item}', '${format}'${more ? `, '${more}'` : ""}) returning id`).split(
    "\n",
  )[0];

const count = (where: string) =>
  db(`select count(*) from copies c join editions e on e.id = c.edition
    join items i on i.id = e.item where ${where}`);

const copiesOf = (item: string) => count(`i.id = '${item}'`);

const editions = (page: Page) => page.getByRole("region", { name: "Editions" });

const sheet = (page: Page) => page.getByRole("dialog");

/**
 * Clicks until the sheet shows: a click that lands before the page hydrates
 * (or while `next dev` reloads it) has no handler and opens nothing.
 */
async function opens(page: Page, within: Locator, name: string) {
  const button = within.getByRole("button", { name });
  await expect(async () => {
    await button.click();
    await expect(sheet(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

/**
 * The page has hydrated, proved by a sheet that opens and closes. A click on I
 * own this can't be retried like the above: it posts, so a retry is a copy.
 */
async function hydrated(page: Page) {
  await opens(page, editions(page), "Own a copy");
  await sheet(page).getByRole("button", { name: "Cancel" }).click();
  await expect(sheet(page)).toHaveCount(0);
}

test.afterAll(() => {
  db(`delete from copies where edition in (
    select e.id from editions e join items i on i.id = e.item
    where i.source_note = '${tag}')`);
  db(`delete from items where source_note = '${tag}'`);
});

test.describe("the section", () => {
  test("a film's Editions say none yet, with no line and Own a copy", async ({
    signedIn: { page },
  }) => {
    const film = probe("film", null);
    await page.goto(`/items/${film.id}`);
    const section = editions(page);
    await expect(section.getByText("None in the catalog yet.")).toBeVisible();
    await expect(section.getByText("in the catalog ·")).toHaveCount(0);
    await expect(
      section.getByRole("button", { name: "Own a copy" }),
    ).toBeVisible();
  });

  test("a copy seeded by SQL prints its line, with both parts, with one, with none", async ({
    signedIn: { page, email },
  }) => {
    const work = probe();
    const edition = printing(work.id, "paperback", "Anchor Books");
    const owner = db(`select id from auth.users where email = '${email}'`);
    db(`insert into copies (owner, edition, condition, acquired_on, note)
      values ('${owner}', '${edition}', 'good', '2019-03-12', 'First line.')`);
    db(`insert into copies (owner, edition, condition, created_at)
      values ('${owner}', '${edition}', 'fair', now() + interval '1 second')`);
    db(`insert into copies (owner, edition, created_at)
      values ('${owner}', '${edition}', now() + interval '2 second')`);

    await page.goto(`/items/${work.id}`);
    const section = editions(page);
    await expect(
      section.getByText("1 in the catalog · you hold 3"),
    ).toBeVisible();
    const lines = section.getByTestId("copy");
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(0)).toContainText("Your copy");
    await expect(lines.nth(0)).toContainText("Good · since 12 March 2019");
    await expect(lines.nth(0)).toContainText("First line.");
    await expect(lines.nth(1)).toContainText("Fair");
    await expect(lines.nth(1)).not.toContainText("since");
    await expect(lines.nth(2).getByText("Your copy")).toBeVisible();
    await expect(lines.nth(2)).not.toContainText("since");
    await expect(
      section.getByRole("button", { name: "I own this" }),
    ).toHaveCount(0);
  });
});

test.describe("Own a copy", () => {
  test("on a film with a format the catalog lacks makes the printing and the copy", async ({
    signedIn: { page },
  }) => {
    const film = probe("film", null);
    await page.goto(`/items/${film.id}`);
    const section = editions(page);
    await opens(page, editions(page), "Own a copy");
    await expect(
      sheet(page).getByRole("heading", { name: `Own a copy of ${film.title}` }),
    ).toBeVisible();
    await expect(sheet(page).getByLabel("Format").locator("option")).toHaveText(
      ["DVD", "Blu-ray", "4K", "Digital"],
    );
    await sheet(page).getByLabel("Format").selectOption({ label: "Blu-ray" });
    await sheet(page).getByLabel("Condition").selectOption({ label: "Fine" });
    await sheet(page).getByRole("button", { name: "Add it" }).click();

    await expect(sheet(page)).toHaveCount(0);
    await expect(
      section.getByText("1 in the catalog · you hold 1"),
    ).toBeVisible();
    const row = section.getByRole("listitem");
    await expect(row.getByText("Blu-ray", { exact: true })).toBeVisible();
    await expect(row.getByTestId("copy")).toContainText("Your copy");
    await expect(row.getByTestId("copy")).toContainText("Fine");
    expect(
      db(`select format, title, publisher, pages, released_on from editions
        where item = '${film.id}'`),
    ).toBe("blu-ray||||");
  });

  test("a printing's option posts its edition: no second row", async ({
    signedIn: { page },
  }) => {
    const work = probe();
    const edition = printing(work.id, "paperback", "Anchor Books");
    await page.goto(`/items/${work.id}`);
    await opens(page, editions(page), "Own a copy");
    const format = sheet(page).getByLabel("Format");
    await expect(format).toHaveValue(`edition:${edition}`);
    await expect(format.locator("option").first()).toHaveText(
      "Paperback · Anchor Books",
    );
    await sheet(page).getByRole("button", { name: "Add it" }).click();
    await expect(editions(page).getByTestId("copy")).toHaveCount(1);
    await expect(editions(page).getByRole("listitem")).toHaveCount(1);
    expect(db(`select count(*) from editions where item = '${work.id}'`)).toBe(
      "1",
    );
  });

  test("a future date shows under Acquired and the sheet stays", async ({
    signedIn: { page },
  }) => {
    const work = probe();
    await page.goto(`/items/${work.id}`);
    await opens(page, editions(page), "Own a copy");
    await sheet(page).getByLabel("Acquired").fill("2999-01-01");
    await sheet(page).getByRole("button", { name: "Add it" }).click();
    await expect(
      sheet(page).getByText("A day you'll have it isn't a day you have it."),
    ).toBeVisible();
    await expect(
      sheet(page).getByRole("button", { name: "Add it" }),
    ).toBeEnabled();
    expect(copiesOf(work.id)).toBe("0");
  });

  test("the sheet's 409 line: two printings arrive after it opened, and no copy", async ({
    signedIn: { page },
  }) => {
    const work = probe();
    await page.goto(`/items/${work.id}`);
    await opens(page, editions(page), "Own a copy");
    await sheet(page).getByLabel("Format").selectOption({ label: "Hardcover" });
    printing(work.id, "hardcover");
    printing(work.id, "hardcover");
    await sheet(page).getByRole("button", { name: "Add it" }).click();
    await expect(sheet(page).getByRole("alert")).toHaveText(
      "This work has 2 hardcover printings in the catalog. Pick one on its page.",
    );
    await expect(sheet(page)).toBeVisible();
    expect(copiesOf(work.id)).toBe("0");
  });

  test("a typed note closes only on Cancel", async ({ signedIn: { page } }) => {
    const work = probe();
    await page.goto(`/items/${work.id}`);
    await opens(page, editions(page), "Own a copy");
    await sheet(page).getByLabel("Note").fill("Words worth keeping.");
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeVisible();
    await sheet(page).getByRole("button", { name: "Cancel" }).click();
    await expect(sheet(page)).toHaveCount(0);
    expect(copiesOf(work.id)).toBe("0");
  });

  test("Add it on a server slowed past a second click posts once and one copy stands", async ({
    signedIn: { page },
  }) => {
    const work = probe();
    let posts = 0;
    await page.route("**/api/v1/copies", async (route) => {
      posts += 1;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      await route.continue();
    });
    await page.goto(`/items/${work.id}`);
    await opens(page, editions(page), "Own a copy");
    const add = sheet(page).getByRole("button", { name: "Add it" });
    await add.click();
    await add.dispatchEvent("click");
    await expect(sheet(page)).toHaveCount(0);
    await expect(editions(page).getByTestId("copy")).toHaveCount(1);
    expect(posts).toBe(1);
    expect(copiesOf(work.id)).toBe("1");
  });
});

test.describe("I own this", () => {
  test("on a printing: no sheet, the line, the heading", async ({
    signedIn: { page },
  }) => {
    const work = probe();
    printing(work.id, "paperback");
    await page.goto(`/items/${work.id}`);
    const section = editions(page);
    await expect(
      section.getByText("1 in the catalog · none yours"),
    ).toBeVisible();
    await hydrated(page);
    await section.getByRole("button", { name: "I own this" }).click();
    await expect(section.getByTestId("copy")).toContainText("Your copy");
    await expect(sheet(page)).toHaveCount(0);
    await expect(
      section.getByText("1 in the catalog · you hold 1"),
    ).toBeVisible();
    await expect(
      section.getByRole("button", { name: "I own this" }),
    ).toHaveCount(0);
  });

  test("a second tab owns the printing between the click and the answer: both copies stand and the page says you hold 2", async ({
    signedIn: { page },
  }) => {
    const work = probe();
    printing(work.id, "paperback");
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/copies", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(`/items/${work.id}`);
    const section = editions(page);
    await hydrated(page);
    await section.getByRole("button", { name: "I own this" }).click();

    const tab = await page.context().newPage();
    try {
      await tab.goto(`/items/${work.id}`);
      await hydrated(tab);
      await editions(tab).getByRole("button", { name: "I own this" }).click();
      await expect(editions(tab).getByTestId("copy")).toHaveCount(1);
      release();
      await expect(section.getByTestId("copy")).toHaveCount(2);
      await expect(
        section.getByText("1 in the catalog · you hold 2"),
      ).toBeVisible();
      expect(copiesOf(work.id)).toBe("2");
    } finally {
      await tab.close();
    }
  });

  test("a server slowed past the next click posts once: one copy, no second line", async ({
    signedIn: { page },
  }) => {
    const work = probe();
    printing(work.id, "paperback");
    let posts = 0;
    await page.route("**/api/v1/copies", async (route) => {
      posts += 1;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      await route.continue();
    });
    await page.goto(`/items/${work.id}`);
    const section = editions(page);
    await hydrated(page);
    const own = section.getByRole("button", { name: "I own this" });
    await own.click();
    await own.dispatchEvent("click");
    await expect(section.getByTestId("copy")).toHaveCount(1);
    expect(posts).toBe(1);
    expect(copiesOf(work.id)).toBe("1");
  });

  test("a 500 puts I own this back with the line", async ({
    signedIn: { page },
  }) => {
    const work = probe();
    printing(work.id, "paperback");
    await page.route("**/api/v1/copies", (route) =>
      route.fulfill({ status: 500, body: "{}" }),
    );
    await page.goto(`/items/${work.id}`);
    const section = editions(page);
    await hydrated(page);
    const own = section.getByRole("button", { name: "I own this" });
    await own.click();
    await expect(section.getByRole("alert")).toHaveText(
      "Couldn't add that copy just now. Try again.",
    );
    await expect(own).toBeEnabled();
    await expect(section.getByTestId("copy")).toHaveCount(0);
    expect(copiesOf(work.id)).toBe("0");
  });
});

test.describe("Edit and Remove", () => {
  /** A held printing, through the route, as a person's click makes one. */
  async function held(page: Page, body: object = {}) {
    const work = probe();
    const edition = printing(work.id, "paperback");
    const answer = await page.request.post("/api/v1/copies", {
      data: { edition, ...body },
    });
    expect(answer.status()).toBe(201);
    const { id } = await answer.json();
    return { work, edition, copy: id as string };
  }

  test("Edit saves condition, date and note, shows Format as text, and clears them", async ({
    signedIn: { page },
  }) => {
    const { work } = await held(page);
    await page.goto(`/items/${work.id}`);
    const section = editions(page);
    await opens(page, section, "Edit this copy");
    await expect(
      sheet(page).getByRole("heading", { name: "Edit this copy" }),
    ).toBeVisible();
    await expect(sheet(page).getByLabel("Format")).toHaveCount(0);
    await expect(
      sheet(page).getByText("Paperback", { exact: true }),
    ).toBeVisible();
    await sheet(page).getByLabel("Condition").selectOption({ label: "Good" });
    await sheet(page).getByLabel("Acquired").fill("2019-03-12");
    await sheet(page).getByLabel("Note").fill("The reading copy.");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page)).toHaveCount(0);
    const line = section.getByTestId("copy");
    await expect(line).toContainText("Good · since 12 March 2019");
    await expect(line).toContainText("The reading copy.");

    await opens(page, section, "Edit this copy");
    await sheet(page).getByLabel("Condition").selectOption({ value: "" });
    await sheet(page).getByLabel("Acquired").fill("");
    await sheet(page).getByLabel("Note").fill("");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(line).not.toContainText("Good");
    await expect(line).not.toContainText("since");
    await expect(line).not.toContainText("The reading copy.");
    expect(
      db(`select condition, acquired_on, note from copies c join editions e
        on e.id = c.edition where e.item = '${work.id}'`),
    ).toBe("||");
  });

  test("Remove asks once with the note's first line; Cancel keeps it; confirm takes the copy and leaves the printing", async ({
    signedIn: { page },
  }) => {
    const { work } = await held(page, { note: "Sealed.\nNever opened." });
    await page.goto(`/items/${work.id}`);
    const section = editions(page);
    await opens(page, section, "Remove this copy");
    await expect(
      sheet(page).getByRole("heading", { name: "Let go of this copy?" }),
    ).toBeVisible();
    await expect(
      sheet(page).getByText(
        '"Sealed." goes with it. The printing stays in the catalog.',
      ),
    ).toBeVisible();
    await sheet(page).getByRole("button", { name: "Cancel" }).click();
    await expect(section.getByTestId("copy")).toHaveCount(1);
    expect(copiesOf(work.id)).toBe("1");

    await opens(page, section, "Remove this copy");
    await sheet(page).getByRole("button", { name: "Remove" }).click();
    await expect(section.getByTestId("copy")).toHaveCount(0);
    await expect(
      section.getByRole("button", { name: "I own this" }),
    ).toBeVisible();
    await expect(section.getByRole("listitem")).toHaveCount(1);
    expect(copiesOf(work.id)).toBe("0");
    expect(db(`select count(*) from editions where item = '${work.id}'`)).toBe(
      "1",
    );
  });

  test("a second tab removes the copy before Remove: the confirm closes, no error, the line gone", async ({
    signedIn: { page },
  }) => {
    const { work, copy } = await held(page);
    await page.goto(`/items/${work.id}`);
    const section = editions(page);
    await opens(page, section, "Remove this copy");
    expect((await page.request.delete(`/api/v1/copies/${copy}`)).status()).toBe(
      204,
    );
    await sheet(page).getByRole("button", { name: "Remove" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(section.getByTestId("copy")).toHaveCount(0);
  });

  test("a second tab removes the copy before Save: the sheet's line, the words kept; Cancel shows it gone", async ({
    signedIn: { page },
  }) => {
    const { work, copy } = await held(page);
    await page.goto(`/items/${work.id}`);
    const section = editions(page);
    await opens(page, section, "Edit this copy");
    await sheet(page).getByLabel("Note").fill("Words typed.");
    expect((await page.request.delete(`/api/v1/copies/${copy}`)).status()).toBe(
      204,
    );
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page).getByRole("alert")).toHaveText(
      "No copy by that id.",
    );
    await expect(sheet(page).getByLabel("Note")).toHaveValue("Words typed.");
    await sheet(page).getByRole("button", { name: "Cancel" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(section.getByTestId("copy")).toHaveCount(0);
  });
});

// The Raccoon's Rummage (1.7.1, section 4b). Each seen red before green.
test.describe("rummage", () => {
  test("R1 a backup in a held trade's contents: the API says via, so the section says Yours via the trade", async ({
    signedIn: { page, email },
  }) => {
    // The picker lists backups (`loadPickerComics` filters on type alone), so
    // a person can put one in a trade's contents and then hold the trade.
    const trade = probe("comic", "collected");
    const backup = probe("comic", "backup");
    const edition = printing(trade.id, "tpb");
    db(`insert into edition_contents (edition, item, position)
      values ('${edition}', '${backup.id}', 1)`);
    const owner = db(`select id from auth.users where email = '${email}'`);
    db(`insert into copies (owner, edition) values ('${owner}', '${edition}')`);

    const asked = await page.request.get(`/api/v1/copies?item=${backup.id}`);
    expect((await asked.json()).via).toHaveLength(1);

    await page.goto(`/items/${backup.id}`);
    const section = editions(page);
    await expect(
      section.getByText(
        "A backup story is owned through the comic it's printed in.",
      ),
    ).toBeVisible();
    await expect(
      section.getByText(`Yours via ${trade.title} (Trade paperback)`),
    ).toBeVisible();
  });

  test("R2 two tabs edit one copy: a note saved here keeps the condition saved there", async ({
    signedIn: { page },
  }) => {
    const work = probe();
    const edition = printing(work.id, "paperback");
    const made = await page.request.post("/api/v1/copies", {
      data: { edition },
    });
    expect(made.status()).toBe(201);
    const { id: copy } = await made.json();

    await page.goto(`/items/${work.id}`);
    const section = editions(page);
    await opens(page, section, "Edit this copy");
    // The other tab saves a condition while this sheet is open.
    expect(
      (
        await page.request.patch(`/api/v1/copies/${copy}`, {
          data: { condition: "fair" },
        })
      ).status(),
    ).toBe(200);
    await sheet(page).getByLabel("Note").fill("Mine.");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page)).toHaveCount(0);
    const line = section.getByTestId("copy");
    await expect(line).toContainText("Mine.");
    await expect(line).toContainText("Fair");
    expect(db(`select condition from copies where id = '${copy}'`)).toBe(
      "fair",
    );
  });

  test("R4 Cancel after the 409 shows the printings the line named", async ({
    signedIn: { page },
  }) => {
    const work = probe();
    await page.goto(`/items/${work.id}`);
    await opens(page, editions(page), "Own a copy");
    await sheet(page).getByLabel("Format").selectOption({ label: "Hardcover" });
    printing(work.id, "hardcover");
    printing(work.id, "hardcover");
    await sheet(page).getByRole("button", { name: "Add it" }).click();
    await expect(sheet(page).getByRole("alert")).toHaveText(
      "This work has 2 hardcover printings in the catalog. Pick one on its page.",
    );
    await sheet(page).getByRole("button", { name: "Cancel" }).click();
    await expect(sheet(page)).toHaveCount(0);
    // "Pick one on its page": the page has to show them.
    await expect(editions(page).getByRole("listitem")).toHaveCount(2);
    await expect(
      editions(page).getByText("2 in the catalog · none yours"),
    ).toBeVisible();
  });
});

test.describe("on the fixtures", () => {
  const tmnt = () => itemFor("manual", "tmnt-mirage-v1-1");

  test("TMNT #1's via line sits under the facts, once, and Ultimate Collection 1's row reads Your copy", async ({
    signedIn: { page, email },
  }) => {
    loadFixturesFor(email);
    await page.goto(`/items/${tmnt()}`);
    const via = page.getByTestId("owned-via");
    await expect(via).toHaveCount(1);
    await expect(via).toHaveText("Owned via Ultimate Collection 1 (Hardcover)");
    const facts = await page.locator("dl").first().boundingBox();
    const line = await via.boundingBox();
    const journal = await page
      .getByRole("heading", { name: "Journal" })
      .boundingBox();
    if (!facts || !line || !journal) throw new Error("no boxes");
    expect(facts.y + facts.height).toBeLessThanOrEqual(line.y);
    expect(line.y + line.height).toBeLessThanOrEqual(journal.y);

    const collected = page.getByRole("list", { name: "Collected in" });
    const row = collected.getByRole("listitem").filter({
      hasText: "Ultimate Collection 1",
    });
    await expect(row.getByText("Your copy")).toBeVisible();
    await expect(row.getByRole("button", { name: "I own this" })).toHaveCount(
      0,
    );
    await expect(
      page.getByText("One you hold covers this issue."),
    ).toBeVisible();
  });

  test("another account reads no via and I own this on that row, and clicking it makes their copy", async ({
    signedIn: { page, email },
  }) => {
    // The catalog's fixture rows may not be there yet on a fresh reset.
    loadFixturesFor(email);
    const owner = db(`select id from auth.users where email = '${email}'`);
    const uc1 = itemFor("manual", "tmnt-ultimate-collection-1");
    // This account's own five go, so it stands as a person who holds none.
    db(`delete from copies where owner = '${owner}'`);

    await page.goto(`/items/${tmnt()}`);
    await expect(page.getByTestId("owned-via")).toHaveCount(0);
    const collected = page.getByRole("list", { name: "Collected in" });
    const row = collected.getByRole("listitem").filter({
      hasText: "Ultimate Collection 1",
    });
    await expect(row.getByText("Your copy")).toHaveCount(0);
    await hydrated(page);
    await row.getByRole("button", { name: "I own this" }).click();
    await expect(row.getByText("Your copy")).toBeVisible();
    await expect(page.getByTestId("owned-via")).toHaveText(
      "Owned via Ultimate Collection 1 (Hardcover)",
    );
    expect(count(`c.owner = '${owner}' and i.id = '${uc1}'`)).toBe("1");
    db(`delete from copies where owner = '${owner}'`);
  });

  test("the backup's section says what it is and names its host", async ({
    signedIn: { page, email },
  }) => {
    loadFixturesFor(email);
    await page.goto(
      `/items/${itemFor("manual", "tmnt-mirage-backup-you-had-to-be-there")}`,
    );
    const section = editions(page);
    await expect(
      section.getByText(
        "A backup story is owned through the comic it's printed in.",
      ),
    ).toBeVisible();
    await expect(
      section.getByText("Yours via All is Revealed (Hardcover)"),
    ).toBeVisible();
    await expect(
      section.getByRole("button", { name: "Own a copy" }),
    ).toHaveCount(0);
    await expect(page.getByTestId("owned-via")).toHaveCount(0);
  });

  test("Carrie's Editions have no copy on the load", async ({
    signedIn: { page, email },
  }) => {
    loadFixturesFor(email);
    await page.goto(`/items/${itemFor("manual", "carrie-1974")}`);
    await expect(editions(page).getByTestId("copy")).toHaveCount(0);
  });
});
