import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Plugin } from "vite";

const ID = "virtual:device-migrations";
const RESOLVED = `\0${ID}`;

const migrationsFolder = fileURLToPath(
  new URL("../supabase/migrations", import.meta.url),
);

/**
 * The migration list as a module. Drizzle's reader is `node:fs`, so it runs
 * here at build and the page gets its answer; nothing lands on disk to go
 * stale, and a new migration reaches the device with no extra step (C3).
 */
export function deviceMigrations(): Plugin {
  return {
    name: "device-migrations",
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    load: (id) =>
      id === RESOLVED
        ? `export default ${JSON.stringify(readMigrationFiles({ migrationsFolder }))};`
        : undefined,
  };
}
