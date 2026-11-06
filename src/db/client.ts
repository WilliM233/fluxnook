import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The server's only database client (Roadmap 2026-10-16): Drizzle over the
 * postgres driver. The fixture loader and `tests/db` open one here too.
 * The caller closes it; a script that forgets keeps Node alive.
 */
export function createDb(url = process.env.DATABASE_URL) {
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local.",
    );
  }
  const client = postgres(url);
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}

export type Db = ReturnType<typeof createDb>["db"];

// One pool per server process, kept on globalThis so dev's hot reloads
// don't open a new one per edit.
const shared = globalThis as { fluxnookDb?: Db };

/** The database for route handlers and server pages; never closed. */
export function serverDb(): Db {
  shared.fluxnookDb ??= createDb().db;
  return shared.fluxnookDb;
}
