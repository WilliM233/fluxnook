import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { DEVICE_USER_ID, prepareDevice, readCounts } from "../../device/db";
import { addShelf, listShelves, ShelfNameRefused } from "../../device/shelves";

// A PGlite start plus every migration is seconds on a warm box and more on a
// loaded runner, so vitest's 5 s isn't a number to count on.
const SLOW = { timeout: 120_000 };

const OTHER_USER = "00000000-0000-4000-8000-0000000000aa";

describe("the device's person and shelves", () => {
  const clients: PGlite[] = [];

  async function device() {
    const client = new PGlite("memory://");
    clients.push(client);
    return { client, db: await prepareDevice(client) };
  }

  async function count(client: PGlite, table: string) {
    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n from ${table}`,
    );
    return rows[0].n;
  }

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  it("the signup trigger makes the profile row", SLOW, async () => {
    const { client } = await device();
    const profiles = await client.query<{ id: string }>(
      "select id from public.profiles",
    );
    expect(profiles.rows).toEqual([{ id: DEVICE_USER_ID }]);

    // Nothing in the code inserts this one, so only the trigger can have.
    await client.query("insert into auth.users (id) values ($1)", [OTHER_USER]);
    expect(await count(client, "public.profiles")).toBe(2);
  });

  it("opening twice is the same device", SLOW, async () => {
    const { client } = await device();
    const before = await readCounts(client);

    await prepareDevice(client);

    expect(await readCounts(client)).toEqual(before);
    expect(await count(client, "auth.users")).toBe(1);
    expect(await count(client, "public.profiles")).toBe(1);
  });

  it(
    "an add writes one private row for the device's person",
    SLOW,
    async () => {
      const { client, db } = await device();

      const shelf = await addShelf(db, "  King  ");

      expect(shelf.name).toBe("King");
      const { rows } = await client.query(
        "select id, owner, name, visibility from public.shelves",
      );
      expect(rows).toEqual([
        {
          id: shelf.id,
          owner: DEVICE_USER_ID,
          name: "King",
          visibility: "private",
        },
      ]);
    },
  );

  it.each([
    ["a blank name", "   ", "Give the shelf a name."],
    ["a 121-character name", "x".repeat(121), "At most 120 characters."],
    ["a name with a NUL", "King\0", "That has a character a shelf can't hold."],
  ])("refuses %s with the route's words", SLOW, async (_label, name, words) => {
    const { client, db } = await device();

    const refused = addShelf(db, name);

    await expect(refused).rejects.toBeInstanceOf(ShelfNameRefused);
    await expect(refused).rejects.toThrow(words);
    expect(await count(client, "public.shelves")).toBe(0);
  });

  it("lists the device person's shelves, newest first", SLOW, async () => {
    const { client, db } = await device();
    const older = await addShelf(db, "Older");
    const newer = await addShelf(db, "Newer");
    // Backdated, so the order doesn't rest on two adds a clock tick apart.
    await client.query(
      "update public.shelves set created_at = now() - interval '1 day' where id = $1",
      [older.id],
    );
    await client.query("insert into auth.users (id) values ($1)", [OTHER_USER]);
    await client.query(
      "insert into public.shelves (owner, name) values ($1, 'Someone else')",
      [OTHER_USER],
    );

    expect(await listShelves(db)).toEqual([
      { id: newer.id, name: "Newer" },
      { id: older.id, name: "Older" },
    ]);
  });

  it(
    "a plpgsql trigger runs here: an update moves updated_at",
    SLOW,
    async () => {
      const { client } = await device();
      const { rows } = await client.query<{ id: string }>(
        `insert into public.shelves (owner, name, updated_at)
       values ($1, 'King', '2000-01-01T00:00:00Z') returning id`,
        [DEVICE_USER_ID],
      );

      const after = await client.query<{ year: number }>(
        `update public.shelves set name = 'Kings' where id = $1
       returning extract(year from updated_at)::int as year`,
        [rows[0].id],
      );

      expect(after.rows[0].year).toBeGreaterThan(2000);
    },
  );
});
