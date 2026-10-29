// npm run openlibrary:record -- <target>...
// Records real Open Library responses under tests/fixtures/openlibrary, named
// the way the stub (tests/stub/openlibrary.ts) serves them. Targets:
// `search:<query>` (page 1), `works/<id>`, `authors/<id>`, `isbn/<isbn>` (the
// redirect followed, the edition written under its books/ id). No key; the
// client's User-Agent names the nook, and the calls are a second apart, as
// Open Library asks. Exit 1 is a failed call, exit 2 a usage error.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeIsbn } from "../src/lib/isbn";
import {
  openLibraryFromEnv,
  ProviderError,
  SEARCH_FIELDS,
  SEARCH_LIMIT,
} from "../src/lib/providers/openlibrary";
import { searchFileName } from "../tests/stub/names";

const DIR = join(process.cwd(), "tests/fixtures/openlibrary");
const usage =
  "usage: npm run openlibrary:record -- search:<query> works/<id> authors/<id> isbn/<isbn>";

type Target = {
  path: string;
  params: Record<string, string | number>;
  // The file name, or how to read it off the body (an edition's books/ id).
  file: string | ((body: { key?: string }) => string | null);
};

function parse(arg: string): Target | string {
  if (arg.startsWith("search:") && arg.length > "search:".length) {
    const q = arg.slice("search:".length);
    return {
      path: "/search.json",
      params: { q, fields: SEARCH_FIELDS, limit: SEARCH_LIMIT, page: 1 },
      file: searchFileName(q, 1),
    };
  }
  const record = arg.match(/^(works|authors)\/(OL[0-9]+[WA])$/);
  if (record) {
    return {
      path: `/${arg}.json`,
      params: {},
      file: `${record[1]}-${record[2]}.json`,
    };
  }
  if (arg.startsWith("isbn/")) {
    const isbn = normalizeIsbn(arg.slice("isbn/".length));
    if (!isbn)
      return `${arg} isn't a valid ISBN (a wrong check digit or length)`;
    return {
      path: `/isbn/${isbn}.json`,
      params: {},
      file: (body) => {
        const id = body.key?.match(/^\/books\/(OL[0-9]+M)$/)?.[1];
        return id ? `books-${id}.json` : null;
      },
    };
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

const ol = openLibraryFromEnv();

async function main() {
  for (const [i, target] of (targets as Target[]).entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const body = await ol.get<{ key?: string }>(target.path, target.params);
      const file =
        typeof target.file === "string" ? target.file : target.file(body);
      if (!file) throw new ProviderError(502, "Open Library");
      writeFileSync(join(DIR, file), `${JSON.stringify(body, null, 2)}\n`);
      console.log(`openlibrary:record: ${file}`);
    } catch (error) {
      const status =
        error instanceof ProviderError ? error.status : "no answer";
      console.error(`openlibrary:record: ${target.path} failed (${status})`);
      process.exitCode = 1;
    }
  }
}

main();
