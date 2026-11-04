import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { NotFoundError } from "@/lib/catalog/import";
import { deleteCopy, NO_COPY, updateCopy } from "@/lib/collection/copies";
import { heldEditions, loadOwnership } from "@/lib/collection/owned";
import { itemFor, required, signUp, signUpWithFixtures } from "./harness";

// A3's and A4's rule as two people: each write, run by each against the
// other's copy, answers "no such thing", never "not yours", and changes
// nothing; a read shows only the caller's. The caller holds the fixtures'
// five hardcovers; the stranger holds one copy of a printing of its own,
// written by SQL.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const tag = `copies-owner ${crypto.randomUUID()}`;

type Holding = { userId: string; copy: string };
let caller: Holding;
let stranger: Holding;
let edition: string;
let tmnt1: string;
let uc1: string;

/** Both people's copies, as rows, to compare before and after. */
const everything = () =>
  sql`select id, owner, edition, condition, acquired_on, note, updated_at
    from copies where owner in (${caller.userId}, ${stranger.userId}) order by id`;

// A fixture load waits its turn behind every other file's (the loader's lock).
beforeAll(async () => {
  const one = await signUpWithFixtures(sql);
  tmnt1 = await itemFor(sql, "manual", "tmnt-mirage-v1-1");
  uc1 = await itemFor(sql, "manual", "tmnt-ultimate-collection-1");
  const [theirs] = await sql`
    select c.id from copies c join editions e on e.id = c.edition
    where c.owner = ${one.id} and e.item = ${uc1}`;
  caller = { userId: one.id, copy: theirs.id };

  const two = await signUp(sql);
  const [item] = await sql`
    insert into items (type, title, form, source_note)
    values ('book', ${tag}, 'novel', ${tag}) returning id`;
  [{ id: edition }] = await sql`
    insert into editions (item, format) values (${item.id}, 'paperback') returning id`;
  const [mine] = await sql`
    insert into copies (owner, edition, note) values (${two.id}, ${edition}, 'Mine.')
    returning id`;
  stranger = { userId: two.id, copy: mine.id };
}, 60_000);

afterAll(async () => {
  await sql`delete from copies where edition = ${edition}`;
  await sql`delete from items where source_note = ${tag}`;
  await sql`delete from auth.users where id = ${stranger.userId}`;
  await close();
  await sql.end();
});

describe("the owner rule", () => {
  it("updateCopy and deleteCopy across owners are NotFoundError both ways and nothing changed", async () => {
    const before = await everything();
    for (const [actor, target] of [
      [caller, stranger],
      [stranger, caller],
    ]) {
      await expect(
        updateCopy(db, {
          userId: actor.userId,
          copyId: target.copy,
          note: "not yours",
        }),
      ).rejects.toThrow(new NotFoundError(NO_COPY));
      await expect(
        deleteCopy(db, { userId: actor.userId, copyId: target.copy }),
      ).rejects.toThrow(new NotFoundError(NO_COPY));
    }
    expect(await everything()).toEqual(before);
  });

  it("loadOwnership of TMNT #1 and Ultimate Collection 1 as the stranger is empty", async () => {
    const empty = { held: [], via: [], host: null };
    for (const itemId of [tmnt1, uc1]) {
      expect(
        await loadOwnership(db, { itemId, userId: stranger.userId }),
      ).toEqual(empty);
    }
  });

  it("two people each hold one printing and each reads only their own", async () => {
    const [{ id: second }] = await sql`
      insert into copies (owner, edition) values (${caller.userId}, ${edition})
      returning id`;
    const [{ item }] =
      await sql`select item from editions where id = ${edition}`;
    try {
      const mine = await loadOwnership(db, {
        itemId: item,
        userId: caller.userId,
      });
      const theirs = await loadOwnership(db, {
        itemId: item,
        userId: stranger.userId,
      });
      expect(mine.held.map((c) => c.id)).toEqual([second]);
      expect(theirs.held.map((c) => c.id)).toEqual([stranger.copy]);
    } finally {
      await sql`delete from copies where id = ${second}`;
    }
  });

  it("heldEditions is the caller's", async () => {
    expect(
      await heldEditions(db, {
        editions: [edition],
        userId: stranger.userId,
      }),
    ).toEqual([edition]);
    expect(
      await heldEditions(db, { editions: [edition], userId: caller.userId }),
    ).toEqual([]);
    expect(
      await heldEditions(db, { editions: [], userId: caller.userId }),
    ).toEqual([]);
  });
});
