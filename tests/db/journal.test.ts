import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import { loadItemPage } from "@/lib/catalog/item-page";
import { createEntry, deleteEntry, updateEntry } from "@/lib/journal/entries";
import { FINISHED_BEFORE, RuleError, STILL_GOING } from "@/lib/journal/errors";
import { loadItemReads } from "@/lib/journal/item-reads";
import { sortReads } from "@/lib/journal/order";
import {
  createRead,
  deleteRead,
  OPEN_ALREADY,
  updateRead,
} from "@/lib/journal/reads";
import { itemFor, required, signUpWithFixtures } from "./harness";

// The journal's writes on one account holding the fixtures (Ch 1.6.1): a
// read and its first entry as one transaction, one open read per work under
// a race, the cascade. Every write is on Carrie, Carrie (1976) or Salem's
// Lot, which the fixtures leave unread, so the 26 Mirage reads stand.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();

let userId: string;
let carrie: string;
let carrieFilm: string;
let salemsLot: string;

const readsOf = (item: string) => sql`
  select id, status, started_on::text as started_on, finished_on::text as finished_on,
    stars, visibility from occurrences
  where owner = ${userId} and item = ${item} order by created_at`;

const entriesOf = (read: string) => sql`
  select id, body, anchor_kind, anchor_value from journal_entries
  where occurrence = ${read} order by written_at`;

const refused = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a refusal");
};

beforeAll(async () => {
  ({ id: userId } = await signUpWithFixtures(sql));
  carrie = await itemFor(sql, "manual", "carrie-1974");
  carrieFilm = await itemFor(sql, "letterboxd", "20ZQ");
  salemsLot = await itemFor(sql, "manual", "salems-lot-1975");
}, 60_000);

beforeEach(async () => {
  await sql`delete from occurrences where owner = ${userId}
    and item in (${carrie}, ${carrieFilm}, ${salemsLot})`;
});

afterAll(async () => {
  await close();
  await sql.end();
});

