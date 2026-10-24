// npm run tmdb:record -- <path>...
// Records real TMDB responses under tests/fixtures/tmdb, named the way the stub
// (tests/stub/tmdb.ts) serves them. Paths: `search:<query>` (page 1),
// `movie/<id>`, `tv/<id>`. Reads TMDB_API_KEY from .env.local and never prints
// it. Exit 1 is a refusal or a failed call, exit 2 a usage error.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readServerEnv } from "../src/lib/env";
import { createTmdb, ProviderError } from "../src/lib/providers/tmdb";
import { searchFileName } from "../tests/stub/tmdb";

const DIR = join(process.cwd(), "tests/fixtures/tmdb");
const usage = "usage: npm run tmdb:record -- search:<query> movie/<id> tv/<id>";

type Target = {
  path: string;
  params: Record<string, string | number>;
  file: string;
};

function parse(arg: string): Target | null {
  if (arg.startsWith("search:") && arg.length > "search:".length) {
    const query = arg.slice("search:".length);
    return {
      path: "/search/multi",
      params: { query, page: 1 },
      file: searchFileName(query, 1),
    };
  }
  const match = arg.match(/^(movie|tv)\/(\d+)$/);
  if (!match) return null;
  return { path: `/${arg}`, params: {}, file: `${match[1]}-${match[2]}.json` };
}

const args = process.argv.slice(2);
const targets = args.map(parse);
if (args.length === 0 || targets.some((t) => t === null)) {
  console.error(
    `tmdb:record: nothing to record or a path it can't read\n${usage}`,
  );
  process.exit(2);
}

const env = readServerEnv();
if (!env.tmdbApiKey) {
  console.error("tmdb:record: TMDB_API_KEY is not set in .env.local");
  process.exit(1);
}
const tmdb = createTmdb({
  apiKey: env.tmdbApiKey,
  baseUrl: env.tmdbBaseUrl,
  imageBaseUrl: env.tmdbImageBaseUrl,
});

async function main() {
  for (const target of targets as Target[]) {
    try {
      const body = await tmdb.get(target.path, target.params);
      writeFileSync(
        join(DIR, target.file),
        `${JSON.stringify(body, null, 2)}\n`,
      );
      console.log(`tmdb:record: ${target.file}`);
    } catch (error) {
      const status =
        error instanceof ProviderError ? error.status : "no answer";
      console.error(`tmdb:record: ${target.path} failed (${status})`);
      process.exitCode = 1;
    }
  }
}

main();
