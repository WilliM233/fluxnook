/**
 * Fails when src/db/schema.ts and supabase/migrations disagree.
 *
 * Every journal entry must have its .sql file, and `drizzle-kit check`
 * validates the snapshots in place. Then `drizzle-kit generate` runs against
 * a copy of the migrations folder: any .sql file it writes there is a schema
 * change with no migration. generate exits 0 whatever happens, even when it
 * errors or stops at a question (a rename) it has no terminal to ask, so the
 * script passes only on its "No schema changes" line. The repo itself is
 * never written.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = "supabase/migrations";
// Relative on purpose: drizzle-kit joins `out` onto the cwd.
const COPY = "node_modules/.cache/db-check/migrations";
const DRIZZLE_KIT = "node_modules/drizzle-kit/bin.cjs";
const NO_CHANGES = "No schema changes, nothing to migrate";

function fail(...lines) {
  console.error(`\n${lines.join("\n")}`);
  process.exit(1);
}

function sqlFiles(dir) {
  return readdirSync(dir).filter((name) => name.endsWith(".sql"));
}

const journal = JSON.parse(
  readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8"),
);
const missing = journal.entries
  .map((entry) => `${entry.tag}.sql`)
  .filter((name) => !existsSync(join(MIGRATIONS, name)));
if (missing.length > 0) {
  fail(
    "supabase/migrations/meta/_journal.json lists migrations with no .sql file:",
    ...missing,
  );
}

try {
  // node, not npx: npx.cmd needs a shell on Windows.
  execFileSync(process.execPath, [DRIZZLE_KIT, "check"], { stdio: "inherit" });
} catch {
  process.exit(1);
}

rmSync(COPY, { recursive: true, force: true });
cpSync(MIGRATIONS, COPY, { recursive: true });
// Piped, never a TTY: generate fails here the same way on a laptop as in CI,
// rather than prompting on one and not the other.
const generate = spawnSync(
  process.execPath,
  [DRIZZLE_KIT, "generate", "--name", "drift_check"],
  {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DRIZZLE_OUT: COPY },
  },
);
process.stdout.write(generate.stdout);
process.stderr.write(generate.stderr);

const committed = new Set(sqlFiles(MIGRATIONS));
const drift = sqlFiles(COPY).filter((name) => !committed.has(name));

if (drift.length > 0) {
  fail(
    "src/db/schema.ts has changes with no migration:\n",
    ...drift.map((name) => readFileSync(join(COPY, name), "utf8")),
    "Write it with `npm run db:generate -- --name=<what_changed>`, or revert src/db/schema.ts.",
  );
}

if (generate.status !== 0 || !generate.stdout.includes(NO_CHANGES)) {
  fail(
    "drizzle-kit generate didn't confirm the schema matches; its output is above.",
    "A rename stops at a question: run `npm run db:generate -- --name=<what_changed>` in a terminal and answer it.",
  );
}

console.log("schema and migrations agree");
