---
name: providers
description: How a metadata provider (TMDB, Open Library, the next one) joins Fluxnook - the client closure, errors and env seams, canonical keys, the stub and recorder, the match rule, import and attach, covers, the routes and their 503s, and the tests. Load before adding or changing anything under src/lib/providers, src/app/api/v1/providers, src/lib/catalog or tests/stub.
---

# Providers

Written in Ch 1.4 Run 1 from the 1.2 (TMDB) and 1.3 (Open Library) code. When the code and this file disagree, the code is right and this file is a finding.

## The client: one file, one closure

`src/lib/providers/<provider>.ts`, no package (`docs/STACK.md`). The shape both clients share:

- `create<Provider>(options)` returns an object of calls closed over the settings. Options are plain values plus an optional `fetch`, so a unit test passes its own. The key, when there is one, lives only in the closure.
- `<provider>FromEnv()` is what routes call: it reads `readServerEnv()` and builds the client. Routes never build a URL or read a provider's env themselves.
- `get<T>(path, params)` is the one place a URL is built. The base comes from the environment, never from a request; the path is joined to it, params go through `searchParams.set`. Every other call goes through `get`.
- Mapped types out, raw types in. `Raw*` types describe the provider's JSON and stay private; exported types (`TmdbItem`, `OpenLibraryWork`, `OpenLibraryEdition`) are the nook's terms. A search row and a detail share one type, with detail-only fields null on the row.
- Junk reads as null, never as a guess and never as a throw: `fullDate` and `parseOpenLibraryDate` return null for what they can't read, `positiveInteger` drops zero and non-integers, `pageCount` drops anything past Postgres `integer` (1.3 R2), `safePosterPath` and `firstCover` drop anything not a plain id or file name. One bad field never fails a whole import.
- Text the provider hands over as a blurb is cleaned in the client (`cleanDescription`, the 1.3 blurb rule: cut at the first rule, links unwrapped, a bare "source" link dropped). Nothing else is touched.
- `package.json` is imported for the `User-Agent` (`Fluxnook/<version> (<contact, else the repo URL>)`) when the provider asks to be told who is calling. The contact is optional env and goes nowhere else.

Timeouts and redirects. Open Library's `get` races the fetch against `AbortSignal.timeout(20_000)` (Roadmap 2026-10-29) and maps an abort to `ProviderError(504)`, a network failure to `502`. It follows a redirect by hand, once, only when it lands under the base URL (the SSRF line). TMDB's client has neither: it predates the rule and is out of scope until a chapter touches it. A new client follows Open Library's shape: a timeout, `redirect: "manual"`, no retry.

## Errors

`src/lib/providers/errors.ts`, shared by every client:

- `ProviderNotConfigured`: the key a provider needs is empty. Its message names `TMDB_API_KEY` today; a second keyed provider gives it the variable's name as a constructor argument rather than copying the class.
- `ProviderError(status, provider)`: anything that isn't a usable answer. It carries a status and the provider's display name, never the provider's message, body or URL. A client may throw it with a status it chose (`502` for a malformed body, `504` for a timeout).

Routes catch these two and nothing else from a client; anything else is a bug and is rethrown. The catalog layer turns a provider 404 into `NotFoundError` (`openLibraryWork`, the TMDB `details` catch in `importFromTmdb`).

## Environment

`src/lib/env.ts`, `serverEnvSchema` and `readServerEnv()`. Per provider, up to three slots, all optional, never `NEXT_PUBLIC_`:

- `<P>_API_KEY` when there is a key. Empty reads as null and the feature is off (503), nothing else breaks.
- `<P>_BASE_URL` (and a covers or image base when the provider serves images elsewhere), defaulting to the provider's own. This is the stub seam: tests and the Browse point it at `tests/stub/`, and nothing else ever changes it.
- `<P>_CONTACT` for the `User-Agent`, when the provider asks for one.

A new slot is added in four places: the zod schema with its default, `ServerEnv`, `processServerEnv`, and the `env` block of `vitest.db.config.ts`. `.env.example` gets the slot empty with a comment saying where the value comes from (Roadmap 2026-10-24: no secret-shaped value is committed). `tests/unit/env.test.ts` covers the defaults.

## Keys and sources

- A provider id is stored canonical in `item_sources (source, key)`, the catalog's identity table (Roadmap 2026-10-23). `source` is the provider's lowercase name (`tmdb`, `openlibrary`); the key carries the kind when ids collide across kinds (`movie/603`, `tv/1396`, `works/OL81626W`, `books/OL32864645M`).
- `parse<Provider>Key` lives in the client, is a strict regex, and returns the parts or null. The import rebuilds the canonical form from the parse, so `movie/0133805` is `movie/133805` (1.2 B1). The route's zod schema uses the same pattern, so a non-canonical spelling never reaches the client.
- Every source row has a `url`: the record's public page at the provider, built in `import.ts` / `editions.ts` (`tmdbUrl`, `openLibraryUrl`), never echoed from a response unchecked. The item page's Sources line links it.
- Editions follow the same rule in `edition_sources`; franchises in `franchise_sources`. An ISBN is a source (`isbn`, the 13-digit form), not a column.

