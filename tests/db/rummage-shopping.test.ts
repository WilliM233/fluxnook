import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { loadShopping } from "@/lib/collection/shopping-page";
import { required, signUp } from "./harness";

// The 1.7.3 Rummage's R10 (Raccoon), on rows of its own under a tag.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const tag = `rummage-shopping ${crypto.randomUUID()}`;

const work = async (form: string) => {
  const [row] = await sql`
    insert into items (type, title, form, source_note)
    values ('comic', ${tag}, ${form}, ${tag}) returning id`;
  return row.id as string;
};

afterAll(async () => {
  await sql`delete from copies where edition in (
    select e.id from editions e join items i on i.id = e.item
    where i.source_note = ${tag})`;
  await sql`delete from shelf_entries where item in (
    select id from items where source_note = ${tag})`;
  await sql`delete from item_relations where from_item in (
    select id from items where source_note = ${tag})`;
  await sql`delete from editions where item in (
    select id from items where source_note = ${tag})`;
  await sql`delete from items where source_note = ${tag}`;
  await close();
  await sql.end();
});

describe("a shelf you hold all of, a backup through its host included", () => {
  it("R10 reads Everything here is yours (A11), and doesn't tell you to buy it", async () => {
    const { id: user } = await signUp(sql);
    const host = await work("issue");
    const story = await work("backup");
    await sql`insert into item_relations (from_item, to_item, kind)
      values (${story}, ${host}, 'contained-in')`;
    const [{ id: floppy }] = await sql`
      insert into editions (item, format) values (${host}, 'floppy') returning id`;
    await sql`insert into copies (owner, edition) values (${user}, ${floppy})`;
    const [{ id: shelf }] = await sql`
      insert into shelves (owner, name) values (${user}, 'All mine') returning id`;
    await sql`insert into shelf_entries (shelf, item, position)
      values (${shelf}, ${host}, 1), (${shelf}, ${story}, 2)`;

    const { total, shelves } = await loadShopping(db, user);
    expect(total).toBe(0);
    expect(shelves[0].toFind).toBe(0);
    expect(shelves[0].note).toBe("Everything here is yours.");
  });
});
