import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

// Ch 1.2's schema: a show is type `tv` with no form, and the two child tables
// take their rows with the defaults the plan says. Tagged rows, cleaned up.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local.`);
  }
  return value;
}

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const title = `item-tv ${crypto.randomUUID()}`;

async function newItem(type: string, form: string | null = null) {
  const [{ id }] = await sql`
    insert into items (type, title, form) values (${type}, ${title}, ${form})
    returning id`;
  return id as string;
}

afterAll(async () => {
  await sql`delete from items where title = ${title}`;
  await sql.end();
});

describe("tv and the two child tables", () => {
  it("a tv item with no form inserts", async () => {
    expect(await newItem("tv")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("a tv item with a form is refused by items_form_per_type", async () => {
    await expect(newItem("tv", "novel")).rejects.toThrow(/items_form_per_type/);
  });

  it("a fifth type is still refused", async () => {
    await expect(newItem("game")).rejects.toThrow(/items_(type|form_per_type)/);
  });

  it("an item_tv row defaults ended to false", async () => {
    const show = await newItem("tv");
    const [row] = await sql`
      insert into item_tv (item, seasons) values (${show}, 2)
      returning ended, seasons`;
    expect(row).toEqual({ ended: false, seasons: 2 });
  });

  it("an item_films row takes a film's runtime", async () => {
    const film = await newItem("film");
    const [row] = await sql`
      insert into item_films (item, runtime_minutes) values (${film}, 100)
      returning runtime_minutes`;
    expect(row.runtime_minutes).toBe(100);
  });
});
