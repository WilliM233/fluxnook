import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { type Fixture, fixture } from "@/fixtures/shape";

// Every fixture holds to the shape, and is byte for byte what the build makes
// of its raw file today. The build runs into a cache directory, the db:check
// pattern, so no test writes to the repo. Across all the files together, no id
// is defined twice and every id a file points at is defined somewhere.

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURES = join(ROOT, "supabase/seed/fixtures");
const CACHE = "node_modules/.cache/fixtures";

const files = readdirSync(FIXTURES)
  .filter((name) => name.endsWith(".json"))
  .sort();

const read = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

// A file that fails the shape is reported under "shape" and sits out the
// cross-file checks rather than failing them for the same reason.
const parsed: { name: string; data: Fixture }[] = files.flatMap((name) => {
  const result = fixture.safeParse(JSON.parse(read(name)));
  return result.success ? [{ name, data: result.data }] : [];
});

it("finds fixtures to check", () => {
  expect(files.length).toBeGreaterThan(0);
});

describe("shape", () => {
  it.each(files)("%s matches src/fixtures/shape.ts", (name) => {
    const result = fixture.safeParse(JSON.parse(read(name)));
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
      expect(read(name)).toBe(readFileSync(join(ROOT, CACHE, name), "utf8"));
    },
  );
});

describe("across files", () => {
  const defined = new Map<string, string[]>();
  for (const { name, data } of parsed) {
    for (const { id } of data.items) {
      defined.set(id, [...(defined.get(id) ?? []), name]);
    }
  }
  const missing = (id: string) =>
    defined.has(id) ? [] : [`${id} is not an item in any file`];

  it("no id is defined in two files", () => {
    const lines = [...defined]
      .filter(([, names]) => names.length > 1)
      .map(([id, names]) => `${id} is defined in ${names.join(" and ")}`);
    expect(lines, lines.join("\n")).toEqual([]);
  });

  it("every relation endpoint is an item in some file", () => {
    const lines = parsed.flatMap(({ name, data }) =>
      data.relations.flatMap(({ type, from, to }, i) =>
        [...missing(from), ...missing(to)].map(
          (line) =>
            `${name}: relation ${i} ${from} -> ${to} (${type}): ${line}`,
        ),
      ),
    );
    expect(lines, lines.join("\n")).toEqual([]);
  });

  it("every shelf entry is an item in some file", () => {
    const lines = parsed.flatMap(({ name, data }) =>
      data.shelves.flatMap((shelf) =>
        shelf.entries.flatMap(({ item, position }) =>
          missing(item).map(
            (line) => `${name}: ${shelf.name} entry ${position}: ${line}`,
          ),
        ),
      ),
    );
    expect(lines, lines.join("\n")).toEqual([]);
  });

  it("every gap names an item in some file", () => {
    const lines = parsed.flatMap(({ name, data }) =>
      data.gaps.flatMap(({ item }) =>
        missing(item).map((line) => `${name}: gap ${item}: ${line}`),
      ),
    );
    expect(lines, lines.join("\n")).toEqual([]);
  });
});
