# Fluxnook

A cozy place to keep your shelves: films, TV, books, comics and games in one nook, organized the way you read and watch them, with a journal for each pass through and the physical collection tracked alongside.

Volume 1 is in progress. Today you can sign in with a magic link, search TMDB for a film or a show and add it to the catalog, add an item by hand, and open any item's page, locally. Shelves, reads and copies have tables (see Data model) and a loader fills them from the fixtures, but no screens yet.

## Run it locally

You need Node 22.15.0 and Docker Desktop, running. The Supabase CLI is a pinned devDependency, so `npm install` brings it; nothing to install globally. The commands below were run in Git Bash on Windows.

```sh
npm install
cp .env.example .env.local
npx supabase start
npm run dev
```

Open http://localhost:3000, enter any email address and press "Send me a link". No mail leaves your machine: it lands in Mailpit at http://127.0.0.1:54324. Click the link there, in the same browser, and you're on `/nook`. Asking for a link with a new address creates its account, before the link is clicked.

Things that trip people up:

- Use `localhost:3000`, not `127.0.0.1:3000`, and nothing else on port 3000. The link always returns to `http://localhost:3000` (`supabase/config.toml` `[auth]`), and the sign-in cookie lives on the host you asked from. From anywhere else the link won't sign you in.
- Every checkout of this repo has `project_id = "fluxnook"`, so they share one set of containers and one database. Run `npx supabase stop` in the other checkout before `npx supabase start` in this one. The second checkout starts on the first one's data.
- `.env.example` holds the Supabase CLI's fixed local URL, publishable key and database URL. Without `.env.local`, the app throws naming the missing variable.
- Two lines in `.env.example` are empty on purpose, and both are server-only: never `NEXT_PUBLIC_`, never committed, never in a response. `SUPABASE_SECRET_KEY` is the `SECRET_KEY` value `npx supabase status` prints (`npx supabase status -o env` prints it as `SECRET_KEY=`); the server writes cover images to Storage with it. Empty, an import still works and the item has no cover. `TMDB_API_KEY` is the v4 read access token from https://www.themoviedb.org/settings/api (a free TMDB account). Empty, search answers "Search isn't set up on this nook yet" and every other page works.
- Tests and the Browse never need a TMDB key. `npm run tmdb:stub -- --port 4010` serves the recordings in `tests/fixtures/tmdb` and a 1x1 jpg for every poster. Point the app at it with `TMDB_BASE_URL=http://127.0.0.1:4010/3` and `TMDB_IMAGE_BASE_URL=http://127.0.0.1:4010/t/p` in `.env.local` (both optional; they default to TMDB's own). Playwright starts its own stub and sets these for the app it runs.

## Screens

All three sit behind sign-in; a signed-out visit to any of them goes to `/`. The header links Search and Nook; the footer carries TMDB's required attribution line and logo.

- `/search`: type two or more characters, pick All, Films or TV. The URL carries `q` and `type`. Each result says one of three things. In your catalog: Open goes to the item. Looks like one you have: Add opens a sheet with TMDB's side and the catalog item's side; "Same, add the TMDB details to it" adds the TMDB source and fills what the item lacks, "Different, add as new" makes a second item. New: Add imports it and goes to its page. With the box empty it lists the 12 newest catalog items.
- `/items/<uuid>`: the item page. Cover, facts for its type, summary, release date at the precision held, sources as links, relations in both directions, and which of your shelves hold it. An unknown id is a 404 inside the app shell.
- `/items/new`: add an item by hand, for what no provider knows. The fields follow the type.
- `/nook` is still empty. Shelves are Chapter 1.5.

`npx supabase stop` stops the stack and keeps the data. `npx supabase db reset` wipes local data and re-applies `supabase/migrations`; the running app doesn't need a restart.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | The app at http://localhost:3000 |
| `npm run lint` | Biome, lint and format check |
| `npm run typecheck` | `next typegen`, then `tsc --noEmit`. Route types are generated, so plain `tsc` fails on a fresh clone |
| `npm test` | Vitest, `tests/unit`. No stack needed; takes about 10 s |
| `npm run test:db` | Vitest, `tests/db`, straight to Postgres through `DATABASE_URL`. Needs the Supabase stack up and `.env.local` |
| `npm run test:e2e` | Playwright, Chromium, `tests/e2e`. Run `npx playwright install chromium` once first. Needs the Supabase stack up; starts `npm run dev` or reuses one on :3000. One test turns `pg_graphql` on in the local database and off again. `PLAYWRIGHT_ALL_BROWSERS=1` adds Firefox and WebKit (`npx playwright install firefox webkit` once) and runs one worker |
| `npm run db:check` | Fails when `src/db/schema.ts` and `supabase/migrations` disagree. Writes nothing to the repo |
| `npm run fixtures:build` | Rebuilds `supabase/seed/fixtures/*.json` from `supabase/seed/raw`. Deterministic. Plain Node, no stack needed |
| `npm run fixtures:load -- --user <email> [--replace]` | Writes the fixtures into the local database for one user. Needs the stack up, `.env.local`, and that address signed in once, so its `profiles` row exists. See Data model |
| `npm run tmdb:stub -- [--port 4010]` | The TMDB stand-in described under Run it locally. Ctrl+C stops it |
| `npm run tmdb:record -- <path>...` | Rewrites recordings in `tests/fixtures/tmdb` from the real API, reading `TMDB_API_KEY` from `.env.local`. Paths are `search:<query>`, `movie/<id>`, `tv/<id>`. The recordings were made with `search:carrie movie/133805 tv/46157 movie/7340` |
| `npm run check` | The six gates CI runs, in order, stopping at the first red: lint, typecheck, test, db:check, test:db, test:e2e. Needs the stack up |
| `npm run db:generate -- --name=<change>` | drizzle-kit writes a migration into `supabase/migrations`. Read `.claude/skills/migrations/SKILL.md` first |

## CI

Every PR into `dev` or `main`, and every push to `dev`, runs workflow `CI` (`.github/workflows/ci.yml`). It has six jobs, named as their npm scripts: `lint`, `typecheck`, `test`, `db:check`, `test:db`, `test:e2e`. `test:db` and `test:e2e` each start their own Supabase stack in the runner, including Storage for the `covers` bucket. `test:e2e` builds the app and runs it with `next start` on Chromium only. No secrets are used: `.env.example` is copied to `.env.local`, and `SUPABASE_SECRET_KEY` is filled from the key that stack prints. CI holds no TMDB token: the tests run on the stub, and the one test that calls the real TMDB skips without a key.

`npm run check` runs the same six gates locally.

When a check is red:

- Open the job's log. The failing gate's own output is there.
- A red `test:e2e` also uploads a `playwright-report` artifact, with traces.
- A red `db:check` prints the SQL a migration would need, or drizzle-kit's error. A rename needs answering in a terminal: run `npm run db:generate -- --name=<what_changed>` and answer it.
- A job that fails while pulling Supabase images with `toomanyrequests` hit a registry rate limit, not your change. Re-run the job.

Workflow `Nightly` runs the whole Playwright suite on `dev` at 04:17 UTC, one job per browser (Chromium, Firefox, WebKit). Its browser install step is capped at 10 minutes. Start it by hand from the Actions tab or with `gh workflow run nightly.yml --ref dev`. It does not run on PRs.

Tests that sign in should import `test` and `expect` from `tests/e2e/harness/signed-in`. The session is on `page` and `page.request`; Playwright's built-in `request` is signed out.

## Fixtures

`supabase/seed` holds the acceptance data every later chapter is checked against. Today that is L's Stephen King watch list from Letterboxd, built into two files from the one raw CSV: `king-films.json` (61 films, one shelf) and `king-books.json` (27 book items, 78 relations, one shelf, one gap); and the Mirage tab of L's TMNT sheet, `tmnt-mirage.json` (366 comics, 47 relations, 5 editions, 5 copies, 26 occurrences, one shelf of 14 sections, 9 gaps).

- `supabase/seed/raw/<source>/`: exports exactly as their source wrote them. Never edit one by hand. Each has a row in `supabase/seed/raw/README.md`.
- `supabase/seed/fixtures/<name>.json`: generated, committed, never edited. `npm run fixtures:build` writes it. A second run leaves `git status` clean.
- `src/fixtures/shape.ts`: the Zod shape of a fixture file. Item ids are `<source>:<key>`; the King films are `letterboxd:<boxd key>`. An item with no provider is `manual:<slug>-<year>` with `providers: {}` (`manual:salems-lot-1975`; apostrophes and accents are dropped from the slug).

Items are a `film`, a `book` or a `comic`. A book has an `author` and a `form`: `novel`, `novella`, `collection`, `story` or `series`. A short story is a book with form `story`; Night Shift is the `collection` its 16 stories are in. The King notes name the works; `scripts/fixtures/king-works.mjs` reads them out of the films' `source_note`s.

A comic has a `form`: `issue`, `one-shot`, `backup` (a short printed inside another comic), `collected` (a trade or hardcover as a work) or `anthology` (a host the run doesn't list as its own). It also has `series`, `series_kind` (`ongoing`, `micro-series`, `mini-series`, `crossover`, `tie-in`, `minor`), `number`, an optional `month`, and `source_date`, the sheet's date cell verbatim. `year` can be null on a comic and nowhere else; a row or anthology with no year is a `gaps` line, while an Ultimate Collection's year is its edition's, which the sheet doesn't hold. The sheet's columns mean different things in different sections, so `scripts/fixtures/mirage-tab.mjs` has one rule per section header. Its ids are `manual:tmnt-mirage-v1-7` for a numbered row, `manual:tmnt-mirage-<section>-<title>` otherwise, `manual:tmnt-mirage-host-<cell>` for an anthology and `manual:tmnt-ultimate-collection-<n>`. The two `Savage Dragon #2` rows are two items; the later id ends in `-r212`, its record number.

A file may also carry:

- `relations`: `{ type, from, to }`, `type` being `adaptation-of` (from the adaptation to its source) or `contained-in` (from the part to the whole). Either end may be an item in another file: `king-books.json` holds the relations, and its `adaptation-of` ones start in `king-films.json`.
- `gaps`: `{ item, reason }`, an item the raw file gave nothing to build from. Recorded, not filled in, and not a relation. Today: The Long Walk (`letterboxd:mic8`), "no source note", and the nine undated Supplemental/Crossover rows, "no readable year".

- `editions`: `{ id, item, format, contents }`. `id` is `edition:<key>`, `item` is the work it prints (in the same file), `format` is `floppy`, `tpb`, `hardcover` or `omnibus`, `contents` the items it collects. An edition id never passes as an item id.
- `copies`: `{ edition, note }`, a copy of an edition.
- `occurrences`: `{ item, status }`, `status` being `done`.

All of these read as empty when absent. A shelf has `entries` or `sections` (`{ name, entries }`, positions restarting in each), never both; its `url` is optional, and the Mirage shelf has none because the sheet is private. A work has one year, the one its note gives; a second year for the same title stops the build.

Owned via: an issue listed in an edition's `contents` is owned through the copy of that edition. That is never written as `contained-in`, which is for a backup inside its host. Read is an occurrence and is never derived from a copy.

`npm test` goes red when a fixture disagrees with the shape or with a fresh build of its raw file (`tests/unit/fixtures.test.ts`). The same file checks every fixture together: no id is defined in two files, and every relation endpoint, shelf entry (flat or in a section) and gap names an item in some file, every edition content, copy and occurrence resolves, and no edition id is defined twice. The shape alone can't see across files. The fresh build goes to `node_modules/.cache/fixtures`; no test writes to the repo.

The build stops, naming the raw file and record, when an export changed shape: different headers, a non-empty `Tags`, a URL that isn't `https://boxd.it/<key>`, a Year or Position that isn't a whole number, a film listed twice with different data, or a list with no films. The Mirage build stops, naming the fixture, raw file and record, on a section header it has no rule for (or one repeated in a volume), a row its section's rule can't read, an `Owned` and `Format` that disagree, or an id that repeats outside Supplemental/Crossover. A date with no year does not stop it; that is a gap. The books build also stops, naming the fixture, raw file, record and note line, on a note line it can't read, a story with no collection, two lines that disagree about one work or its year, a line repeated within one note, or a shelf work no first note line names. No fixture is written until every fixture has built, and two `SOURCES` lines with one `out` stop the build. It never drops a row quietly. A hand-edited raw file shows up as a red byte compare, not as a fix.

Adding a raw file: put it under `supabase/seed/raw/<source>/`, add its row to `supabase/seed/raw/README.md`, add a `SOURCES` line in `scripts/fixtures-build.mjs` per fixture (a raw file may feed more than one; builders live in `scripts/fixtures/<name>.mjs`, and a new source needs its own; each `out` must be new), run `npm run fixtures:build`, and commit the raw file and its JSON together. From a Google Sheet, export one tab per file (File > Download > Comma-separated values) under `google-sheets/`; a new tab needs its own section rules. The CSV reader is `scripts/fixtures/csv.mjs`, written in-repo; no package was added.

## Data model

`src/db/schema.ts` holds 20 tables in `public`, in two halves. The item page reads the catalog and the signed-in user's shelf entries; nothing else reads the content half yet.

- The catalog, shared by every user, no `visibility`: `items` (a `film`, `tv`, `book` or `comic`; `form` is null for films and shows and required for books and comics; `summary` and `cover_path` are shared by every type), `item_films` (runtime, original title), `item_tv` (seasons, episodes, original title, first and last aired, ended), `item_books`, `item_comics`, `item_sources`, `item_relations`, `editions`, `edition_sources`, `edition_contents`, `franchises`, `franchise_sources`, `item_franchises`. An item's identity is its `item_sources` row, `(source, key)`: the fixtures' `letterboxd:20ZQ` is source `letterboxd`, key `20ZQ`, and `manual` is a source like any other. A TMDB key carries the kind, `movie/603` or `tv/1396`, because the ids collide; an item added by hand has its own uuid as its `manual` key and its `created_by` set (loader rows have it null). Dates are `released_on` plus `released_precision` (`day`, `month`, `year`), both null or both set.
- A person's content: `shelves`, `shelf_sections`, `shelf_entries`, `occurrences` (a read or watch, with half-step `stars`), `journal_entries`, `copies`. Everything here points at the catalog and never the other way round.
- `profiles` is an account table: no `visibility`, no `updated_at`.

Visibility is `private`, `unlisted` or `public`, default `private`, on `shelves`, `shelf_entries`, `occurrences`, `journal_entries` and `copies`. `shelf_sections` has none; the shelf's is the section's. `owner` is on `shelves`, `occurrences` and `copies` only: the rest reach their owner through their parent. Nothing enforces that a child is no more visible than its parent yet.

Deletes: removing a `profiles` row removes everything that person owns and leaves the catalog alone. A catalog row can't be deleted while a shelf entry or occurrence points at its item, or a copy at its edition. Deleting a shelf section deletes its entries.

Every enumeration is `text` with a check constraint, not a Postgres enum. Every table but `profiles` has `updated_at`, kept by the trigger `<table>_updated_at`.

Owned via: a work is owned when a copy's edition holds it. There is no column for it; it is a query over `copies`, `editions`, `edition_contents` and `items`. Read is an `occurrences` row and is never derived from a copy.

```sh
docker exec supabase_db_fluxnook psql -U postgres -tAc "select i.title || ' | owned via ' || w.title from copies c join editions e on e.id = c.edition join items w on w.id = e.item join edition_contents ec on ec.edition = e.id join items i on i.id = ec.item order by w.title, ec.position"
```

After the fixtures are loaded this returns 37 rows.

The loader, `npm run fixtures:load -- --user <email>`, reads every file under `supabase/seed/fixtures`, checks each against `src/fixtures/shape.ts`, and writes in one transaction: the catalog first, then the user's shelves, sections, entries, copies and occurrences. After a reset and one load the counts are 454 `items`, 454 `item_sources`, 125 `item_relations`, 5 `editions`, 37 `edition_contents`, and for the user 3 `shelves`, 14 `shelf_sections`, 398 `shelf_entries`, 26 `occurrences`, 5 `copies`. `gaps` are printed and not loaded.

- The address is matched without regard to case, and must already be signed in. With no auth user or no `profiles` row it exits 1 and says which.
- The catalog is upserted on its source key, so a second run adds no catalog row. It does not refresh a row's `item_sources.url`, and does not remove a relation or content that has left a fixture.
- Content loads only into a user who has none. A second plain run exits 1 with `already has ... pass --replace` and writes nothing. `--replace` deletes that user's shelves, occurrences and copies, with their sections, entries and journal entries, then loads again. The log names the email before it deletes.
- Two loads for one user at once: the second waits, then refuses.
- `npx supabase db reset` removes all of it. Sign in again, then load.

Raw SQL by hand: `docker exec supabase_db_fluxnook psql -U postgres`, as above. Studio is at http://127.0.0.1:54323.

## Where things are

- `src/app`: the sign-in page at `/`, the signed-in pages under the `(app)` route group (`/nook`, `/search`, `/items/<uuid>`, `/items/new`; its layout holds the sign-in guard, header and footer), and the API route handlers under `src/app/api/v1`
- `src/components/shell`: the header and footer. `src/components/ui`: shadcn components
- `src/lib`: env reader (`readEnv` for the public settings, `readServerEnv` for the server-only ones), Supabase server client and session refresh, the API error helper
- `src/lib/providers/tmdb.ts`: the TMDB client. `src/lib/catalog`: title matching, import, manual entry and the item page's reads. `src/lib/covers.ts`: the Storage client for the `covers` bucket, server-only
- `tests/stub/tmdb.ts`, `tests/fixtures/tmdb`: the TMDB stub and the recordings it serves
- `public/tmdb`: TMDB's logo, with its source noted
- `src/proxy.ts`: refreshes the session on every request except Next's assets and image files
- `src/db/schema.ts`: Drizzle table definitions. See Data model
- `src/db/client.ts`: `createDb()`, the Drizzle client over `postgres` on `DATABASE_URL`. The caller closes it
- `src/fixtures/load.ts`, `scripts/fixtures-load.ts`: the fixture loader and the script behind `npm run fixtures:load`. The script runs through `tsx`
- `supabase/`: local stack config and migrations
- `supabase/seed`: raw exports and the fixtures built from them. See Fixtures
- `src/fixtures/shape.ts`: the Zod shape of a fixture file
- `tests/unit`, `tests/db`, `tests/e2e`: Vitest, Vitest against Postgres, and Playwright. `tests/unit/fixtures/helpers.ts` holds `exportOf()` and `sheetOf()`, inline raw files for builder tests
- `tests/e2e/harness`: `signedIn`, a Playwright fixture that gives a spec a page signed in as a brand-new user. Its doc comment is the contract
- `scripts/db-check.mjs`: the script behind `npm run db:check`
- `scripts/fixtures-build.mjs`, `scripts/fixtures/`: the script behind `npm run fixtures:build`, the build loop (`build.mjs`), the CSV reader, `slug.mjs` (one rule for every `manual:` id), and the three builders: Letterboxd list, King works and Mirage tab
- `.github/`: the workflows and the two composite actions they share

## Docs

- `docs/ROADMAP.md`: what Fluxnook is, the principles, the Volumes
- `docs/HOUSE-RULES.md`: how a chapter gets built
- `docs/STACK.md`: every pinned version and why it's there
- `docs/API.md`: the `/api/v1` routes
- `docs/releases/`: what each chapter changed; `CHANGELOG.md` lists them
- `docs/team/`: the seats
- `docs/plans/`: one plan per chapter

The Scribe owns this file from Volume 0 Chapter 2 onward.
