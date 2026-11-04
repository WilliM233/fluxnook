import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { holdBrowseVolumes, required, resetComicVine, signUp } from "./harness";

// A15 (a): the reset undoes what the three Browse volumes attached and nothing
// else. Its two updates once ran over every loaded comic and printing, and a
// worker's reset waited on, or deadlocked with, another worker's catalog write.
// Its own rows here, no load and no sign-up: a hand-entered comic and printing
// no Browse volume ever touched, each carrying what the old statements cleared.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const tag = `reset-comicvine ${crypto.randomUUID()}`;

const holders: string[] = [];

// The reset is the Browse volumes' whole scope, and `catalog-match-comics` holds
// one of them: without the lock, this file's reset detaches its run mid-test.
beforeAll(() => holdBrowseVolumes(sql));

afterAll(async () => {
  for (const holder of holders) {
    await sql`delete from auth.users where id = ${holder}`;
  }
  await sql`delete from items where title = ${tag}`;
  await sql`delete from series where name = ${tag}`;
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

  // Rummage R3 (1.7.1): the reset deletes the issues a Browse volume imported
  // that the fixture lacks. An edition restricts while a copy exists, so one
  // person's copy of such an issue (1.7.2's tick on a live import, the
  // Browse's "455 + N") stops the whole reset. The copy goes with the issue.
  it("takes a person's copy of an issue it deletes with it", async () => {
    // Tales of the TMNT: a Browse volume no db file attaches.
    const [series] = await sql`
      insert into series (name) values (${tag}) returning id`;
    await sql`insert into series_sources (series, source, key)
      values (${series.id}, 'comicvine', 'volume/18785')`;
    const [issue] = await sql`
      insert into items (type, title, form, source_note)
      values ('comic', ${tag}, 'issue', ${tag}) returning id`;
    await sql`insert into item_comics (item, series_id)
      values (${issue.id}, ${series.id})`;
    await sql`insert into item_sources (item, source, key)
      values (${issue.id}, 'comicvine', ${`issue/${tag}`})`;
    const [edition] = await sql`
      insert into editions (item, format) values (${issue.id}, 'floppy')
      returning id`;
    const { id: holder } = await signUp(sql);
    holders.push(holder);
    await sql`insert into copies (owner, edition)
      values (${holder}, ${edition.id})`;

    await resetComicVine(sql);

    expect(await sql`select 1 from items where id = ${issue.id}`).toHaveLength(
      0,
    );
    expect(
      await sql`select 1 from copies where edition = ${edition.id}`,
    ).toHaveLength(0);
  }, 60_000);

  // A tick lands on a loaded issue the attach kept, and A3 makes the issue a
  // floppy printing with no source (1.7.2). Nothing restricts: the printing
  // simply stays, and every other spec then reads a Floppy row on TMNT #1.
  async function attachedLoadedIssue() {
    const [series] = await sql`
      insert into series (name) values (${tag}) returning id`;
    await sql`insert into series_sources (series, source, key)
      values (${series.id}, 'comicvine', 'volume/18785')`;
    const [issue] = await sql`
      insert into items (type, title, form, source_note)
      values ('comic', ${tag}, 'issue', ${tag}) returning id`;
    await sql`insert into item_comics (item, series_id)
      values (${issue.id}, ${series.id})`;
    await sql`insert into item_sources (item, source, key)
      values (${issue.id}, 'manual', ${`${tag} ${issue.id}`})`;
    const [edition] = await sql`
      insert into editions (item, format) values (${issue.id}, 'floppy')
      returning id`;
    const { id: holder } = await signUp(sql);
    holders.push(holder);
    const [copy] = await sql`insert into copies (owner, edition)
      values (${holder}, ${edition.id}) returning id`;
    return { issue, edition, copy };
  }

  it("takes a tick's floppy copy and printing off a loaded issue the volume attached", async () => {
    const { issue, edition, copy } = await attachedLoadedIssue();

    await resetComicVine(sql);

    expect(await sql`select 1 from copies where id = ${copy.id}`).toHaveLength(
      0,
    );
    expect(
      await sql`select 1 from editions where id = ${edition.id}`,
    ).toHaveLength(0);
    expect(await sql`select 1 from items where id = ${issue.id}`).toHaveLength(
      1,
    );
  }, 60_000);

  it("leaves a loaded issue's sourced printing and its copy alone", async () => {
    const { issue, edition, copy } = await attachedLoadedIssue();
    await sql`insert into edition_sources (edition, source, key)
      values (${edition.id}, 'manual', ${`${tag} ${edition.id}`})`;

    await resetComicVine(sql);

    expect(await sql`select 1 from copies where id = ${copy.id}`).toHaveLength(
      1,
    );
    expect(
      await sql`select 1 from editions where id = ${edition.id}`,
    ).toHaveLength(1);
    expect(await sql`select 1 from items where id = ${issue.id}`).toHaveLength(
      1,
    );
  }, 60_000);
});
