import { sql as q } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { loadItemPage } from "@/lib/catalog/item-page";
import { heldBy, loadOwnership, viaBy } from "@/lib/collection/owned";
import { itemFor, required, signUp, signUpWithFixtures } from "./harness";

// A5 on the loaded fixtures: five hardcovers held, 37 comics through their
// contents, one backup through its host, 38 in all (Ch 1.7, the census's C3).

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const tag = `collection-owned ${crypto.randomUUID()}`;
let userId: string;
let tmnt1: string;
let uc1: string;
let story: string;
let host: string;

const work = async (type: string, title: string, form: string) => {
  const [row] = await sql`
    insert into items (type, title, form, source_note)
    values (${type}, ${title}, ${form}, ${tag}) returning id`;
  return row.id as string;
};
const printing = async (item: string, format = "hardcover") => {
  const [row] = await sql`
    insert into editions (item, format) values (${item}, ${format}) returning id`;
  return row.id as string;
};
const copy = async (edition: string) => {
  const [row] = await sql`
    insert into copies (owner, edition) values (${userId}, ${edition}) returning id`;
  return row.id as string;
};

// A fixture load waits its turn behind every other file's (the loader's lock).
beforeAll(async () => {
  ({ id: userId } = await signUpWithFixtures(sql));
  tmnt1 = await itemFor(sql, "manual", "tmnt-mirage-v1-1");
  uc1 = await itemFor(sql, "manual", "tmnt-ultimate-collection-1");
  story = await itemFor(
    sql,
    "manual",
    "tmnt-mirage-backup-you-had-to-be-there",
  );
  host = await itemFor(sql, "manual", "tmnt-mirage-v1-7");
}, 60_000);

afterAll(async () => {
  await sql`delete from copies where owner = ${userId}
    and edition in (select e.id from editions e join items i on i.id = e.item
      where i.source_note = ${tag})`;
  await sql`delete from items where source_note = ${tag}`;
  await close();
  await sql.end();
});

describe("A5 on the fixture", () => {
  it("held 5, via 37 and the backup's hop, 38", async () => {
    const [counts] = await db.execute<{ held: number; via: number }>(q`
      select
        count(*) filter (where ${heldBy(q`i.id`, userId)})::int as held,
        count(*) filter (where ${viaBy(q`i.id`, userId)})::int as via
      from items i where i.source_note is distinct from ${tag}`);
    expect(counts).toEqual({ held: 5, via: 38 });
  });

  it("TMNT #1 is via Ultimate Collection 1 as a hardcover, held nothing", async () => {
    const owned = await loadOwnership(db, { itemId: tmnt1, userId });
    expect(owned.held).toEqual([]);
    expect(owned.via).toHaveLength(1);
    expect(owned.via[0]).toMatchObject({
      itemId: uc1,
      title: "Ultimate Collection 1",
      format: "hardcover",
    });
    expect(owned.host).toBeNull();
  });

  it("Ultimate Collection 1 is held", async () => {
    const owned = await loadOwnership(db, { itemId: uc1, userId });
    expect(owned.held).toHaveLength(1);
    expect(owned.held[0]).toMatchObject({
      format: "hardcover",
      condition: null,
      acquiredOn: null,
      note: "",
    });
    expect(owned.via).toEqual([]);
  });

  it("You Had to Be There is via one hop and its host is All is Revealed", async () => {
    const owned = await loadOwnership(db, { itemId: story, userId });
    expect(owned.held).toEqual([]);
    expect(owned.via[0]).toMatchObject({
      title: "Ultimate Collection 1",
      format: "hardcover",
    });
    expect(owned.host).toEqual({ id: host, title: "All is Revealed" });
  });

  it("another backup on the shelf is neither", async () => {
    const [other] = await sql`
      select i.id from items i
      where i.form = 'backup' and i.id <> ${story}
      order by i.title limit 1`;
    const owned = await loadOwnership(db, { itemId: other.id, userId });
    expect(owned).toEqual({ held: [], via: [], host: null });
  });

  it("Carrie holds nothing", async () => {
    const carrie = await itemFor(sql, "manual", "carrie-1974");
    expect(await loadOwnership(db, { itemId: carrie, userId })).toEqual({
      held: [],
      via: [],
      host: null,
    });
  });
});