## Matching: `src/lib/catalog/match.ts`

One rule, held in three places: the search's `catalog` status, the sheet that shows it, and `attach`, which enforces it (Roadmap 2026-10-24, 1.2 S1). The sheet never decides.

- `matchRow(row)` turns a provider row into a `MatchRow` (`source`, `key`, `type`, `title`, `year`, `authors`). `MatchType` and `MatchRow.source` are unions that grow by one member per provider.
- `sameWork(row, held)`: same type, same `normalizeTitle`, and a title that folds to nothing matches nothing. Then per type: film and TV, years within 1 when both have one; book, the held author is one of the row's names folded, or all of them in any order (1.3 R3), and never the year.
- `catalogStatuses(db, { userId, rows })` is two queries per page whatever its size: the keys already in (`in`), then one candidate query built from per-type `arms`, each limited to items with no source from that provider. Candidates carry the signed-in user's first shelf and position, never another user's.
- `normalizeTitle` and `normalizeName` in `normalize.ts` are the only folds. A new rule that needs a different fold adds a named function there with its unit test, not an inline regex.

A new provider adds a comparator branch to `sameWork`, an arm to `catalogStatuses`, and a member to the unions. It does not copy the function.

## Import and attach: `src/lib/catalog/import.ts`

The pattern every import follows, read off `importFromTmdb`, `importFromOpenLibrary` and `importEditionFromOpenLibrary`:

1. Parse the key; a bad one is `NotFoundError`.
2. Look it up with `itemForKey` (or `editionFor`). Already in: return `{ id, created: false }`, nothing written, nothing fetched. That is the idempotence the route answers with 200.
3. Fetch details from the provider, outside any transaction.
4. One `db.transaction`: create the item, or `attach` to `attachTo`; insert the source row with `.onConflictDoNothing().returning()`; nothing returned means another import won the key, so throw `KeyTaken`. Then the type's child row (`writeChild`, `itemBooks`) with `onConflictDoUpdate` filling only nulls (`coalesce`).
5. Catch `KeyTaken` outside the transaction, read the winner with `itemForKey`, return it as `created: false`. This is how two tabs adding the same thing end with one row (1.2 B2, 1.3 R4).
6. Covers after the commit (below).

`attach(tx, itemId, row, fills)` locks the item `for update`, then: wrong type is `ConflictError`; the same key already on it is `KeyTaken`; another key from the same provider is `ConflictError` naming it; `sameWork` false is `ConflictError` naming the rule. It then fills `summary` only when null and the date by `mergedDate` (a finer date in the same year refines; another year never replaces, Roadmap 2026-10-24 Q2). It never touches a title, a form or an author.

Shared rows a provider seeds (a franchise) are found by source first; when missing, insert the row, claim its source with `onConflictDoNothing`, and if the claim lost, delete the row just made and use the winner's (`addFranchise`, 1.2 B2).

The route maps `NotFoundError` to 404, `ConflictError` to 409 with its message, `ProviderNotConfigured` / `ProviderError` to 503, and returns `created ? 201 : 200`.

## Covers