describe("createRead", () => {
  it("writes a private done read with its dates and stars and reads back", async () => {
    const { id, entryId } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
      startedOn: "2026-10-28",
      finishedOn: "2026-11-02",
      stars: 4.5,
    });
    expect(entryId).toBeUndefined();
    const [read] = await readsOf(carrie);
    expect(read).toEqual({
      id,
      status: "done",
      started_on: "2026-10-28",
      finished_on: "2026-11-02",
      stars: "4.5",
      visibility: "private",
    });
  });

  it("with a first entry writes both, the entry on the read, in one transaction", async () => {
    const { id, entryId } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
      entry: {
        body: "Finished in a weekend.",
        anchorKind: "page",
        anchorValue: "112",
      },
    });
    expect(await entriesOf(id)).toEqual([
      {
        id: entryId,
        body: "Finished in a weekend.",
        anchor_kind: "page",
        anchor_value: "112",
      },
    ]);
  });

  it("an entry made to fail leaves no read", async () => {
    // Past the Zod, which would refuse a kind with no value first.
    const error = await refused(
      createRead(db, {
        userId,
        item: carrie,
        status: "done",
        entry: { body: "x", anchorKind: "page", anchorValue: null },
      }),
    );
    expect(String((error as Error).cause ?? error)).toMatch(
      /journal_entries_anchor/,
    );
    expect(await readsOf(carrie)).toHaveLength(0);
  });

  it("a second Reading of the same work is ConflictError and one open read stands", async () => {
    await createRead(db, { userId, item: carrie, status: "in_progress" });
    const error = await refused(
      createRead(db, { userId, item: carrie, status: "in_progress" }),
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(OPEN_ALREADY);
    expect(await readsOf(carrie)).toHaveLength(1);
  });

  it("two Readings at once end with one open read", async () => {
    const results = await Promise.allSettled([
      createRead(db, { userId, item: carrieFilm, status: "in_progress" }),
      createRead(db, { userId, item: carrieFilm, status: "in_progress" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const lost = results.find((r) => r.status === "rejected");
    expect(lost?.reason).toBeInstanceOf(ConflictError);
    expect(lost?.reason.message).toBe(OPEN_ALREADY);
    const open = await sql`select 1 from occurrences
      where owner = ${userId} and item = ${carrieFilm} and status = 'in_progress'`;
    expect(open).toHaveLength(1);
  });

  it("Finished before Started is RuleError at finishedOn, and nothing is written", async () => {
    const error = await refused(
      createRead(db, {
        userId,
        item: carrie,
        status: "done",
        startedOn: "2026-11-02",
        finishedOn: "2026-10-28",
      }),
    );
    expect(error).toBeInstanceOf(RuleError);
    expect(error).toMatchObject({
      field: "finishedOn",
      message: FINISHED_BEFORE,
    });
    expect(await readsOf(carrie)).toHaveLength(0);
  });

  it("a first entry's kind the work doesn't take is RuleError at entry.anchorKind, and nothing is written", async () => {
    const error = await refused(
      createRead(db, {
        userId,
        item: carrie,
        status: "done",
        entry: { body: "x", anchorKind: "episode", anchorValue: "S02E03" },
      }),
    );
    expect(error).toMatchObject({
      field: "entry.anchorKind",
      message: "A book takes page or chapter.",
    });
    expect(await readsOf(carrie)).toHaveLength(0);
  });

  it("a uuid that isn't a work is NotFoundError", async () => {
    await expect(
      createRead(db, { userId, item: crypto.randomUUID(), status: "done" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("updateRead", () => {
  it("to Reading beside an open read is ConflictError", async () => {
    await createRead(db, { userId, item: carrie, status: "in_progress" });
    const { id } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
    });
    const error = await refused(
      updateRead(db, { userId, readId: id, status: "in_progress" }),
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((await readsOf(carrie)).map((r) => r.status).sort()).toEqual([
      "done",
      "in_progress",
    ]);
  });

  it("merges: stars alone keeps the dates, null clears, Reading over a finished read is RuleError", async () => {
    const { id } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
      startedOn: "2026-10-28",
      finishedOn: "2026-11-02",
    });
    expect(await updateRead(db, { userId, readId: id, stars: 4 })).toEqual({
      id,
      item: carrie,
      status: "done",
      startedOn: "2026-10-28",
      finishedOn: "2026-11-02",
      stars: 4,
    });
    expect(
      await updateRead(db, {
        userId,
        readId: id,
        finishedOn: null,
        stars: null,
      }),
    ).toMatchObject({ startedOn: "2026-10-28", finishedOn: null, stars: null });

    await updateRead(db, { userId, readId: id, finishedOn: "2026-11-02" });
    const error = await refused(
      updateRead(db, { userId, readId: id, status: "in_progress" }),
    );
    expect(error).toMatchObject({ field: "finishedOn", message: STILL_GOING });
    expect(
      await updateRead(db, {
        userId,
        readId: id,
        status: "in_progress",
        finishedOn: null,
      }),
    ).toMatchObject({ status: "in_progress", finishedOn: null });
  });

  it("Finished before Started is RuleError and the read is unchanged", async () => {
    const { id } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
      startedOn: "2026-10-28",
    });
    const error = await refused(
      updateRead(db, { userId, readId: id, finishedOn: "2026-10-01" }),
    );
    expect(error).toMatchObject({
      field: "finishedOn",
      message: FINISHED_BEFORE,
    });
    const [read] = await readsOf(carrie);
    expect(read.finished_on).toBeNull();
  });

  it("a random id is NotFoundError", async () => {
    await expect(
      updateRead(db, { userId, readId: crypto.randomUUID(), stars: 3 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("deleteRead", () => {
  it("takes its two entries", async () => {
    const { id } = await createRead(db, {
      userId,
      item: salemsLot,
      status: "done",
      stars: 5,
      entry: {
        body: "Ben Mears comes home.",
        anchorKind: "chapter",
        anchorValue: "1",
      },
    });
    await sql`insert into journal_entries (occurrence, body) values (${id}, 'Again.')`;
    expect(await entriesOf(id)).toHaveLength(2);

    await deleteRead(db, { userId, readId: id });
    expect(await readsOf(salemsLot)).toHaveLength(0);
    expect(await entriesOf(id)).toHaveLength(0);
  });

  it("a random id is NotFoundError", async () => {
    await expect(
      deleteRead(db, { userId, readId: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("entries", () => {
  const writtenAtOf = async (entry: string) => {
    const [row] = await sql`
      select to_char(written_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at,
        extract(epoch from now() - written_at) as age
      from journal_entries where id = ${entry}`;
    return row as { at: string; age: string };
  };

  it("createEntry with page 112 on the caller's read reads back with its anchor, written now", async () => {
    const { id: readId } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
    });
    const { id } = await createEntry(db, {
      userId,
      readId,
      body: "The shower scene.",
      anchorKind: "page",
      anchorValue: "112",
    });
    expect(await entriesOf(readId)).toEqual([
      {
        id,
        body: "The shower scene.",
        anchor_kind: "page",
        anchor_value: "112",
      },
    ]);
    expect(Math.abs(Number((await writtenAtOf(id)).age))).toBeLessThan(60);
  });

  it("createEntry with writtenAt set keeps the microseconds, in the cursor's text form", async () => {
    const { id: readId } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
    });
    const at = "2019-03-09T21:14:03.512345Z";
    const { id } = await createEntry(db, {
      userId,
      readId,
      body: "Caught up.",
      writtenAt: at,
    });
    expect((await writtenAtOf(id)).at).toBe(at);
  });

  it("episode on a book and page on a film are RuleError; episode on a show is fine", async () => {
    const { id: book } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
    });
    await expect(
      createEntry(db, {
        userId,
        readId: book,
        body: "x",
        anchorKind: "episode",
        anchorValue: "S02E03",
      }),
    ).rejects.toMatchObject({
      field: "anchorKind",
      message: "A book takes page or chapter.",
    });

    const { id: film } = await createRead(db, {
      userId,
      item: carrieFilm,
      status: "done",
    });
    await expect(
      createEntry(db, {
        userId,
        readId: film,
        body: "x",
        anchorKind: "page",
        anchorValue: "1",
      }),
    ).rejects.toBeInstanceOf(RuleError);
    expect(await entriesOf(book)).toHaveLength(0);
    expect(await entriesOf(film)).toHaveLength(0);

    const title = `journal tv ${crypto.randomUUID()}`;
    const [{ id: show }] = await sql`
      insert into items (type, title) values ('tv', ${title}) returning id`;
    try {
      const { id: watch } = await createRead(db, {
        userId,
        item: show,
        status: "in_progress",
      });
      await createEntry(db, {
        userId,
        readId: watch,
        body: "The cold open.",
        anchorKind: "episode",
        anchorValue: "S02E03",
      });
      expect(await entriesOf(watch)).toMatchObject([
        { anchor_kind: "episode", anchor_value: "S02E03" },
      ]);
    } finally {
      await sql`delete from occurrences where item = ${show}`;
      await sql`delete from items where id = ${show}`;
    }
  });

  it("updateEntry changes the body alone, the anchor pair together, clears it, and moves written_at", async () => {
    const { id: readId } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
    });
    const { id: entryId } = await createEntry(db, {
      userId,
      readId,
      body: "First.",
      anchorKind: "page",
      anchorValue: "12",
    });
    const key = { userId, readId, entryId };

    expect(await updateEntry(db, { ...key, body: "Second." })).toMatchObject({
      id: entryId,
      occurrence: readId,
      body: "Second.",
      anchorKind: "page",
      anchorValue: "12",
    });
    expect(
      await updateEntry(db, {
        ...key,
        anchorKind: "chapter",
        anchorValue: "7",
      }),
    ).toMatchObject({
      body: "Second.",
      anchorKind: "chapter",
      anchorValue: "7",
    });
    expect(
      await updateEntry(db, { ...key, anchorKind: null, anchorValue: null }),
    ).toMatchObject({ anchorKind: null, anchorValue: null });

    const moved = await updateEntry(db, {
      ...key,
      writtenAt: "2026-10-29T08:00:00.000001Z",
    });
    expect(moved.writtenAt).toBe("2026-10-29T08:00:00.000001Z");
    expect(moved.body).toBe("Second.");
  });

  it("updateEntry to a kind the work doesn't take is RuleError and the entry stands", async () => {
    const { id: readId } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
    });
    const { id: entryId } = await createEntry(db, {
      userId,
      readId,
      body: "x",
    });
    await expect(
      updateEntry(db, {
        userId,
        readId,
        entryId,
        anchorKind: "issue",
        anchorValue: "7",
      }),
    ).rejects.toMatchObject({ field: "anchorKind" });
    expect(await entriesOf(readId)).toMatchObject([{ anchor_kind: null }]);
  });

  it("deleteEntry takes one and the read stays with the other", async () => {
    const { id: readId, entryId: first } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
      entry: { body: "One." },
    });
    const { id: second } = await createEntry(db, {
      userId,
      readId,
      body: "Two.",
    });
    await deleteEntry(db, { userId, readId, entryId: first as string });
    expect((await entriesOf(readId)).map((e) => e.id)).toEqual([second]);
    expect(await readsOf(carrie)).toHaveLength(1);
  });

  it("an entry asked for under another of the caller's reads is NotFoundError, and nothing changes", async () => {
    const tmnt = await itemFor(sql, "manual", "tmnt-mirage-v1-1");
    const [{ id: fixtureRead }] = await sql`
      select id from occurrences where owner = ${userId} and item = ${tmnt}`;
    const { id: readId, entryId } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
      entry: { body: "Mine, on Carrie." },
    });
    const elsewhere = {
      userId,
      readId: fixtureRead as string,
      entryId: entryId as string,
    };
    await expect(
      updateEntry(db, { ...elsewhere, body: "moved" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteEntry(db, elsewhere)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await entriesOf(readId)).toMatchObject([
      { id: entryId, body: "Mine, on Carrie." },
    ]);
    expect(await entriesOf(fixtureRead)).toHaveLength(0);
  });

  it("createEntry on a random read id is NotFoundError", async () => {
    await expect(
      createEntry(db, { userId, readId: crypto.randomUUID(), body: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("loadItemReads", () => {
  it("the 26 fixture reads read back one per issue page: done, no dates, no stars, no entries, one created_at", async () => {
    const fixture = JSON.parse(
      readFileSync("supabase/seed/fixtures/tmnt-mirage.json", "utf8"),
    ) as { occurrences: { item: string; status: string }[] };
    expect(fixture.occurrences).toHaveLength(26);

    const createdAt = new Set<string>();
    for (const { item } of fixture.occurrences) {
      const [source, key] = item.split(/:(.*)/);
      const reads = await loadItemReads(db, {
        itemId: await itemFor(sql, source, key),
        userId,
      });
      expect(reads, item).toHaveLength(1);
      expect(reads[0], item).toMatchObject({
        status: "done",
        startedOn: null,
        finishedOn: null,
        stars: null,
        entries: [],
      });
      createdAt.add(reads[0].createdAt);
    }
    expect(createdAt.size).toBe(1);
    expect([...createdAt][0]).toMatch(
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/,
    );
  });

  it("the caller's reads of a work come back in A5's order with their entries newest first", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { id: march } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
      startedOn: "2019-03-03",
      finishedOn: "2019-03-09",
      stars: 4.5,
      entry: { body: "Finished.", writtenAt: "2019-03-09T21:00:00Z" },
    });
    const { id: later } = await createEntry(db, {
      userId,
      readId: march,
      body: "Still thinking about it.",
      anchorKind: "page",
      anchorValue: "112",
      writtenAt: "2019-03-10T08:00:00.000001Z",
    });
    const { id: open } = await createRead(db, {
      userId,
      item: carrie,
      status: "in_progress",
      startedOn: today,
    });
    const { id: done } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
      finishedOn: today,
    });

    const reads = await loadItemReads(db, { itemId: carrie, userId });
    expect(reads.map((r) => r.id)).toEqual([done, open, march]);
    expect(reads.map((r) => r.id)).toEqual(sortReads(reads).map((r) => r.id));
    expect(reads[2].stars).toBe(4.5);
    expect(reads[2].entries.map((e) => e.id)).toEqual([
      later,
      expect.any(String),
    ]);
    expect(reads[2].entries[0]).toEqual({
      id: later,
      writtenAt: "2019-03-10T08:00:00.000001Z",
      body: "Still thinking about it.",
      anchorKind: "page",
      anchorValue: "112",
    });
    expect(reads[0].entries).toEqual([]);
  });

  it("loadItemPage carries the reads and the rest of the page as before", async () => {
    await createRead(db, { userId, item: carrie, status: "done", stars: 4 });
    const page = await loadItemPage(db, { id: carrie, userId });
    expect(page?.reads).toHaveLength(1);
    expect(page?.reads[0].stars).toBe(4);
    expect(page?.shelves.map((s) => s.name)).toContain(
      "Stephen King, publication order",
    );
  });

  it("a work with no read is an empty list, and so is someone else's", async () => {
    expect(await loadItemReads(db, { itemId: carrie, userId })).toEqual([]);
    const tmnt = await itemFor(sql, "manual", "tmnt-mirage-v1-1");
    expect(
      await loadItemReads(db, { itemId: tmnt, userId: crypto.randomUUID() }),
    ).toEqual([]);
  });
});
