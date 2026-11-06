import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { manualItemSchema } from "@/app/api/v1/items/schema";
import { createDb } from "@/db/client";
import { createManualItem } from "@/lib/catalog/manual";
import { required, signUp } from "./harness";

// A6 against the database: who added it, its manual source, its type's row.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
let user: { id: string };

const add = (input: unknown) =>
  createManualItem(db, {
    userId: user.id,
    input: manualItemSchema.parse(input),
  });

beforeAll(async () => {
  user = await signUp(sql);
});

afterAll(async () => {
  await sql`delete from items where created_by = ${user.id}`;
  await sql`delete from auth.users where id = ${user.id}`;
  await close();
  await sql.end();
});

describe("createManualItem", () => {
  it("a book lands with its author, created_by and its own uuid as the key", async () => {
    const id = await add({
      type: "book",
      title: "The Long Walk",
      year: 1979,
      month: 7,
      form: "novel",
      author: "Richard Bachman",
    });
    const [row] = await sql`
      select i.created_by, i.released_on::text as released_on,
        i.released_precision, s.source, s.key, s.url, b.author
      from items i
      join item_sources s on s.item = i.id
      join item_books b on b.item = i.id
      where i.id = ${id}`;
    expect(row).toEqual({
      created_by: user.id,
      released_on: "1979-07-01",
      released_precision: "month",
      source: "manual",
      key: id,
      url: null,
      author: "Richard Bachman",
    });
  });

  it("a show gets its item_tv row with seasons", async () => {
    const id = await add({ type: "tv", title: "Castle Rock", seasons: 2 });
    const [tv] =
      await sql`select seasons, ended from item_tv where item = ${id}`;
    expect(tv).toEqual({ seasons: 2, ended: false });
  });

  it("a film gets its item_films row", async () => {
    const id = await add({
      type: "film",
      title: "Cat's Eye",
      runtimeMinutes: 94,
    });
    const [film] = await sql`
      select runtime_minutes from item_films where item = ${id}`;
    expect(film.runtime_minutes).toBe(94);
  });
});
