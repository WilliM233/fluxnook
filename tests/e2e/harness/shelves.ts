import { expect, type Page } from "@playwright/test";
import { db } from "./fixtures";

// Shelves a test makes for itself through the routes, in under a second,
// for the specs of the shelf page's writes (Ch 1.5.2).

/** A fixture shelf's id for the account signed in as `email`. */
export const shelfId = (email: string, name: string) =>
  db(`select s.id from shelves s join auth.users u on u.id = s.owner
    where u.email = '${email}' and s.name = '${name.replaceAll("'", "''")}'`);

/** A film made by hand; its id. */
export async function film(page: Page, title: string, year: number) {
  const response = await page.request.post("/api/v1/items", {
    data: { type: "film", title, year },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).id as string;
}

/** A POST that must answer 201; its body. */
export async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data });
  expect(response.status()).toBe(201);
  return response.json();
}

/**
 * A shelf of the test's own: `top` films above the first section, then each
 * section with its films. A film is titled by its place and the shelf's
 * tag ("Top1 <tag>", "A2 <tag>"), so `title("A2")` names it.
 */
export async function makeShelf(
  page: Page,
  layout: { top?: number; sections?: [string, number][] },
) {
  const tag = crypto.randomUUID().slice(0, 8);
  const name = `Shelf ${tag}`;
  const title = (label: string) => `${label} ${tag}`;
  const { id } = await post(page, "/api/v1/shelves", { name });
  const entries = `/api/v1/shelves/${id}/entries`;
  let year = 1970;
  const films = async (label: string, count: number) => {
    const ids: string[] = [];
    for (let i = 1; i <= count; i++) {
      ids.push(await film(page, title(`${label}${i}`), year++));
    }
    return ids;
  };

  const sections: Record<string, string> = {};
  for (const [section, count] of layout.sections ?? []) {
    const { id: sid } = await post(page, `/api/v1/shelves/${id}/sections`, {
      name: section,
    });
    sections[section] = sid;
    if (count > 0) {
      await post(page, entries, {
        items: await films(section, count),
        section: sid,
      });
    }
  }
  if (layout.top) {
    await post(page, entries, { items: await films("Top", layout.top) });
  }
  return { id, name, tag, title, sections };
}

/** The shelf's entries as "<title>@<position>", in position order. */
export const shelfOrder = (id: string) =>
  db(`select string_agg(i.title || '@' || e.position, ',' order by e.position)
    from shelf_entries e join items i on i.id = e.item where e.shelf = '${id}'`);
