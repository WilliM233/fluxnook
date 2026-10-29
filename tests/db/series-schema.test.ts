import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { required } from "./harness";

// A1's series table and item_comics.series_id (Ch 1.4): the series restricts
// while a comic points at it, takes its sources when it goes, and keeps
// updated_at. Rows of this file's own, tagged and removed at the end.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const tag = `series-schema ${crypto.randomUUID()}`;
let seriesId: string;
let comic: string;

beforeAll(async () => {
  [{ id: seriesId }] = await sql`
    insert into series (name, created_at, updated_at)
    values (${tag}, '2000-01-01', '2000-01-01') returning id`;
  await sql`
    insert into series_sources (series, source, key)
    values (${seriesId}, 'comicvine', ${`volume/${tag}`})`;
  [{ id: comic }] = await sql`
    insert into items (type, title, form)
    values ('comic', ${tag}, 'issue') returning id`;
  await sql`
    insert into item_comics (item, series, series_id)
    values (${comic}, ${tag}, ${seriesId})`;
});

afterAll(async () => {
  await sql`delete from items where title = ${tag}`;
  await sql`delete from series where name = ${tag}`;
  await sql.end();
});

describe("series", () => {
  it("an update moves updated_at and leaves created_at", async () => {
    const [row] = await sql`
      update series set summary = 'Volume 1.' where id = ${seriesId}
      returning created_at, updated_at`;
    expect(row.created_at.getUTCFullYear()).toBe(2000);
    expect(row.updated_at.getUTCFullYear()).toBeGreaterThan(2000);
  });

  it("refuses a kind outside the series kinds", async () => {
    await expect(
      sql`update series set kind = 'saga' where id = ${seriesId}`,
    ).rejects.toThrow(/series_kind/);
  });

  it("restricts its delete while a comic points at it", async () => {
    await expect(
      sql`delete from series where id = ${seriesId}`,
    ).rejects.toThrow(/item_comics_series_id_series_id_fk/);
  });

  it("takes its sources when nothing points at it", async () => {
    await sql`update item_comics set series_id = null where item = ${comic}`;
    await sql`delete from series where id = ${seriesId}`;
    expect(
      await sql`select 1 from series_sources where series = ${seriesId}`,
    ).toHaveLength(0);
  });
});