describe("A5 on its own rows", () => {
  it("a backup whose host is held names the host's copy", async () => {
    const issue = await work("comic", `${tag} host`, "issue");
    const backup = await work("comic", `${tag} backup`, "backup");
    await sql`insert into item_relations (from_item, to_item, kind)
      values (${backup}, ${issue}, 'contained-in')`;
    const edition = await printing(issue, "floppy");
    const made = await copy(edition);
    const owned = await loadOwnership(db, { itemId: backup, userId });
    expect(owned.via).toEqual([
      {
        copyId: made,
        editionId: edition,
        itemId: issue,
        title: `${tag} host`,
        format: "floppy",
      },
    ]);
    expect(owned.host).toEqual({ id: issue, title: `${tag} host` });
  });

  it("a backup contained in a backup goes no second hop", async () => {
    const issue = await work("comic", `${tag} far host`, "issue");
    const near = await work("comic", `${tag} near`, "backup");
    const far = await work("comic", `${tag} far`, "backup");
    await sql`insert into item_relations (from_item, to_item, kind)
      values (${near}, ${issue}, 'contained-in'), (${far}, ${near}, 'contained-in')`;
    await copy(await printing(issue, "floppy"));
    expect(
      (await loadOwnership(db, { itemId: near, userId })).via,
    ).toHaveLength(1);
    expect(await loadOwnership(db, { itemId: far, userId })).toEqual({
      held: [],
      via: [],
      host: null,
    });
    const [{ via }] = await db.execute<{ via: boolean }>(
      q`select ${viaBy(q`${far}::uuid`, userId)} as via`,
    );
    expect(via).toBe(false);
  });

  it("two via copies name the first by the edition's work title", async () => {
    const issue = await work("comic", `${tag} held twice`, "issue");
    const later = await work("comic", `${tag} Z trade`, "collected");
    const earlier = await work("comic", `${tag} A trade`, "collected");
    for (const collected of [later, earlier]) {
      const edition = await printing(collected);
      await sql`insert into edition_contents (edition, item, position)
        values (${edition}, ${issue}, 1)`;
      await copy(edition);
    }
    const { via } = await loadOwnership(db, { itemId: issue, userId });
    expect(via.map((row) => row.title)).toEqual([
      `${tag} A trade`,
      `${tag} Z trade`,
    ]);
  });

  it("loadItemPage carries the caller's copies per printing, oldest first, and no one else's", async () => {
    const item = await work("book", `${tag} page`, "novel");
    const paperback = await printing(item, "paperback");
    const hardcover = await printing(item, "hardcover");
    const [{ id: first }] = await sql`
      insert into copies (owner, edition, created_at)
      values (${userId}, ${paperback}, now() - interval '1 day') returning id`;
    const second = await copy(paperback);
    const stranger = await signUp(sql);
    await sql`insert into copies (owner, edition)
      values (${stranger.id}, ${hardcover}), (${stranger.id}, ${paperback})`;
    try {
      const page = await loadItemPage(db, { id: item, userId });
      const copiesOf = (edition: string) =>
        page?.editions.find((e) => e.id === edition)?.copies.map((c) => c.id);
      expect(copiesOf(paperback)).toEqual([first, second]);
      expect(copiesOf(hardcover)).toEqual([]);
    } finally {
      await sql`delete from auth.users where id = ${stranger.id}`;
    }
  });

  // Rummage R6 (1.7.1): the fragments are for five pages' queries, and
  // `shelf-page.ts` and `nook-page.ts` alias `shelf_entries e`. A caller
  // passing `e.item` must get an answer about the caller's copies, not the
  // fragment's own `editions e` answering about itself.
  it("heldBy over a query that aliases e answers about the row, not itself", async () => {
    const item = await work("book", `${tag} alias`, "novel");
    const edition = await printing(item, "paperback");
    const [{ held }] = await db.execute<{ held: boolean }>(q`
      select ${heldBy(q`e.item`, userId)} as held
      from editions e where e.id = ${edition}`);
    expect(held).toBe(false);
  });

  it("a read writes nothing", async () => {
    const count = async () => {
      const [row] = await sql`
        select (select count(*) from copies where owner = ${userId})::int as copies,
          (select count(*) from edition_contents)::int as contents`;
      return row;
    };
    const before = await count();
    await loadOwnership(db, { itemId: tmnt1, userId });
    await loadOwnership(db, { itemId: story, userId });
    expect(await count()).toEqual(before);
  });
});
