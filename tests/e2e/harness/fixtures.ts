import { execFileSync, spawnSync } from "node:child_process";
import { RESET_COMICVINE } from "../../reset-comicvine";

// The fixtures for an e2e user, and SQL against the local stack's database,
// for the specs that read or tidy catalog rows (Ch 1.2).

/** Loads the Volume 0 fixtures for `email`, as `npm run fixtures:load` does. */
export function loadFixturesFor(email: string) {
  const result = spawnSync(
    process.execPath,
    [
      "--env-file=.env.local",
      "--import",
      "tsx",
      "scripts/fixtures-load.ts",
      "--user",
      email,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`fixtures:load failed: ${result.stderr || result.stdout}`);
  }
}

/** One SQL statement through the database container; the trimmed output. */
export function db(sql: string) {
  return execFileSync(
    "docker",
    ["exec", "supabase_db_fluxnook", "psql", "-U", "postgres", "-tAc", sql],
    { encoding: "utf8" },
  ).trim();
}

/** The item a fixture source names, e.g. `letterboxd`, `20ZQ`. Keys are fixture data, never input. */
export function itemFor(source: string, key: string) {
  const id = db(
    `select item from item_sources where source = '${source}' and key = '${key}'`,
  );
  if (!id) throw new Error(`no item for ${source}:${key}`);
  return id;
}

/** The Browse's three Comic Vine imports undone on the fixture rows (Ch 1.4.2). */
export function resetComics() {
  for (const statement of RESET_COMICVINE) db(statement);
}
