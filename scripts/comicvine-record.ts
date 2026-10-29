// npm run comicvine:record -- <target>...
// Records real Comic Vine responses under tests/fixtures/comicvine, named the
// way the stub (tests/stub/comicvine.ts) serves them. Targets:
// `search:<query>` (the one page the client asks for), `volume/<id>`, and
// `issues/<id>` (every page the client would fetch, one file per offset).
// The key comes from .env.local and goes nowhere but the client: any
// `api_key=` in a body is emptied before the file is written, and a log line
// names a file or a status, never a URL. Calls are a second apart. Exit 1 is
// a failed call, exit 2 a usage error.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  comicVineFromEnv,
  comicVinePath,
  ISSUE_FIELDS,
  ISSUES_LIMIT,
  ProviderError,
  ProviderNotConfigured,
  SEARCH_FIELDS,
  SEARCH_LIMIT,
  VOLUME_FIELDS,
} from "../src/lib/providers/comicvine";
import {
  issuesFileName,
  searchFileName,
  volumeFileName,
} from "../tests/stub/names";

const DIR = join(process.cwd(), "tests/fixtures/comicvine");
const usage =
  "usage: npm run comicvine:record -- search:<query> volume/<id> issues/<id>";

type Target =
  | { kind: "search"; query: string }
  | { kind: "volume" | "issues"; id: number };

function parse(arg: string): Target | string {
  if (arg.startsWith("search:") && arg.length > "search:".length) {
    return { kind: "search", query: arg.slice("search:".length) };
  }
  const record = arg.match(/^(volume|issues)\/([1-9][0-9]{0,9})$/);
  if (record) {
    return { kind: record[1] as "volume" | "issues", id: Number(record[2]) };
  }
  return `can't read ${arg}`;
}

const args = process.argv.slice(2);
const targets = args.map(parse);
const refusal = targets.find((t) => typeof t === "string");
if (args.length === 0 || refusal) {
  console.error(
    `comicvine:record: ${refusal ?? "nothing to record"}\n${usage}`,
  );
  process.exit(2);
}

const cv = comicVineFromEnv();
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

/** The body as committed: pretty, and with no key in any URL inside it. */
function save(file: string, body: unknown) {
  const text = JSON.stringify(body, null, 2).replace(
    /api_key=[^&"\s]*/g,
    "api_key=",
  );
  writeFileSync(join(DIR, file), `${text}\n`);
  console.log(`comicvine:record: ${file}`);
}

async function record(target: Target) {
  if (target.kind === "search") {
    const body = await cv.get("/search/", {
      resources: "volume",
      query: target.query,
      limit: SEARCH_LIMIT,
      field_list: SEARCH_FIELDS,
    });
    save(searchFileName(target.query, 1), body);
    return;
  }
  if (target.kind === "volume") {
    const body = await cv.get(
      comicVinePath({ kind: "volume", id: target.id }),
      {
        field_list: VOLUME_FIELDS,
      },
    );
    save(volumeFileName(target.id), body);
    return;
  }
  // The issue list, page by page, as the client's `issues` walks it.
  let offset = 0;
  for (;;) {
    const body = await cv.get<unknown[]>("/issues/", {
      filter: `volume:${target.id}`,
      sort: "cover_date:asc",
      limit: ISSUES_LIMIT,
      offset,
      field_list: ISSUE_FIELDS,
    });
    save(issuesFileName(target.id, offset), body);
    const rows = Array.isArray(body.results) ? body.results.length : 0;
    offset += rows;
    if (rows === 0 || offset >= (body.number_of_total_results ?? 0)) return;
    await pause();
  }
}

async function main() {
  for (const [i, target] of (targets as Target[]).entries()) {
    if (i > 0) await pause();
    try {
      await record(target);
    } catch (error) {
      const why =
        error instanceof ProviderNotConfigured
          ? "COMICVINE_API_KEY is not set in .env.local"
          : error instanceof ProviderError
            ? `status ${error.status}${error.code ? `, code ${error.code}` : ""}`
            : "no answer";
      console.error(`comicvine:record: ${args[i]} failed (${why})`);
      process.exitCode = 1;
    }
  }
}

main();
