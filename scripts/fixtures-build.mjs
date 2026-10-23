/**
 * Builds every fixture in supabase/seed/fixtures from its raw file.
 *
 * Raw in, JSON out, nothing else; `scripts/fixtures/build.mjs` does the work,
 * and writes nothing until every fixture has built. `--out <dir>` sends the
 * files somewhere else, which is how tests/unit/fixtures.test.ts builds a
 * fresh copy without touching the repo. Nothing under raw/ is ever written.
 */
import { buildFixtures } from "./fixtures/build.mjs";
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

try {
  const lines = buildFixtures(SOURCES, {
    rawDir: RAW,
    outDir: outDir(process.argv),
  });
  for (const line of lines) console.log(line);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