`cacheCover` in `import.ts` and the store in `src/lib/covers.ts`. Public bucket `covers`, written only by the server with `SUPABASE_SECRET_KEY` (`coverStoreOrNull()` returns null with one log line when it's unset, and imports go on).

- Path is `<source>/<provider id>.<ext>` (`tmdb/movie/603.jpg`, `openlibrary/12345.jpg`), so a re-import overwrites (`upsert: true`) rather than piling up.
- 10 s timeout, `content-type` must start `image/`, 5 MB cap, then `put` and `update items set cover_path = path where cover_path is null`. A held cover is never replaced.
- Any failure is one `console.warn` naming the key and the reason, and the import still succeeds. The log line names the provider key, never the fetched URL.
- The image URL is built by the client from a checked id or path (`posterUrl`, `coverUrl`), never taken raw from a response.
- `cacheCover` writes `items.cover_path` only. A cover for another table needs that table's update beside it, not a second copy of the fetch.

## Routes

- Search: `GET /api/v1/providers/<provider>/search` (`route.ts` plus `schema.ts` beside it). 401 when signed out (`apiError(401, "unauthorized", "Sign in to search.")`), zod on the query with `fieldErrors` for the 400, the client call, `catalogStatuses`, then `Response.json({ page, totalPages, results }, { headers: noStore })` with each row carrying `catalog`.
- Import: `POST /api/v1/items/import` is a zod `discriminatedUnion` on `source`, one member per provider whose import is "one key, one item". A provider whose import writes something else (an edition: `POST /api/v1/editions/import`) gets its own route and schema. Both check `isJsonRequest` (415) before parsing.
- The 503s are the provider's name in a plain sentence; the provider's own words never reach a response. Search: "Search isn't set up on this nook yet." (no key), "<Provider> didn't answer. Try again in a moment." (any `ProviderError`). Import: "<Provider> isn't reachable from this nook right now." The code is always `provider_unavailable`.
- `/search` (`src/app/(app)/search/search.tsx`) calls each provider's search with `ask(url, signal)`, which turns a 503 body's `error.message` into the group's one line. All fans out in parallel and one provider down leaves the others showing (Roadmap 2026-10-28).

## Stub and recorder

- `tests/stub/<provider>.ts`: a plain `node:http` server, `start<Provider>Stub({ port = 0, dir })`, serving `tests/fixtures/<provider>/` by path. It answers `/health`, records each request's path and the identity header it cares about (`authorization`, `user-agent`) so a test can assert on them, serves `PIXEL` (the 1x1 JPEG exported from `tests/stub/tmdb.ts`) for every image path, a canned empty answer for an unrecorded search, the provider's 404 shape for an unknown record, 500 under `/broken/`, and a sentinel query (`DOWN_QUERY = "__down__"`) that answers 500 so an e2e can see the unavailable line. `RECORDINGS` is `join(process.cwd(), ...)` because Playwright loads the file as CommonJS.
- `tests/stub/names.ts` `searchFileName(query, page)` is the one naming rule for search recordings; stub and recorder both use it.
- `scripts/<provider>-stub.ts` and `npm run <provider>:stub -- [--port N]` run it on a fixed port for the Browse; `tests/e2e/harness/<provider>-stub.ts` holds that port (TMDB and Open Library take 4010 and 4011), `tests/e2e/global-setup.ts` starts it unless one already answers, and `playwright.config.ts` `webServer.env` points the app at it.
- Record first. In a Signature that brings a provider call, the recordings are made before the Cartographer writes a step (House Rules step 2, Ch 1.4): the plan's facts (how many rows a search returns, which names a volume carries, what a list call serves) come off the recordings, never off the probe or the fixture. A stub with no recording for a record answers a 500 that names the missing file, never an empty list (tests/stub/comicvine.ts), so a plan written against a gap fails loud.
- `scripts/<provider>-record.ts` and `npm run <provider>:record -- <target>...` call the real provider through the client's own `get` and write the JSON where the stub looks. It reads the key from `.env.local` (`node --env-file=.env.local`) and never prints it; exit 1 is a failed call, 2 a usage error; calls are paced when the provider asks. Recordings are committed, so nothing that identifies the key may be in them: write it out of any URL in the body before the file is saved.

## Tests

- Unit (`npm test`, no stack): the mapping against the recordings (`tests/unit/<provider>.test.ts`), the key parser, the cleaners, the env defaults, the stub itself, and each route with auth, client and matcher mocked through `vi.hoisted` + `vi.mock` (`tests/unit/openlibrary-search-route.test.ts` is the pattern).
- db (`npm run test:db`, the local stack): matching and import against real Postgres and real Storage, each file starting its own stub on port 0 and building the client with `create<Provider>` pointed at it. db files run side by side, so a file that writes catalog rows serves the recordings under ids of its own and tags its titles (`tests/db/import-openlibrary.test.ts`); a test that reads the loaded fixtures must not be one another file's import can change. Races are tested by firing the same import twice with `Promise.all` (`rummage-books-twice`, `rummage-franchise-race`). A test that runs an import through its covers carries the import's own timeout from the start (30 s on the 62-issue Mirage attach, tests/db/catalog-match-comics.test.ts): vitest's 5 s was crossed as db files grew, and a test killed mid-transaction deadlocked the next statement and left a tagged probe row that turned the following run red (Ch 1.4.3 D1).
- e2e (Playwright): through the stubs only. CI holds no provider secret; the app gets `<P>_API_KEY: "stub"` and the stub's base URLs from `playwright.config.ts`.
- One live test per keyed provider, `it.skipIf(!apiKey)`, checking the real API still answers in the recordings' shape (`tests/unit/tmdb-live.test.ts`). It runs on the dev box only.

## Docs the provider touches

`docs/API.md` (the routes, their errors, the `catalog` states, and a "What someone would get wrong" line for each rule that surprises), `docs/STACK.md` (the providers table: key, limit, notes), `.env.example`, the README's Screens and env sections, and the footer's attribution line in `src/components/shell/footer.tsx` (TMDB's logo and required disclaimer; "Book data from Open Library." with a link) when the provider's terms ask for one, or as manners when they don't.

## A new provider, in order

1. Read the provider's terms and rate line into `docs/STACK.md`'s table; a key goes on the Hands line with its check.
2. Env slots (four places plus `.env.example`).
3. The client, its `parse*Key`, its mapping; the recorder; recordings; unit tests on them.
4. The stub, its harness port, `global-setup.ts`, `playwright.config.ts`, `vitest.db.config.ts`.
5. `match.ts`: union members, a `sameWork` branch, a `catalogStatuses` arm.
6. The search route and its schema; then the import path and its route.
7. Covers through `cacheCover`.
8. `/search` gains its chip and group; the item page gains what the provider fills; the footer gains its line.
