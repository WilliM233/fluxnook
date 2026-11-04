import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { required, resetComicVine } from "./harness";

// A15 (a): the reset undoes what the three Browse volumes attached and nothing
// else. Its two updates once ran over every loaded comic and printing, and a
// worker's reset waited on, or deadlocked with, another worker's catalog write.
// Its own rows here, no load and no sign-up: a hand-entered comic and printing
// no Browse volume ever touched, each carrying what the old statements cleared.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const tag = `reset-comicvine ${crypto.randomUUID()}`;

afterAll(async () => {
  await sql`delete from items where title = ${tag}`;
  await sql.end();
});

describe("the Comic Vine reset's scope", () => {
  it("leaves a hand-entered comic and printing no Browse volume touched alone", async () => {
    const [item] = await sql`
      insert into items (type, title, form, summary, source_note)
      values ('comic', ${tag}, 'issue', 'probe', ${tag})
      returning id`;
    await sql`insert into item_comics (item) values (${item.id})`;
    await sql`insert into item_sources (item, source, key)
      values (${item.id}, 'manual', ${tag})`;
    const [edition] = await sql`
      insert into editions (item, format, publisher)
      values (${item.id}, 'floppy', 'probe')
      returning id`;
    await sql`insert into edition_sources (edition, source, key)
      values (${edition.id}, 'manual', ${tag})`;

    await resetComicVine(sql);

    const [after] = await sql`
      select i.summary, e.publisher from items i
      join editions e on e.item = i.id where i.id = ${item.id}`;
    expect(after.summary).toBe("probe");
    expect(after.publisher).toBe("probe");
    // The reset waits its turn behind the loader's lock with the other files.
  }, 60_000);
});
