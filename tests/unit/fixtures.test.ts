import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { fixture } from "@/fixtures/shape";

// Every fixture holds to the shape, and is byte for byte what the build makes
// of its raw file today. The build runs into a cache directory, the db:check
// pattern, so no test writes to the repo.

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURES = join(ROOT, "supabase/seed/fixtures");
const CACHE = "node_modules/.cache/fixtures";

const files = readdirSync(FIXTURES)
  .filter((name) => name.endsWith(".json"))
  .sort();

it("finds fixtures to check", () => {
  expect(files.length).toBeGreaterThan(0);
});

describe("shape", () => {
  it.each(files)("%s matches src/fixtures/shape.ts", (name) => {
    const result = fixture.safeParse(
      JSON.parse(readFileSync(join(FIXTURES, name), "utf8")),
    );
    const issues = (result.error?.issues ?? [])
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    expect(result.success, issues).toBe(true);
  });
});

describe("fresh build", () => {
  beforeAll(() => {
    rmSync(join(ROOT, CACHE), { recursive: true, force: true });
    const build = spawnSync(
      process.execPath,
      ["scripts/fixtures-build.mjs", "--out", CACHE],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(build.status, build.stderr).toBe(0);
  });

  it("writes the same set of files the repo has", () => {
    expect(readdirSync(join(ROOT, CACHE)).sort()).toEqual(files);
  });

  it.each(files)(
    "%s is byte for byte a fresh build of its raw file",
    (name) => {
      expect(readFileSync(join(FIXTURES, name), "utf8")).toBe(
        readFileSync(join(ROOT, CACHE, name), "utf8"),
      );
    },
  );
});
