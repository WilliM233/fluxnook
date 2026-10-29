import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { required } from "./harness";

// Ch 1.3's schema: an edition knows its publisher and its page count, and a
// count of none or fewer is refused. Tagged rows, cleaned up.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const title = `editions-columns ${crypto.randomUUID()}`;
let item: string;

beforeAll(async () => {
  const [row] = await sql`
    insert into items (type, title, form) values ('book', ${title}, 'novel')
    returning id`;
  item = row.id;
});

afterAll(async () => {
  await sql`delete from items where title = ${title}`;
  await sql.end();
});

async function newEdition(pages: number | null, publisher: string | null) {
  const [row] = await sql`
    insert into editions (item, format, publisher, pages)
    values (${item}, 'paperback', ${publisher}, ${pages})
    returning publisher, pages`;
  return row;
}

describe("editions.publisher and editions.pages", () => {
  it("an edition takes its publisher and pages", async () => {
    expect(await newEdition(304, "Anchor Books")).toEqual({
      publisher: "Anchor Books",
      pages: 304,
    });
  });

  it("zero pages is refused by editions_pages", async () => {
    await expect(newEdition(0, null)).rejects.toThrow(/editions_pages/);
  });

  it("no page count is fine", async () => {
    expect(await newEdition(null, null)).toEqual({
      publisher: null,
      pages: null,
    });
  });
});
