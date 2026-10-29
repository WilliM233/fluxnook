// npm run openlibrary:record -- <target>...
// Records real Open Library responses under tests/fixtures/openlibrary, named
// the way the stub (tests/stub/openlibrary.ts) serves them. Targets:
// `search:<query>` (page 1), `works/<id>`, `authors/<id>`, `isbn/<isbn>` (the
// redirect followed, the edition written under its books/ id). No key; the
// User-Agent names the nook, and the calls are a second apart, as Open
// Library asks. Exit 1 is a failed call, exit 2 a usage error.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readServerEnv } from "../src/lib/env";
import { normalizeIsbn } from "../src/lib/isbn";
import { searchFileName } from "../tests/stub/names";

const DIR = join(process.cwd(), "tests/fixtures/openlibrary");
const usage =
  "usage: npm run openlibrary:record -- search:<query> works/<id> authors/<id> isbn/<isbn>";
const SEARCH_FIELDS =
  "key,title,author_name,first_publish_year,cover_i,edition_count";

type Target =
  | { kind: "json"; path: string; file: string }
  | { kind: "isbn"; isbn: string };

function parse(arg: string): Target | string {
  if (arg.startsWith("search:") && arg.length > "search:".length) {
    const query = arg.slice("search:".length);
    const params = new URLSearchParams({
      q: query,
      fields: SEARCH_FIELDS,
      limit: "20",
      page: "1",
    });
    return {
      kind: "json",
      path: `/search.json?${params}`,
      file: searchFileName(query, 1),
    };
  }
  const record = arg.match(/^(works|authors)\/(OL[0-9]+[WA])$/);
  if (record) {
    return {
      kind: "json",
      path: `/${arg}.json`,
      file: `${record[1]}-${record[2]}.json`,
    };
  }
  if (arg.startsWith("isbn/")) {
    const isbn = normalizeIsbn(arg.slice("isbn/".length));
    return isbn
      ? { kind: "isbn", isbn }
      : `${arg} isn't a valid ISBN (a wrong check digit or length)`;
  }
  return `can't read ${arg}`;
}

const args = process.argv.slice(2);
const targets = args.map(parse);
const refusal = targets.find((t) => typeof t === "string");
if (args.length === 0 || refusal) {
  console.error(
    `openlibrary:record: ${refusal ?? "nothing to record"}\n${usage}`,
  );
  process.exit(2);
}

const env = readServerEnv();
const version = process.env.npm_package_version ?? "0.0.0";
const userAgent = `Fluxnook/${version} (${env.openLibraryContact ?? "https://github.com/WilliM233/fluxnook"})`;
const base = new URL(env.openLibraryBaseUrl);

async function get(url: URL) {
  return fetch(url, {
    headers: { accept: "application/json", "user-agent": userAgent },
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
}

function write(file: string, body: unknown) {
  writeFileSync(join(DIR, file), `${JSON.stringify(body, null, 2)}\n`);
  console.log(`openlibrary:record: ${file}`);
}

async function record(target: Target) {
  if (target.kind === "json") {
    const response = await get(new URL(target.path, base));
    if (!response.ok)
      throw new Error(`${target.path} answered ${response.status}`);
    return write(target.file, await response.json());
  }
  const hop = await get(new URL(`/isbn/${target.isbn}.json`, base));
  const location = hop.headers.get("location");
  if (hop.status < 300 || hop.status > 399 || !location) {
    throw new Error(`isbn/${target.isbn} answered ${hop.status}`);
  }
  const next = new URL(location, base);
  const id = next.pathname.match(/^\/books\/(OL[0-9]+M)\.json$/)?.[1];
  if (next.origin !== base.origin || !id) {
    throw new Error(`isbn/${target.isbn} redirected off ${base.origin}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const response = await get(next);
  if (!response.ok) throw new Error(`books/${id} answered ${response.status}`);
  write(`books-${id}.json`, await response.json());
}

async function main() {
  for (const [i, target] of (targets as Target[]).entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      await record(target);
    } catch (error) {
      console.error(`openlibrary:record: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  }
}

main();
