import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { NotFoundError } from "@/lib/catalog/import";
import { createEntry, deleteEntry, updateEntry } from "@/lib/journal/entries";
import { loadItemReads } from "@/lib/journal/item-reads";
import { createRead, deleteRead, updateRead } from "@/lib/journal/reads";
import { itemFor, required, signUp, signUpWithFixtures } from "./harness";

// A3's and A4's rule as two people (Ch 1.6.1): every write to a read or an
// entry, run by each against the other's ids, answers "no such thing",
// never "not yours", and changes nothing; the item page reads each person's
// own. The caller holds the fixtures (TMNT #1's read is theirs); the
// stranger holds one read of the same issue and one entry, written by SQL.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();

type Holding = { userId: string; read: string; entry: string };
let caller: Holding;
let stranger: Holding;
let tmnt: string;
let carrie: string;

/** Everything either person has written, as rows, to compare before and after. */
const everything = async () => ({
  reads: await sql`
    select id, owner, item, status, started_on, finished_on, stars, updated_at
    from occurrences where owner in (${caller.userId}, ${stranger.userId})
    order by id`,
  entries: await sql`
    select e.id, e.occurrence, e.written_at, e.body, e.anchor_kind, e.anchor_value
    from journal_entries e join occurrences o on o.id = e.occurrence
    where o.owner in (${caller.userId}, ${stranger.userId}) order by e.id`,
});

// A fixture load waits its turn behind every other file's (the loader's lock).
// The load comes first: from a fresh reset the catalog is empty until it lands.
beforeAll(async () => {
  const one = await signUpWithFixtures(sql);
  tmnt = await itemFor(sql, "manual", "tmnt-mirage-v1-1");
  carrie = await itemFor(sql, "manual", "carrie-1974");

  const [{ id: read }] = await sql`
    select id from occurrences where owner = ${one.id} and item = ${tmnt}`;
  const { id: entry } = await createEntry(db, {
    userId: one.id,
    readId: read,
    body: "The origin, at last.",
    anchorKind: "page",
    anchorValue: "1",
  });
  caller = { userId: one.id, read, entry };

  const two = await signUp(sql);
  const [{ id: theirs }] = await sql`
    insert into occurrences (owner, item, status) values (${two.id}, ${tmnt}, 'done')
    returning id`;
  const [{ id: theirEntry }] = await sql`
    insert into journal_entries (occurrence, body) values (${theirs}, 'Mine.')
    returning id`;
  stranger = { userId: two.id, read: theirs, entry: theirEntry };
}, 60_000);

afterAll(async () => {
  await sql`delete from journal_entries where id = ${caller.entry}`;
  await sql`delete from occurrences where owner = ${stranger.userId}`;
  await sql`delete from occurrences where owner = ${caller.userId} and item = ${carrie}`;
  await close();
  await sql.end();
});

const writes = [
  [
    "updateRead",
    (who: string, of: Holding) =>
      updateRead(db, { userId: who, readId: of.read, stars: 1 }),
  ],
  [
    "deleteRead",
    (who: string, of: Holding) =>
      deleteRead(db, { userId: who, readId: of.read }),
  ],
  [
    "createEntry",
    (who: string, of: Holding) =>
      createEntry(db, { userId: who, readId: of.read, body: "Not mine." }),
  ],
  [
    "updateEntry",
    (who: string, of: Holding) =>
      updateEntry(db, {
        userId: who,
        readId: of.read,
        entryId: of.entry,
        body: "Not mine.",
      }),
  ],
  [
    "deleteEntry",
    (who: string, of: Holding) =>
      deleteEntry(db, { userId: who, readId: of.read, entryId: of.entry }),
  ],
] as const;

describe("the journal's owner rule", () => {
  it.each(writes)(
    "%s across owners is NotFoundError, both ways, and nothing changed",
    async (_name, write) => {
      const before = await everything();
      await expect(write(stranger.userId, caller)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(write(caller.userId, stranger)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(await everything()).toEqual(before);
    },
  );

  it("the page's reads of one work are each person's own", async () => {
    const mine = await loadItemReads(db, {
      itemId: tmnt,
      userId: caller.userId,
    });
    expect(mine.map((r) => r.id)).toEqual([caller.read]);
    expect(mine[0].entries.map((e) => e.id)).toEqual([caller.entry]);

    const theirs = await loadItemReads(db, {
      itemId: tmnt,
      userId: stranger.userId,
    });
    expect(theirs.map((r) => r.id)).toEqual([stranger.read]);
    expect(theirs[0].entries.map((e) => e.body)).toEqual(["Mine."]);
  });

  it("two people may each have one open read of the same work", async () => {
    await createRead(db, {
      userId: caller.userId,
      item: carrie,
      status: "in_progress",
    });
    const { id } = await createRead(db, {
      userId: stranger.userId,
      item: carrie,
      status: "in_progress",
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const open = await sql`select owner from occurrences
      where item = ${carrie} and status = 'in_progress'
        and owner in (${caller.userId}, ${stranger.userId})`;
    expect(open).toHaveLength(2);
  });
});
