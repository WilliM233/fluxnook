/**
 * Fails when src/db/schema.ts and supabase/migrations disagree.
 *
 * `drizzle-kit check` validates the snapshots in place. Then `drizzle-kit
 * generate` runs against a copy of the migrations folder: any .sql file it
 * writes there is a schema change with no migration. generate exits 0 either
 * way, so the file list is the verdict. The repo itself is never written.
 */
import { execFileSync } from "node:child_process";
import { cpSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = "supabase/migrations";
// Relative on purpose: drizzle-kit joins `out` onto the cwd.
const COPY = "node_modules/.cache/db-check/migrations";
const DRIZZLE_KIT = "node_modules/drizzle-kit/bin.cjs";

function drizzleKit(args, env = process.env) {
  // node, not npx: npx.cmd needs a shell on Windows.
  execFileSync(process.execPath, [DRIZZLE_KIT, ...args], {
    stdio: "inherit",
    env,
  });
}

function sqlFiles(dir) {
  return readdirSync(dir).filter((name) => name.endsWith(".sql"));
}

try {
  drizzleKit(["check"]);
} catch {
  process.exit(1);
}

rmSync(COPY, { recursive: true, force: true });
cpSync(MIGRATIONS, COPY, { recursive: true });
drizzleKit(["generate", "--name", "drift_check"], {
  ...process.env,
  DRIZZLE_OUT: COPY,
});

const committed = new Set(sqlFiles(MIGRATIONS));
const drift = sqlFiles(COPY).filter((name) => !committed.has(name));

if (drift.length > 0) {
  console.error("\nsrc/db/schema.ts has changes with no migration:\n");
  for (const name of drift) {
    console.error(readFileSync(join(COPY, name), "utf8"));
  }
  console.error(
    "Write it with `npm run db:generate -- --name=<what_changed>`, or revert src/db/schema.ts.",
  );
  process.exit(1);
}

console.log("schema and migrations agree");
