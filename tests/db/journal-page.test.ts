import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { workLine } from "@/lib/catalog/work-line";
import { type Cursor, nextCursor, parseCursor } from "@/lib/journal/cursor";
import { createEntry } from "@/lib/journal/entries";
import { loadItemReads } from "@/lib/journal/item-reads";
import { loadJournalPage } from "@/lib/journal/journal-page";
import { latestStarred } from "@/lib/journal/order";
import { createRead, updateRead } from "@/lib/journal/reads";
import {
  loadShelfPage,
  ratedOf,
  type ShelfPage,
} from "@/lib/shelves/shelf-page";
import { itemFor, required, signUpWithFixtures } from "./harness";

// What 1.6.3's pages read of the journal (Ch 1.6 A9), on one account holding
// the fixtures, with the Browse's writes made through the lib: TMNT #1's
// fixture read starred 4; Carrie (1974) read twice, the first at 4.5;
// Salem's Lot at 5; Carrie (1976) at 3.5. TMNT #2 is the order's trap: its
// fixture read (no dates, so it sorts by today) starred 3, then a read
// finished in 2019 at 5 logged after it, so "the newest logged" would say 5
// and A5's order says 3.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
let userId: string;
const shelf = { tmnt: "", watch: "", books: "" };
const work = { tmnt1: "", tmnt2: "", carrie: "", salems: "", carrie1976: "" };
const TODAY = "2026-11-03";

const page = async (id: string) =>
  (await loadShelfPage(db, { id, userId })) as ShelfPage;
const allRows = (p: ShelfPage) => [
  ...p.unsectioned,
  ...p.sections.flatMap((s) => s.rows),
];
const fixtureRead = async (item: string) => {
  const [{ id }] = await sql`
    select id from occurrences where owner = ${userId} and item = ${item}`;
  return id as string;
};

// A fixture load waits its turn behind every other file's (the loader's lock).
beforeAll(async () => {
  ({ id: userId } = await signUpWithFixtures(sql));
  const shelves =
    await sql`select id, name from shelves where owner = ${userId}`;
  const named = (name: string) => shelves.find((r) => r.name === name)?.id;
  shelf.tmnt = named("TMNT, the Mirage run");
  shelf.watch = named("Stephen King Watch List");
  shelf.books = named("Stephen King, publication order");
  work.tmnt1 = await itemFor(sql, "manual", "tmnt-mirage-v1-1");
  work.tmnt2 = await itemFor(sql, "manual", "tmnt-mirage-v1-2");
  work.carrie = await itemFor(sql, "manual", "carrie-1974");
  work.salems = await itemFor(sql, "manual", "salems-lot-1975");
  work.carrie1976 = await itemFor(sql, "letterboxd", "20ZQ");

  await updateRead(db, {
    userId,
    readId: await fixtureRead(work.tmnt1),
    stars: 4,
  });
  await createRead(db, {
    userId,
    item: work.carrie,
    status: "done",
    startedOn: "2026-10-28",
    finishedOn: TODAY,
    stars: 4.5,
  });
  await createRead(db, {
    userId,
    item: work.carrie,
    status: "done",
    finishedOn: TODAY,
  });
  await createRead(db, {
    userId,
    item: work.salems,
    status: "done",
    finishedOn: TODAY,
    stars: 5,
  });
  await createRead(db, {
    userId,
    item: work.carrie1976,
    status: "done",
    finishedOn: TODAY,
    stars: 3.5,
  });
  await updateRead(db, {
    userId,
    readId: await fixtureRead(work.tmnt2),
    stars: 3,
  });
  await createRead(db, {
    userId,
    item: work.tmnt2,
    status: "done",
    finishedOn: "2019-03-09",
    stars: 5,
  });
}, 60_000);

afterAll(async () => {
  await sql`delete from occurrences where owner = ${userId}`;
  await sql`delete from shelves where owner = ${userId}`;
  await close();
  await sql.end();
});

