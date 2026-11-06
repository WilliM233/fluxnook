import bundledMigrations from "virtual:device-migrations";
import { PGlite } from "@electric-sql/pglite";
import type { MigrationMeta } from "drizzle-orm/migrator";
import type { PgDialect, PgSession } from "drizzle-orm/pg-core";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";

/**
 * Where the device's rows live. The name is part of the app's identity: a
 * renamed store opens empty over a phone's rows with no error (A5).
 */
export const DEVICE_DATA_NAME = "idb://fluxnook";

/**
 * The device's one person, fixed so every `owner` column is known without
 * reading anything back.
 */
export const DEVICE_USER_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Three statements in the migrations name Supabase's schemas (A2), so the
 * device makes empty stand-ins for them before the first one runs. Outside the
 * ledger, and safe to repeat, since a kill before the migrator's commit runs
 * this again on the next open.
 */
const STAND_INS = `
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key,
    name text,
    public boolean
  );
`;

export type DeviceDb = PgliteDatabase<typeof schema>;

export type Device = { client: PGlite; db: DeviceDb };

/**
 * Brings a client up to the list: the stand-ins, then Drizzle's migrator on the
 * same list every device gets. One transaction, so a first launch is all or
 * nothing. `db.dialect.migrate` is what Drizzle's own `migrate()` calls after
 * reading the folder, which a browser can't do.
 */
export async function migrateDevice(
  client: PGlite,
  migrations: MigrationMeta[] = bundledMigrations,
): Promise<DeviceDb> {
  await client.exec(STAND_INS);
  const db = drizzle(client, { schema });
  // The same call as `drizzle-orm/pglite/migrator`, whose types mark these two
  // `@internal`. The folder is unread: the list is already in hand.
  const { dialect, session } = db as unknown as {
    dialect: PgDialect;
    session: PgSession;
  };
  await dialect.migrate(migrations, session, { migrationsFolder: "" });
  return db;
}

/**
 * The migrations, then the device's one person. `on conflict do nothing` runs on
 * every open: a kill between the migrator and this insert heals on the next one,
 * and a second open fires no trigger. The signup trigger makes the `profiles`
 * row, as it does hosted, so nothing here writes it.
 */
export async function prepareDevice(client: PGlite): Promise<DeviceDb> {
  const db = await migrateDevice(client);
  await client.query(
    "insert into auth.users (id) values ($1) on conflict do nothing",
    [DEVICE_USER_ID],
  );
  return db;
}

/**
 * One window at a time. Two PGlites on one store are two copies in memory, each
 * flushing whole files, so the last to write loses the other's shelves. The
 * second window waits long enough for a reload's old page to let go, then
 * refuses. `locks` needs a secure context; without it there's no second window
 * to guard against in a shell of one web view (a Deferral measures this).
 */
function holdTheStore(): Promise<void> {
  if (!navigator.locks) return Promise.resolve();
  return new Promise((held, refused) => {
    navigator.locks
      .request("fluxnook-store", { signal: AbortSignal.timeout(2_000) }, () => {
        held();
        // Held until the page goes away.
        return new Promise(() => {});
      })
      .catch(() =>
        refused(new Error("Fluxnook is already open in another window.")),
      );
  });
}

/**
 * PGlite takes a store with no top-level `PG_VERSION` for an empty one and runs
 * initdb over its rows, in silence. So files with no `PG_VERSION` stop here,
 * before PGlite is near them and with the rows still there to rescue. The names
 * are PGlite's own, as of the version `docs/STACK.md` pins. `databases()` comes
 * first because opening a name that doesn't exist would create it.
 */
async function refuseADamagedStore(dataName: string): Promise<void> {
  const mount = dataName.replace("idb://", "/pglite/");
  const stores = await indexedDB.databases();
  if (!stores.some((store) => store.name === mount)) return;

  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const opening = indexedDB.open(mount);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const reading = db
        .transaction("FILE_DATA")
        .objectStore("FILE_DATA")
        .getAllKeys();
      reading.onerror = () => reject(reading.error);
      reading.onsuccess = () => {
        db.close();
        resolve(reading.result);
      };
    };
  });
  if (keys.length > 0 && !keys.includes(`${mount}/PG_VERSION`)) {
    throw new Error("Its files are damaged, so nothing was changed.");
  }
}

/**
 * Asks the browser not to evict the store, since an evicted one looks exactly
 * like a first launch. An answer of no changes nothing here, so it isn't awaited.
 */
function askToKeepTheStore() {
  navigator.storage?.persist?.().catch(() => {});
}

/** Opens the store and brings it up to date. */
export async function openDevice(
  dataName: string = DEVICE_DATA_NAME,
): Promise<Device> {
  await holdTheStore();
  await refuseADamagedStore(dataName);
  askToKeepTheStore();
  const client = new PGlite(dataName);
  const db = await prepareDevice(client);
  return { client, db };
}

export type DeviceCounts = { migrations: number; tables: number };

/** What the page prints, read from the database rather than assumed. */
export async function readCounts(client: PGlite): Promise<DeviceCounts> {
  const migrations = await client.query<{ n: number }>(
    "select count(*)::int as n from drizzle.__drizzle_migrations",
  );
  const tables = await client.query<{ n: number }>(
    `select count(*)::int as n from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  return { migrations: migrations.rows[0].n, tables: tables.rows[0].n };
}
