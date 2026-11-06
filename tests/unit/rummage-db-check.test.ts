import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// Rummage R1-R4 (ch 0.3). Runs the real scripts/db-check.mjs and the real
// drizzle.config.ts in a scratch copy of the repo, with stdin closed so
// drizzle-kit sees what it sees in CI: no TTY. drizzle-kit generate exits 0
// when it errors, so "no new .sql file" is not the same as "they agree".

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SCHEMA = readFileSync(join(ROOT, "src/db/schema.ts"), "utf8");
const MIGRATIONS = join(ROOT, "supabase/migrations");

let scratch = "";

function repoCopy(schema: string = SCHEMA): string {
  scratch = mkdtempSync(join(tmpdir(), "rummage-db-check-"));
  mkdirSync(join(scratch, "scripts"));
  mkdirSync(join(scratch, "src/db"), { recursive: true });
  cpSync(
    join(ROOT, "scripts/db-check.mjs"),
    join(scratch, "scripts/db-check.mjs"),
  );
  cpSync(join(ROOT, "drizzle.config.ts"), join(scratch, "drizzle.config.ts"));
  cpSync(MIGRATIONS, join(scratch, "supabase/migrations"), { recursive: true });
  writeFileSync(join(scratch, "src/db/schema.ts"), schema);
  // schema.ts takes its enumerations from here (Ch 1.2).
  cpSync(
    join(ROOT, "src/db/vocabulary.ts"),
    join(scratch, "src/db/vocabulary.ts"),
  );
  // The script runs node_modules/drizzle-kit/bin.cjs relative to its cwd.
  symlinkSync(
    join(ROOT, "node_modules"),
    join(scratch, "node_modules"),
    "junction",
  );
  return scratch;
}

function dbCheck(cwd: string) {
  const env = { ...process.env };
  delete env.DRIZZLE_OUT;
  return spawnSync(process.execPath, ["scripts/db-check.mjs"], {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

afterEach(() => {
  if (!scratch) return;
  // Remove the link itself first, never what it points at.
  const link = join(scratch, "node_modules");
  try {
    unlinkSync(link);
  } catch {
    rmdirSync(link);
  }
  rmSync(scratch, { recursive: true, force: true });
  scratch = "";
});

describe("db:check", { timeout: 60_000 }, () => {
  it("control: agrees on the committed schema", () => {
    expect(dbCheck(repoCopy()).status).toBe(0);
  });

  it("R9: fails on an added column and writes nothing to supabase/migrations", () => {
    const cwd = repoCopy(
      SCHEMA.replace(
        'displayName: text("display_name"),',
        'displayName: text("display_name"),\n  stray: text("stray"),',
      ),
    );
    const before = readdirSync(join(cwd, "supabase/migrations"));
    expect(dbCheck(cwd).status).toBe(1);
    expect(readdirSync(join(cwd, "supabase/migrations"))).toEqual(before);
  });

  it("R1: fails on a renamed column, which drizzle-kit can only ask about", () => {
    const cwd = repoCopy(
      SCHEMA.replace(
        'displayName: text("display_name")',
        'nickname: text("nickname")',
      ),
    );
    const result = dbCheck(cwd);
    expect(result.stdout).not.toContain("schema and migrations agree");
    expect(result.status).not.toBe(0);
  });

  it("R2: fails on a renamed table", () => {
    const cwd = repoCopy(
      SCHEMA.replace('pgTable("profiles"', 'pgTable("accounts"'),
    );
    expect(dbCheck(cwd).status).not.toBe(0);
  });

  it("R3: fails when src/db/schema.ts throws on import", () => {
    const cwd = repoCopy(
      `${SCHEMA}\nthrow new Error("schema failed to load");\n`,
    );
    expect(dbCheck(cwd).status).not.toBe(0);
  });

  it("R4: fails when a journal entry's .sql file is gone", () => {
    const cwd = repoCopy();
    rmSync(join(cwd, "supabase/migrations/20261016202027_profiles.sql"));
    expect(dbCheck(cwd).status).not.toBe(0);
  });
});