describe("a shelf's stars (A9)", () => {
  it("the publication-order shelf after the Browse's writes: Carrie 4.5 and read twice, Salem's Lot 5, the rest unrated, the mean 4.8 from 2", async () => {
    const rows = allRows(await page(shelf.books));
    expect(rows).toHaveLength(11);
    expect(
      rows.slice(0, 2).map((r) => [r.item.title, r.stars, r.reads]),
    ).toEqual([
      ["Carrie", 4.5, 2],
      ["Salem's Lot", 5, 1],
    ]);
    for (const row of rows.slice(2)) {
      expect([row.item.title, row.stars, row.reads]).toEqual([
        row.item.title,
        null,
        0,
      ]);
    }
    expect(ratedOf(rows)).toEqual({ mean: 4.8, n: 2 });
  });

  it("a row's stars are its latest starred read's, by A5's order", async () => {
    const rows = [
      ...allRows(await page(shelf.books)),
      ...allRows(await page(shelf.tmnt)),
    ];
    for (const item of [work.carrie, work.tmnt1, work.tmnt2]) {
      const reads = await loadItemReads(db, { itemId: item, userId });
      const row = rows.find((r) => r.item.id === item);
      expect(row?.stars).toBe(latestStarred(reads)?.stars ?? null);
      expect(row?.reads).toBe(reads.length);
    }
    // The trap: the 2019 read was logged last, and A5's order still puts
    // the undated fixture read (today, by its load) first.
    expect(rows.find((r) => r.item.id === work.tmnt2)?.stars).toBe(3);
  });

  it("the TMNT shelf: 26 rows read, two starred, the mean on Volume 1's section alone", async () => {
    const p = await page(shelf.tmnt);
    const rows = allRows(p);
    expect(rows).toHaveLength(326);
    expect(rows.filter((r) => r.reads > 0)).toHaveLength(26);
    expect(rows.filter((r) => r.reads === 2).map((r) => r.item.id)).toEqual([
      work.tmnt2,
    ]);
    expect(rows.filter((r) => r.stars !== null)).toHaveLength(2);
    expect(ratedOf(rows)).toEqual({ mean: 3.5, n: 2 });

    const holding = p.sections.filter((s) =>
      s.rows.some((r) => r.item.id === work.tmnt1),
    );
    expect(holding).toHaveLength(1);
    expect(ratedOf(holding[0].rows)).toEqual({ mean: 3.5, n: 2 });
    for (const s of p.sections.filter((s) => s !== holding[0])) {
      expect(ratedOf(s.rows).n).toBe(0);
    }
  });

  it("the Watch List: Carrie (1976) 3.5, the mean 3.5 from 1", async () => {
    const rows = allRows(await page(shelf.watch));
    expect(rows).toHaveLength(61);
    expect([rows[0].item.title, rows[0].stars, rows[0].reads]).toEqual([
      "Carrie",
      3.5,
      1,
    ]);
    expect(ratedOf(rows)).toEqual({ mean: 3.5, n: 1 });
  });
});

describe("the Journal page's read (A8)", () => {
  // 51 rows (A13): Carrie's first read takes 50, two on one instant, the
  // oldest, and 48 a minute apart after them; Salem's Lot's read takes one.
  const TIE = "2019-03-09T21:14:03.512345Z";
  const written: string[] = [];

  beforeAll(async () => {
    const [{ id: carrieRead }] = await sql`select id from occurrences
      where owner = ${userId} and item = ${work.carrie} and stars = 4.5`;
    const [{ id: salemsRead }] = await sql`select id from occurrences
      where owner = ${userId} and item = ${work.salems}`;
    for (let k = 1; k <= 50; k++) {
      const at =
        k > 48 ? TIE : `2019-03-10T00:${String(k).padStart(2, "0")}:00.000000Z`;
      const { id } = await createEntry(db, {
        userId,
        readId: carrieRead,
        body: `Entry ${k}.`,
        writtenAt: at,
      });
      written.push(id);
    }
    await createEntry(db, {
      userId,
      readId: salemsRead,
      body: "Ben Mears comes home.",
      anchorKind: "chapter",
      anchorValue: "1",
      writtenAt: "2019-03-11T09:00:00Z",
    });
  });

  it("the totals count entries and distinct works", async () => {
    const page = await loadJournalPage(db, { userId });
    expect(page.totals).toEqual({ entries: 51, works: 2 });
  });

  it("51 entries page at 50 by keyset, and the two on one instant never repeat or vanish", async () => {
    const first = await loadJournalPage(db, { userId });
    expect(first.rows).toHaveLength(50);
    const last = first.rows[49].entry;
    expect(first.older).toEqual({ writtenAt: last.writtenAt, id: last.id });
    // Row 50 is one of the tied pair, so the cut falls inside the tie.
    expect(last.writtenAt).toBe(TIE);
    expect(parseCursor(nextCursor(first.older as Cursor))).toEqual(first.older);

    const second = await loadJournalPage(db, {
      userId,
      before: first.older as Cursor,
    });
    expect(second.rows).toHaveLength(1);
    expect(second.older).toBeNull();
    expect(second.totals).toEqual(first.totals);

    const ids = [...first.rows, ...second.rows].map((r) => r.entry.id);
    expect(new Set(ids).size).toBe(51);
    for (const id of written) expect(ids).toContain(id);
    const tied = [...first.rows, ...second.rows].filter(
      (r) => r.entry.writtenAt === TIE,
    );
    expect(tied.map((r) => r.entry.id)).toEqual(
      written.slice(48).sort().reverse(),
    );
  });

  it("rows come newest first, each with its work's line, its read's state fields and the time's text", async () => {
    const { rows } = await loadJournalPage(db, { userId });
    const times = rows.map((r) => r.entry.writtenAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(rows[0].entry).toMatchObject({
      body: "Ben Mears comes home.",
      anchorKind: "chapter",
      anchorValue: "1",
    });
    expect(rows[0].work.title).toBe("Salem's Lot");
    expect(rows[0].read).toMatchObject({ status: "done", stars: 5 });
    const carrie = rows[1];
    expect(carrie.work.title).toBe("Carrie");
    expect(workLine(carrie.work)).toBe("1974 · Novel · Stephen King");
    expect(carrie.read).toMatchObject({
      status: "done",
      startedOn: "2026-10-28",
      finishedOn: TODAY,
      stars: 4.5,
    });
    for (const r of rows) {
      expect(r.entry.writtenAt).toMatch(
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/,
      );
    }
  });

  it("an account with no entries has an empty journal", async () => {
    const page = await loadJournalPage(db, { userId: crypto.randomUUID() });
    expect(page).toEqual({
      totals: { entries: 0, works: 0 },
      rows: [],
      older: null,
    });
  });
});
