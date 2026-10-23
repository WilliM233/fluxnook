# Fluxnook

A cozy place to keep your shelves: films, TV, books, comics and games in one nook, organized the way you read and watch them, with a journal for each pass through and the physical collection tracked alongside.

Volume 0 is in progress. Today you can sign in with a magic link and see an empty nook, locally.

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
- `.env.example` holds the Supabase CLI's fixed local URL and publishable key. Without `.env.local`, the app throws naming the missing variable.

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
| `npm run check` | The six gates CI runs, in order, stopping at the first red: lint, typecheck, test, db:check, test:db, test:e2e. Needs the stack up |
| `npm run db:generate -- --name=<change>` | drizzle-kit writes a migration into `supabase/migrations`. Read `.claude/skills/migrations/SKILL.md` first |

## CI

Every PR into `dev` or `main`, and every push to `dev`, runs workflow `CI` (`.github/workflows/ci.yml`). It has six jobs, named as their npm scripts: `lint`, `typecheck`, `test`, `db:check`, `test:db`, `test:e2e`. `test:db` and `test:e2e` each start their own Supabase stack in the runner. `test:e2e` builds the app and runs it with `next start` on Chromium only. No secrets are used: `.env.example` is copied to `.env.local`.

`npm run check` runs the same six gates locally.

When a check is red:

- Open the job's log. The failing gate's own output is there.
- A red `test:e2e` also uploads a `playwright-report` artifact, with traces.
- A red `db:check` prints the SQL a migration would need, or drizzle-kit's error. A rename needs answering in a terminal: run `npm run db:generate -- --name=<what_changed>` and answer it.
- A job that fails while pulling Supabase images with `toomanyrequests` hit a registry rate limit, not your change. Re-run the job.

Workflow `Nightly` runs the whole Playwright suite on `dev` at 04:17 UTC, one job per browser (Chromium, Firefox, WebKit). Its browser install step is capped at 10 minutes. Start it by hand from the Actions tab or with `gh workflow run nightly.yml --ref dev`. It does not run on PRs.

Tests that sign in should import `test` and `expect` from `tests/e2e/harness/signed-in`. The session is on `page` and `page.request`; Playwright's built-in `request` is signed out.

## Fixtures

`supabase/seed` holds the acceptance data every later chapter is checked against. Today that is L's Stephen King watch list from Letterboxd, built into two files from the one raw CSV: `king-films.json` (61 films, one shelf) and `king-books.json` (27 book items, 78 relations, one shelf, one gap).

- `supabase/seed/raw/<source>/`: exports exactly as their source wrote them. Never edit one by hand. Each has a row in `supabase/seed/raw/README.md`.
- `supabase/seed/fixtures/<name>.json`: generated, committed, never edited. `npm run fixtures:build` writes it. A second run leaves `git status` clean.
- `src/fixtures/shape.ts`: the Zod shape of a fixture file. Item ids are `<source>:<key>`; the King films are `letterboxd:<boxd key>`. An item with no provider is `manual:<slug>-<year>` with `providers: {}` (`manual:salems-lot-1975`; apostrophes and accents are dropped from the slug).

Items are a `film` or a `book`. A book has an `author` and a `form`: `novel`, `novella`, `collection`, `story` or `series`. A short story is a book with form `story`; Night Shift is the `collection` its 16 stories are in. The King notes name the works; `scripts/fixtures/king-works.mjs` reads them out of the films' `source_note`s.

A file may also carry:

- `relations`: `{ type, from, to }`, `type` being `adaptation-of` (from the adaptation to its source) or `contained-in` (from the part to the whole). Either end may be an item in another file: `king-books.json` holds the relations, and its `adaptation-of` ones start in `king-films.json`.
- `gaps`: `{ item, reason }`, an item the raw file gave nothing to build from. Recorded, not filled in, and not a relation. Today: The Long Walk (`letterboxd:mic8`), "no source note".

Both read as empty when absent. A work has one year, the one its note gives; a second year for the same title stops the build.

`npm test` goes red when a fixture disagrees with the shape or with a fresh build of its raw file (`tests/unit/fixtures.test.ts`). The same file checks every fixture together: no id is defined in two files, and every relation endpoint, shelf entry and gap names an item in some file. The shape alone can't see across files. The fresh build goes to `node_modules/.cache/fixtures`; no test writes to the repo.

The build stops, naming the raw file and record, when an export changed shape: different headers, a non-empty `Tags`, a URL that isn't `https://boxd.it/<key>`, a Year or Position that isn't a whole number, a film listed twice with different data, or a list with no films. The books build also stops, naming the fixture, raw file, record and note line, on a note line it can't read, a story with no collection, two lines that disagree about one work or its year, a line repeated within one note, or a shelf work no first note line names. It never drops a row quietly. A hand-edited raw file shows up as a red byte compare, not as a fix.

Adding a raw file: put it under `supabase/seed/raw/<source>/`, add its row to `supabase/seed/raw/README.md`, add a `SOURCES` line in `scripts/fixtures-build.mjs` per fixture (a raw file may feed more than one; builders live in `scripts/fixtures/<name>.mjs`, and a new source needs its own), run `npm run fixtures:build`, and commit the raw file and its JSON together. The CSV reader is `scripts/fixtures/csv.mjs`, written in-repo; no package was added.

## Where things are

- `src/app`: the pages (`/`, `/nook`) and the API route handlers under `src/app/api/v1`
- `src/lib`: env reader, Supabase server client and session refresh, the API error helper
- `src/proxy.ts`: refreshes the session on every request except Next's assets and image files
- `src/db/schema.ts`: Drizzle table definitions
- `supabase/`: local stack config and migrations
- `supabase/seed`: raw exports and the fixtures built from them. See Fixtures
- `src/fixtures/shape.ts`: the Zod shape of a fixture file
- `tests/unit`, `tests/db`, `tests/e2e`: Vitest, Vitest against Postgres, and Playwright
- `tests/e2e/harness`: `signedIn`, a Playwright fixture that gives a spec a page signed in as a brand-new user. Its doc comment is the contract
- `scripts/db-check.mjs`: the script behind `npm run db:check`
- `scripts/fixtures-build.mjs`, `scripts/fixtures/`: the script behind `npm run fixtures:build`, its CSV reader, the Letterboxd list builder and the King works builder
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
