import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { loadSeriesPage } from "@/lib/catalog/series-page";
import { required, signUp } from "./harness";

// What the series page knows about the caller (Ch 1.7 A8), on a run of this
// file's own: a real run's rows belong to `catalog-match-comics`, which holds
// the keys. Two people, so `held`, `via`, `floppies` and `heldIn` are the
// caller's alone.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const tag = `series-page-owned ${crypto.randomUUID()}`;
let userId: string;
let strangerId: string;
let seriesId: string;

const comic = async (title: string, form: string, number: number | null) => {
  const [row] = await sql`
    insert into items (type, title, form, source_note)
    values ('comic', ${`${tag} ${title}`}, ${form}, ${tag}) returning id`;
  await sql`insert into item_comics (item, series_id, number)
    values (${row.id}, ${seriesId}, ${number})`;
  return row.id as string;
};
const printing = async (item: string, format: string) => {
  const [row] = await sql`
    insert into editions (item, format) values (${item}, ${format}) returning id`;
  return row.id as string;
};
const copy = (owner: string, edition: string) =>
  sql`insert into copies (owner, edition) values (${owner}, ${edition})`;
const read = async (caller = userId) => {
  const page = await loadSeriesPage(db, { id: seriesId, userId: caller });
  if (!page) throw new Error("no page");
  return page;
};

beforeAll(async () => {
  ({ id: userId } = await signUp(sql));
  ({ id: strangerId } = await signUp(sql));
  const [series] = await sql`
    insert into series (name) values (${tag}) returning id`;
  seriesId = series.id;
}, 60_000);

afterAll(async () => {
  await sql`delete from auth.users where id in (${userId}, ${strangerId})`;
  await sql`delete from items where source_note = ${tag}`;
  await sql`delete from series where id = ${seriesId}`;
  await close();
  await sql.end();
});

describe("loadSeriesPage knows the caller", () => {
  it("floppies counts the caller's floppy copies per issue", async () => {
    const issue = await comic("two floppies", "issue", 1);
    const floppy = await printing(issue, "floppy");
    await copy(userId, floppy);
    await copy(userId, floppy);
    const row = (await read()).issues.find((i) => i.id === issue);
    expect(row).toMatchObject({
      held: true,
      via: null,
      floppies: 2,
      form: "issue",
    });
  });

  it("a digital copy is held with floppies 0", async () => {
    const issue = await comic("digital", "issue", 2);
    await copy(userId, await printing(issue, "digital"));
    const row = (await read()).issues.find((i) => i.id === issue);
    expect(row).toMatchObject({ held: true, floppies: 0 });
  });

  it("via names the first by title, and heldIn is the printings the caller holds", async () => {
    const issue = await comic("in two trades", "issue", 3);
    const editions: string[] = [];
    for (const name of ["Z trade", "A trade"]) {
      const trade = await comic(name, "collected", null);
      const edition = await printing(trade, "tpb");
      await sql`insert into edition_contents (edition, item, position)
        values (${edition}, ${issue}, 1)`;
      await copy(userId, edition);
      editions.push(edition);
    }
    const page = await read();
    expect(page.issues.find((i) => i.id === issue)).toMatchObject({
      held: false,
      via: `${tag} A trade`,
      floppies: 0,
    });
    expect(page.heldIn).toEqual(expect.arrayContaining(editions));
  });

  it("a stranger reads none of it", async () => {
    const page = await read(strangerId);
    expect(page.issues.length).toBeGreaterThan(0);
    expect(
      page.issues.filter((i) => i.held || i.via !== null || i.floppies > 0),
    ).toEqual([]);
    expect(page.heldIn).toEqual([]);
  });

  it("a stranger's copies don't move the caller's counts", async () => {
    const issue = await comic("theirs", "issue", 4);
    await copy(strangerId, await printing(issue, "floppy"));
    expect((await read()).issues.find((i) => i.id === issue)).toMatchObject({
      held: false,
      via: null,
      floppies: 0,
    });
    expect(
      (await read(strangerId)).issues.find((i) => i.id === issue),
    ).toMatchObject({ held: true, floppies: 1 });
  });
});
