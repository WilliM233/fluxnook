import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { NotFoundError } from "@/lib/catalog/import";
import {
  addEntries,
  moveEntry,
  removeEntry,
  setEntryStatus,
} from "@/lib/shelves/entries";
import { loadNook } from "@/lib/shelves/nook-page";
import {
  createSection,
  deleteSection,
  updateSection,
} from "@/lib/shelves/sections";
import { loadShelfPage } from "@/lib/shelves/shelf-page";
import { deleteShelf, updateShelf } from "@/lib/shelves/shelves";
import { required, signUp, signUpWithFixtures } from "./harness";

// A3's rule as two people (Ch 1.5.1): every shelf write and both reads, run
// by each against the other's ids, answer "no such thing", never "not
// yours", and change nothing. The caller holds the fixtures; the stranger
// holds one shelf, one section and one work, written by SQL.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();

type Holding = {
  userId: string;
  shelf: string;
  section: string;
  entry: string;
  item: string;
};
let caller: Holding;
let stranger: Holding;

/** Everything either person owns, as rows, to compare before and after. */
const everything = async () => ({
  shelves: await sql`
    select id, owner, name, description, updated_at from shelves
    where owner in (${caller.userId}, ${stranger.userId}) order by id`,
  sections: await sql`
    select x.id, x.shelf, x.name, x.position from shelf_sections x
    join shelves s on s.id = x.shelf
    where s.owner in (${caller.userId}, ${stranger.userId}) order by x.id`,
  entries: await sql`
    select e.id, e.shelf, e.section, e.item, e.position, e.status from shelf_entries e
    join shelves s on s.id = e.shelf
    where s.owner in (${caller.userId}, ${stranger.userId}) order by e.id`,
});

// A fixture load waits its turn behind every other file's (the loader's lock).
beforeAll(async () => {
  const one = await signUpWithFixtures(sql);
  const [held] = await sql`
    select s.id as shelf, x.id as section, e.id as entry, e.item
    from shelves s
    join shelf_sections x on x.shelf = s.id
    join shelf_entries e on e.section = x.id
    where s.owner = ${one.id} and s.name = 'TMNT, the Mirage run'
    order by x.position, e.position limit 1`;
  caller = { userId: one.id, ...(held as Omit<Holding, "userId">) };

  const two = await signUp(sql);
  const [{ id: shelf }] = await sql`
    insert into shelves (owner, name) values (${two.id}, 'Mine') returning id`;
  const [{ id: section }] = await sql`
    insert into shelf_sections (shelf, name, position)
    values (${shelf}, 'Only', 1) returning id`;
  const [{ id: entry }] = await sql`
    insert into shelf_entries (shelf, section, item, position)
    values (${shelf}, ${section}, ${caller.item}, 1) returning id`;
  stranger = { userId: two.id, shelf, section, entry, item: caller.item };
}, 60_000);

afterAll(async () => {
  await sql`delete from shelves where owner in (${caller.userId}, ${stranger.userId})`;
  await close();
  await sql.end();
});

/** Every write, run by `who` against `whose` ids. */
const writes: [string, (who: Holding, whose: Holding) => Promise<unknown>][] = [
  [
    "updateShelf",
    (who, whose) =>
      updateShelf(db, {
        shelfId: whose.shelf,
        userId: who.userId,
        name: "Taken",
      }),
  ],
  [
    "deleteShelf",
    (who, whose) =>
      deleteShelf(db, { shelfId: whose.shelf, userId: who.userId }),
  ],
  [
    "createSection",
    (who, whose) =>
      createSection(db, {
        shelfId: whose.shelf,
        userId: who.userId,
        name: "Taken",
      }),
  ],
  [
    "updateSection",
    (who, whose) =>
      updateSection(db, {
        shelfId: whose.shelf,
        userId: who.userId,
        sectionId: whose.section,
        name: "Taken",
        position: 2,
      }),
  ],
  [
    "deleteSection",
    (who, whose) =>
      deleteSection(db, {
        shelfId: whose.shelf,
        userId: who.userId,
        sectionId: whose.section,
      }),
  ],
  [
    "addEntries",
    (who, whose) =>
      addEntries(db, {
        shelfId: whose.shelf,
        userId: who.userId,
        items: [who.item],
      }),
  ],
  [
    "setEntryStatus",
    (who, whose) =>
      setEntryStatus(db, {
        shelfId: whose.shelf,
        userId: who.userId,
        entryId: whose.entry,
        status: "done",
      }),
  ],
  [
    "moveEntry",
    (who, whose) =>
      moveEntry(db, {
        shelfId: whose.shelf,
        userId: who.userId,
        entryId: whose.entry,
        section: null,
        index: 0,
      }),
  ],
  [
    "removeEntry",
    (who, whose) =>
      removeEntry(db, {
        shelfId: whose.shelf,
        userId: who.userId,
        entryId: whose.entry,
      }),
  ],
];

describe("the owner rule, both ways", () => {
  it.each(writes)(
    "%s across owners is NotFoundError, both ways, and nothing changed",
    async (_name, write) => {
      const before = await everything();
      await expect(write(stranger, caller)).rejects.toThrow(NotFoundError);
      await expect(write(caller, stranger)).rejects.toThrow(NotFoundError);
      expect(await everything()).toEqual(before);
    },
  );

  it("a stranger's section in the caller's move is NotFoundError and nothing moved", async () => {
    const before = await everything();
    await expect(
      moveEntry(db, {
        shelfId: caller.shelf,
        userId: caller.userId,
        entryId: caller.entry,
        section: stranger.section,
        index: 0,
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      addEntries(db, {
        shelfId: caller.shelf,
        userId: caller.userId,
        items: [caller.item],
        section: stranger.section,
      }),
    ).rejects.toThrow(NotFoundError);
    expect(await everything()).toEqual(before);
  });

  it("the nook lists only the caller's three, and the stranger's one", async () => {
    expect(
      (await loadNook(db, caller.userId)).shelves.map((s) => s.name),
    ).toEqual([
      "TMNT, the Mirage run",
      "Stephen King Watch List",
      "Stephen King, publication order",
    ]);
    expect(
      (await loadNook(db, stranger.userId)).shelves.map((s) => s.id),
    ).toEqual([stranger.shelf]);
  });

  it("the shelf page is null across owners", async () => {
    expect(
      await loadShelfPage(db, { id: caller.shelf, userId: stranger.userId }),
    ).toBeNull();
    expect(
      await loadShelfPage(db, { id: stranger.shelf, userId: caller.userId }),
    ).toBeNull();
    expect(
      await loadShelfPage(db, { id: stranger.shelf, userId: stranger.userId }),
    ).not.toBeNull();
  });
});
