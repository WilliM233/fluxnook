import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { buildFixtures } from "../../scripts/fixtures/build.mjs";

// The build loop on tiny raw files and inline builders, in a cache directory
// so nothing in the repo is written.

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DIR = join(ROOT, "node_modules/.cache/fixtures-build-test");
const RAW = join(DIR, "raw");
const OUT = join(DIR, "out");

const shelf = { name: "S", date: "2024-04-01", entries: [] };
const small = () => ({ shelves: [shelf], items: [{ id: "manual:b-1", a: 1 }] });
const full = () => ({
  ...small(),
  relations: [{}, {}],
  editions: [{}],
  copies: [{}],
  occurrences: [{}],
  gaps: [{}],
});

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });
  writeFileSync(join(RAW, "one.csv"), "one");
  writeFileSync(join(RAW, "two.csv"), "two");
});

describe("buildFixtures", () => {
  it("writes each fixture as sorted, indented JSON and logs every non-empty array", () => {
    const lines = buildFixtures(
      [
        { raw: "one.csv", out: "a.json", build: small },
        { raw: "two.csv", out: "b.json", build: full },
      ],
      { rawDir: RAW, outDir: OUT },
    );
    expect(readFileSync(join(OUT, "a.json"), "utf8")).toBe(
      `${JSON.stringify(
        {
          items: [{ a: 1, id: "manual:b-1" }],
          shelves: [{ date: "2024-04-01", entries: [], name: "S" }],
        },
        null,
        2,
      )}\n`,
    );
    expect(lines).toEqual([
      `wrote ${OUT}/a.json (1 items, 1 shelves)`,
      `wrote ${OUT}/b.json (1 items, 1 shelves, 2 relations, 1 editions, 1 copies, 1 occurrences, 1 gaps)`,
    ]);
  });

  it("writes nothing when any builder throws, naming the fixture", () => {
    expect(() =>
      buildFixtures(
        [
          { raw: "one.csv", out: "a.json", build: small },
          {
            raw: "two.csv",
            out: "b.json",
            build: () => {
              throw new Error("record 5: no");
            },
          },
        ],
        { rawDir: RAW, outDir: OUT },
      ),
    ).toThrow("b.json: record 5: no");
    expect(existsSync(OUT) ? readdirSync(OUT) : []).toEqual([]);
  });

  it("still takes --out from the command line", () => {
    const run = spawnSync(
      process.execPath,
      ["scripts/fixtures-build.mjs", "--out", OUT],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(run.status, run.stderr).toBe(0);
    const repo = readdirSync(join(ROOT, "supabase/seed/fixtures"))
      .filter((name) => name.endsWith(".json"))
      .sort();
    expect(readdirSync(OUT).sort()).toEqual(repo);
  });
});
