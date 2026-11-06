import bundled from "virtual:device-migrations";
import { PGlite } from "@electric-sql/pglite";
import { is } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { migrateDevice, readCounts } from "../../device/db";

// A PGlite start plus every migration is seconds on a warm box and more on a
// loaded runner, so vitest's 5 s isn't a number to count on.
const SLOW = { timeout: 120_000 };

const expectedTables = Object.values(schema as Record<string, unknown>)
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => getTableConfig(table).name)
  .sort();

async function publicTables(client: PGlite) {
  const { rows } = await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`,
  );
  return rows.map((row) => row.table_name);
}

async function columnsOf(client: PGlite, tableSchema: string, table: string) {
  const { rows } = await client.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = $1 and table_name = $2
     order by ordinal_position`,
    [tableSchema, table],
  );
  return rows.map((row) => row.column_name);
}

describe("the device's schema", () => {
  const clients: PGlite[] = [];

  function memoryClient() {
    const client = new PGlite("memory://");
    clients.push(client);
    return client;
  }

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  it(
    `${bundled.length} migrations applied, ${expectedTables.length} tables`,
    SLOW,
    async () => {
      const client = memoryClient();
      await migrateDevice(client);

      expect(await readCounts(client)).toEqual({
        migrations: bundled.length,
        tables: expectedTables.length,
      });
      expect(await publicTables(client)).toEqual(expectedTables);
    },
  );

  it("the bundled list is the journal's, in order", () => {
    const fromDisk = readMigrationFiles({
      migrationsFolder: "supabase/migrations",
    });
    expect(bundled).toEqual(fromDisk);

    // The migrator passes over anything older than the last one applied, so a
    // migration stamped out of order would never reach a phone.
    const stamps = bundled.map((migration) => migration.folderMillis);
    for (const [index, stamp] of stamps.entries()) {
      if (index > 0) expect(stamp).toBeGreaterThan(stamps[index - 1]);
    }
  });

  it(
    "makes the two stand-ins, and the migration writes covers",
    SLOW,
    async () => {
      const client = memoryClient();
      await migrateDevice(client);

      expect(await columnsOf(client, "auth", "users")).toEqual(["id"]);
      expect(await columnsOf(client, "storage", "buckets")).toEqual([
        "id",
        "name",
        "public",
      ]);
      const { rows } = await client.query("select * from storage.buckets");
      expect(rows).toEqual([{ id: "covers", name: "covers", public: true }]);
    },
  );

  it("a first launch is all or nothing", SLOW, async () => {
    const client = memoryClient();
    const broken = bundled.map((migration, index) =>
      index === bundled.length - 1
        ? { ...migration, sql: [...migration.sql, "select from no_such_table"] }
        : migration,
    );

    await expect(migrateDevice(client, broken)).rejects.toThrow();
    expect(await readCounts(client)).toEqual({ migrations: 0, tables: 0 });

    await migrateDevice(client);
    expect(await readCounts(client)).toEqual({
      migrations: bundled.length,
      tables: expectedTables.length,
    });
  });

  it("an older device catches up", SLOW, async () => {
    const client = memoryClient();
    await migrateDevice(client, bundled.slice(0, -1));
    expect((await readCounts(client)).migrations).toBe(bundled.length - 1);

    await migrateDevice(client);
    expect(await readCounts(client)).toEqual({
      migrations: bundled.length,
      tables: expectedTables.length,
    });
    expect(await publicTables(client)).toEqual(expectedTables);
  });
});
