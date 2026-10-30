# Fluxnook

A cozy place to keep your shelves: films, TV, books, comics and games in one nook, organized the way you read and watch them, with a journal for each pass through and the physical collection tracked alongside.

Volume 1 is in progress. Today you can sign in with a magic link, search TMDB for a film or a show, Open Library for a book (or type an ISBN), or Comic Vine for a comic series, and add films, shows and books to the catalog, add a comic series with all its issues, pick what a collected edition holds, add an item by hand, and open any item's page, locally. The nook lists your shelves and a shelf opens as a page of numbered works, and you can make a shelf; adding to one, moving things on it and marking them waits for the screens (the routes are built, see `docs/API.md`). Reads and copies have tables (see Data model) and a loader fills them from the fixtures, but no screens yet.

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
- Open Library needs no key, so book search works on a fresh clone. Three optional lines in `.env.example`, all empty: `OPENLIBRARY_BASE_URL` and `OPENLIBRARY_COVERS_BASE_URL` (empty means Open Library's own) and `OPENLIBRARY_CONTACT`, an email or URL that goes into the `User-Agent` (`Fluxnook/<version> (<contact, else the repo URL>)`) and nowhere else. `npm run openlibrary:stub -- --port 4011` serves the recordings in `tests/fixtures/openlibrary`, the ISBN redirect and a 1x1 jpg for every cover; point both URLs at `http://127.0.0.1:4011`. Playwright starts its own stub on 4011. Open Library allows 1 request a second anonymously and 3 with an identified `User-Agent`.
- Comic Vine needs a key: `COMICVINE_API_KEY`, from the API page of a Comic Vine account (https://comicvine.gamespot.com/api/). Empty, comic search answers "Comic search isn't set up on this nook yet" and every other page works. `COMICVINE_BASE_URL` (empty means Comic Vine's own) and `COMICVINE_CONTACT` (an email or URL for the `User-Agent`, `Fluxnook/<version> (<contact, else the repo URL>)`, and nowhere else) are optional. `npm run comicvine:stub -- --port 4012` serves the recordings in `tests/fixtures/comicvine` and a 1x1 jpg for every cover except one whose file name starts with `missing-`, which is a 404; `--dir <path>` serves a copy of the recordings instead. A volume whose issues have no recording is a 500 from the stub (the stub's terminal names the file), so an import of it answers 503, never an empty run. With `COMICVINE_API_KEY` set to any word, point `COMICVINE_BASE_URL` at `http://127.0.0.1:4012/api`. Playwright starts its own stub on 4012 and sets both. Comic Vine allows 200 requests per resource per hour and its terms are non-commercial.
- Tests and the Browse never need a TMDB key. `npm run tmdb:stub -- --port 4010` serves the recordings in `tests/fixtures/tmdb` and a 1x1 jpg for every poster. Point the app at it with `TMDB_BASE_URL=http://127.0.0.1:4010/3` and `TMDB_IMAGE_BASE_URL=http://127.0.0.1:4010/t/p` in `.env.local` (both optional; they default to TMDB's own). Playwright starts its own stub and sets these for the app it runs.

## Screens

Every screen sits behind sign-in; a signed-out visit to any of them goes to `/`. The header links Search and Nook; the footer carries TMDB's required attribution line and logo, and a line each crediting Open Library and Comic Vine.

- `/search`: type two or more characters, pick All, Films, TV, Books or Comics. The URL carries `q` and `type`. Each result says one of three things. In your catalog: Open goes to the item. Looks like one you have: Add opens a sheet with the provider's side and the catalog item's side; "Same" adds the provider's source and fills what the item lacks, "Different, add as new" makes a second item. New: Add imports it and goes to its page. With the box empty it lists the 12 newest catalog items.
  - Books asks only Open Library. All asks TMDB and Open Library side by side and groups the rows by provider; if one doesn't answer, its group says so and the other still shows. A book matches on title and author, never year, because Open Library's first-publish year is often wrong; the looks-like line shows the catalog's own year.
  - Comics asks only Comic Vine, and All asks all three, in the order Films and TV, Books, Comic series. Each row is a Comic Vine volume: cover, name, start year, a Series pill, "<publisher> · <n> issues". The status line is one of: In your catalog, with Open going to `/series/<id>`; "Looks like one you have: <label>, <n> issues added by hand" for a hand-entered run; "Looks like one you have: <n> collected editions added by hand" for hand-entered collected editions; or nothing.
  - Add on a comic row (looks-like or new) opens the import sheet: Comic Vine's side, a "What are these?" choice of Single issues or Collected editions (Collected is preselected when the name holds collection, omnibus, compendium, library or trade; it brings a Format select, Hardcover first), and then one of two shapes. On a looks-like row the sheet shows the catalog's side. Same attaches Comic Vine's series and issues to the hand-entered run, matching each issue to yours by number; Different makes a second run. On a new row a "Same as a run you added by hand?" select lists every hand-entered run (and, under Collected, every stem of collected editions), No first; Add imports with the pick or without. Either way you land on `/series/<id>`. A refusal (a run already attached to another volume, a run of the other form) shows in the sheet and writes nothing.
  - ISBN mode: when the box holds a valid ISBN-10 or ISBN-13 (hyphens and spaces allowed, check digit tested in the browser), the chips grey out and the page shows that one edition from Open Library: publisher, published, pages, both ISBNs, a Format select, and whether its work is in your catalog. "Add this edition" adds the work if it isn't there and the printing under it. A bad check digit shows "That isn't a valid ISBN." and sends nothing.
- `/items/<uuid>`: the item page. Cover, facts for its type, summary, release date at the precision held, sources as links, relations in both directions, and which of your shelves hold it. Books and comics also list their Editions. A comic's pill row links its series and prints Vol. <n>, its kind and #<n>; the Series fact reads "<name>, Vol. <n> · #<n> of <count>" with links to the previous and next numbered issue; a Collected in section lists the editions whose contents hold it, each as "<Format> · <year> · with <the rest of the contents>"; a comic's cover is captioned "Cover from Comic Vine" when Comic Vine is its source. On a collected comic the Editions row also prints "Contents: <line>" ("Nothing yet" when empty), a Comic Vine link when the edition has that source, and an Edit contents button (see the picker below). An unknown id is a 404 inside the app shell.
- The contents picker (Edit contents, on a collected comic's Editions row): a sheet titled "What does this <format> collect?" listing every comic in the catalog in groups by series text, one-shots and the rest last. The filter matches series text or title and keeps ticks you made under another filter; a line reads "Showing <n> of <total>" and the footer "<n> picked". The edition's current contents are ticked on open. Save contents replaces the edition's contents: a comic already held keeps its place in the printing, new ticks follow in list order, unticked ones go. Cancel writes nothing. The list is the whole catalog's comics, handed to the page when it renders.
- `/items/new`: add an item by hand, for what no provider knows. The fields follow the type.
- `/series/<uuid>`: a Comic Vine series that was imported. A Series pill, then "<years> · <publisher> · <n> issues" (the start year alone while the run has no end year, which is set only when Comic Vine's issue count matches what came in and the last cover date is before this year), the name, "Vol. <n>." and Comic Vine's one-line description when there are any, Publisher and Sources, and an Issues grid in cover-date order: cover, "#<n> · <month year>", the title linking to the item. The count is the catalog's, not Comic Vine's. An unknown id is a 404 inside the app shell. The series' own cover is stored and not shown. Under the grid, Collected in lists every edition whose contents hold an issue of this run, each as the title linking to its page and "<Format> · <year> · <contents>", the run's own issues as "#1 to #7" and the rest after ", and"; "Nothing collected yet." when none.
- `/nook`: "Your nook" and a line of totals ("3 shelves · 398 works on them"; with a work done, "· <n> done"). With no shelves the line is "No shelves yet. Make one and it stops being quiet." and there are no cards. Each shelf is a card linking to `/shelves/<uuid>`: its name, its counts ("326 works · 14 sections", "· from Letterboxd" when the shelf has a source link), the description clamped to two lines, and a strip of the first five covers (a dashed box where there is none) with "+<n>" for the rest. Cards run newest change first (`updated_at`, then `created_at`, then name), two across at desktop width. New shelf opens a sheet with a name and a description; Make shelf lands on the new shelf's page. A blank name shows "Give the shelf a name." and stays on the sheet.
- `/shelves/<uuid>`: a shelf you own. A Shelf pill and its counts, the name, the description as written (blank lines kept), then the works. Works above the first section come first, with a dim line under them when a section follows; then each section, its name with its own counts. Each row is its number, the cover, the title linking to the item, a type pill and a second line by type: film "1976 · 98 min" (the year alone when no runtime is known), show "2008 · 5 seasons", book "1974 · Novel · Stephen King", comic "1984 · <series text> · #1". The number is the shelf's, counted through the sections, so the second section starts where the first ended. A skipped work is struck through and dimmed. The page renders every row at once; the 326-row TMNT shelf is one request. Another person's shelf, an unknown id and a non-uuid are a 404 inside the app shell. There is no button on the page yet: its writes, the drag and the status control come with the page's writes, and the doors from the item and series pages after that.

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
| `npm run comicvine:stub -- [--port 4012] [--dir <path>]` | The Comic Vine stand-in described under Run it locally. `--dir` serves a copy of the recordings. Ctrl+C stops it |
| `npm run comicvine:record -- <target>...` | Rewrites recordings in `tests/fixtures/comicvine` from the real API, reading `COMICVINE_API_KEY` from `.env.local`; the key is blanked out of every file. Targets are `search:<query>`, `volume/<id>`, `issues/<id>` (every page, one file per offset). It waits a second between calls. The recordings were made with `"search:teenage mutant ninja turtles" "search:ultimate collection" "search:teenage mutant ninja turtles ultimate collection" volume/20281 volume/50804 volume/18790 volume/18785 issues/20281 issues/50804` |
| `npm run openlibrary:stub -- [--port 4011]` | The Open Library stand-in described under Run it locally. Ctrl+C stops it |
| `npm run openlibrary:record -- <path>...` | Rewrites recordings in `tests/fixtures/openlibrary` from the real API, no key needed. Paths are `search:<query>`, `works/<id>`, `authors/<id>`, `isbn/<isbn>` (a 10 or a 13; one that fails its check digit is refused). The recordings were made with `search:carrie "search:night shift" works/OL81626W works/OL81608W works/OL81613W authors/OL19981A isbn/9780307743664 isbn/9781501142970` |
| `bash scripts/browse/<vol>.<n>.<s>.sh` | A Signature's Browse, in Git Bash from a clean tree with the stack up and the dev server stopped: it resets the database, prints each check as expected, actual and pass or fail, waits at each step for your hands, and writes `test-results/browse-<vol>.<n>.<s>.txt`. `BROWSE_EMAIL` names the address to sign in with. See `scripts/browse/README.md` |
| `npm run check` | The six gates CI runs, in order, stopping at the first red: lint, typecheck, test, db:check, test:db, test:e2e. Needs the stack up |
| `npm run db:generate -- --name=<change>` | drizzle-kit writes a migration into `supabase/migrations`. Read `.claude/skills/migrations/SKILL.md` first |

## CI

Every PR into `dev` or `main`, and every push to `dev`, runs workflow `CI` (`.github/workflows/ci.yml`). It has six jobs, named as their npm scripts: `lint`, `typecheck`, `test`, `db:check`, `test:db`, `test:e2e`. `test:db` and `test:e2e` each start their own Supabase stack in the runner, including Storage for the `covers` bucket. `test:e2e` builds the app and runs it with `next start` on Chromium only. No secrets are used: `.env.example` is copied to `.env.local`, and `SUPABASE_SECRET_KEY` is filled from the key that stack prints. CI holds no TMDB or Comic Vine key: the tests run on the stubs, and the one test that calls each real keyed provider skips without its key. Open Library needs none; all three stubs start in Playwright's global setup.

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

All of these read as empty when absent. A shelf has `entries` or `sections` (`{ name, entries }`, positions restarting in each in the file; the loader numbers them 1 to n across the whole shelf), never both; its `url` is optional, and the Mirage shelf has none because the sheet is private. A work has one year, the one its note gives; a second year for the same title stops the build.

Owned via: an issue listed in an edition's `contents` is owned through the copy of that edition. That is never written as `contained-in`, which is for a backup inside its host. Read is an occurrence and is never derived from a copy.

`npm test` goes red when a fixture disagrees with the shape or with a fresh build of its raw file (`tests/unit/fixtures.test.ts`). The same file checks every fixture together: no id is defined in two files, and every relation endpoint, shelf entry (flat or in a section) and gap names an item in some file, every edition content, copy and occurrence resolves, and no edition id is defined twice. The shape alone can't see across files. The fresh build goes to `node_modules/.cache/fixtures`; no test writes to the repo.

The build stops, naming the raw file and record, when an export changed shape: different headers, a non-empty `Tags`, a URL that isn't `https://boxd.it/<key>`, a Year or Position that isn't a whole number, a film listed twice with different data, or a list with no films. The Mirage build stops, naming the fixture, raw file and record, on a section header it has no rule for (or one repeated in a volume), a row its section's rule can't read, an `Owned` and `Format` that disagree, or an id that repeats outside Supplemental/Crossover. A date with no year does not stop it; that is a gap. The books build also stops, naming the fixture, raw file, record and note line, on a note line it can't read, a story with no collection, two lines that disagree about one work or its year, a line repeated within one note, or a shelf work no first note line names. No fixture is written until every fixture has built, and two `SOURCES` lines with one `out` stop the build. It never drops a row quietly. A hand-edited raw file shows up as a red byte compare, not as a fix.

Adding a raw file: put it under `supabase/seed/raw/<source>/`, add its row to `supabase/seed/raw/README.md`, add a `SOURCES` line in `scripts/fixtures-build.mjs` per fixture (a raw file may feed more than one; builders live in `scripts/fixtures/<name>.mjs`, and a new source needs its own; each `out` must be new), run `npm run fixtures:build`, and commit the raw file and its JSON together. From a Google Sheet, export one tab per file (File > Download > Comma-separated values) under `google-sheets/`; a new tab needs its own section rules. The CSV reader is `scripts/fixtures/csv.mjs`, written in-repo; no package was added.

## Data model

`src/db/schema.ts` holds 22 tables in `public`, in two halves. The item page reads the catalog and the signed-in user's shelf entries; the nook and the shelf page read shelves, sections and entries; nothing else reads the content half yet.

- The catalog, shared by every user, no `visibility`: `items` (a `film`, `tv`, `book` or `comic`; `form` is null for films and shows and required for books and comics; `summary` and `cover_path` are shared by every type), `item_films` (runtime, original title), `item_tv` (seasons, episodes, original title, first and last aired, ended), `item_books`, `item_comics`, `item_sources`, `item_relations`, `editions`, `edition_sources`, `edition_contents`, `franchises`, `franchise_sources`, `item_franchises`, `series`, `series_sources`. A `series` is a comic run (name, volume, years, publisher, kind, summary, cover) and `item_comics.series_id` points at it, nullable, restrict on delete; the `series` text column stays. `POST /api/v1/series/import` writes a `series` row, its `series_sources` row, and every issue as a comic with `series_id` set (see `docs/API.md`). A Comic Vine key is `volume/<id>` on `series_sources`. An item's identity is its `item_sources` row, `(source, key)`: the fixtures' `letterboxd:20ZQ` is source `letterboxd`, key `20ZQ`, and `manual` is a source like any other. A TMDB key carries the kind, `movie/603` or `tv/1396`, because the ids collide; an item added by hand has its own uuid as its `manual` key and its `created_by` set (loader rows have it null). Open Library keys are `works/OL…W` on an item and `books/OL…M` on an edition. An ISBN is an `edition_sources` row with source `isbn` and the ISBN-13 as its key, so it is unique across the catalog. `editions` carries a nullable `publisher` and `pages` (above 0); the loader leaves both null. Dates are `released_on` plus `released_precision` (`day`, `month`, `year`), both null or both set.
- A person's content: `shelves`, `shelf_sections`, `shelf_entries`, `occurrences` (a read or watch, with half-step `stars`), `journal_entries`, `copies`. Everything here points at the catalog and never the other way round.
- `profiles` is an account table: no `visibility`, no `updated_at`.

Visibility is `private`, `unlisted` or `public`, default `private`, on `shelves`, `shelf_entries`, `occurrences`, `journal_entries` and `copies`. `shelf_sections` has none; the shelf's is the section's. `owner` is on `shelves`, `occurrences` and `copies` only: the rest reach their owner through their parent. Nothing enforces that a child is no more visible than its parent yet.

Deletes: removing a `profiles` row removes everything that person owns and leaves the catalog alone. A catalog row can't be deleted while a shelf entry or occurrence points at its item, or a copy at its edition. Deleting a shelf deletes its sections and entries. Deleting a shelf section row deletes its entries too, in the database; the section route moves them above the first section first, so through the API no work goes with a section.

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

- `src/app`: the sign-in page at `/`, the signed-in pages under the `(app)` route group (`/nook`, `/shelves/<uuid>`, `/search`, `/items/<uuid>`, `/items/new`, `/series/<uuid>`; its layout holds the sign-in guard, header and footer), and the API route handlers under `src/app/api/v1`
- `src/components/shell`: the header and footer. `src/components/ui`: shadcn components
- `src/lib`: env reader (`readEnv` for the public settings, `readServerEnv` for the server-only ones), Supabase server client and session refresh, the API error helper
- `src/lib/providers/tmdb.ts`: the TMDB client. `src/lib/catalog`: title matching, import, manual entry and the item page's reads. `src/lib/covers.ts`: the Storage client for the `covers` bucket, server-only
- `src/lib/providers/openlibrary.ts`: the Open Library client; `src/lib/providers/errors.ts`: the `ProviderError` both clients throw. `src/lib/isbn.ts`: ISBN normalizing and the check digit, used by the browser and the routes. `src/lib/catalog/editions.ts`: edition import
- `src/lib/providers/comicvine.ts`: the Comic Vine client, which also throws `ProviderNotConfigured` and `ProviderBusy`. `src/lib/catalog/match.ts` holds `seriesStatuses` and `sameSeries`, the series rule, and `seriesGroups`, the hand-entered runs the import sheet lists. `src/lib/catalog/series.ts` is the series import (create and attach); `src/lib/catalog/series-page.ts` reads the series page. `src/lib/catalog/contents-line.ts` prints an edition's contents as words (no database import, so the picker uses it too); `src/lib/catalog/contents.ts` is the contents write behind `PUT /api/v1/editions/<id>/contents`
- `src/lib/shelves`: the shelf lib. `order.ts` is the only place a position is computed (pure, no database import); `write.ts` is the transaction every shelf write runs in (lock the shelf, write, renumber, touch `updated_at`); `shelves.ts`, `sections.ts` and `entries.ts` are the writes behind the routes under `src/app/api/v1/shelves`, which share `respond.ts`; `nook-page.ts` and `shelf-page.ts` are the two pages' reads; `lines.ts` prints the counts lines. `src/lib/catalog/work-line.ts` is the one formatter for a work's second line (no database import)
- `tests/stub/tmdb.ts`, `tests/fixtures/tmdb`: the TMDB stub and the recordings it serves. `tests/stub/openlibrary.ts`, `tests/fixtures/openlibrary` and `tests/stub/comicvine.ts`, `tests/fixtures/comicvine`: the same for Open Library and Comic Vine
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
- `scripts/browse`: one script per Signature that prints each Browse check as expected, actual and pass or fail. See its README
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
