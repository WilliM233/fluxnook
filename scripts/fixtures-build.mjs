/**
 * Builds every fixture in supabase/seed/fixtures from its raw file.
 *
 * Raw in, JSON out, nothing else: the same raw files always give the same
 * bytes, because `serializeFixture` is the only writer. `--out <dir>` sends
 * the files somewhere else, which is how tests/unit/fixtures.test.ts builds a
 * fresh copy without touching the repo. Nothing under raw/ is ever written.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { kingWorks } from "./fixtures/king-works.mjs";
import { letterboxdList } from "./fixtures/letterboxd.mjs";

const RAW = "supabase/seed/raw";
// One line per fixture; a raw file may feed more than one. Chapter 0.6 adds
// the Mirage tab.
const SOURCES = [
  {
    raw: "letterboxd/stephen-king-watch-list.csv",
    out: "king-films.json",
    build: letterboxdList,
  },
  {
    raw: "letterboxd/stephen-king-watch-list.csv",
    out: "king-books.json",
    build: kingWorks,
  },
];

function outDir(argv) {
  const flag = argv.indexOf("--out");
  if (flag === -1) return "supabase/seed/fixtures";
  const dir = argv[flag + 1];
  if (!dir) throw new Error("--out needs a directory");
  return dir;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  );
}

// Sorted keys, two-space indent, one trailing newline: what Biome's JSON
// formatter writes too, so lint and the byte compare agree.
function serializeFixture(data) {
  return `${JSON.stringify(sortKeys(data), null, 2)}\n`;
}

try {
  const out = outDir(process.argv);
  mkdirSync(out, { recursive: true });
  for (const source of SOURCES) {
    const rawPath = `${RAW}/${source.raw}`;
    // Two fixtures can share a raw file, so an error names the one being built.
    let data;
    try {
      data = source.build(readFileSync(rawPath, "utf8"), rawPath);
    } catch (error) {
      throw new Error(`${source.out}: ${error.message}`);
    }
    writeFileSync(join(out, source.out), serializeFixture(data), "utf8");
    console.log(
      `wrote ${out}/${source.out} (${data.items.length} items, ${data.shelves.length} shelves)`,
    );
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
