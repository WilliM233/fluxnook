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
| `npm test` | Vitest, `tests/unit` |
| `npm run test:e2e` | Playwright, Chromium, `tests/e2e`. Run `npx playwright install chromium` once first. Needs the Supabase stack up; starts `npm run dev` or reuses one on :3000. One test turns `pg_graphql` on in the local database and off again |
| `npm run db:generate -- --name=<change>` | drizzle-kit writes a migration into `supabase/migrations`. Read `.claude/skills/migrations/SKILL.md` first |

## Where things are

- `src/app`: the pages (`/`, `/nook`) and the API route handlers under `src/app/api/v1`
- `src/lib`: env reader, Supabase server client and session refresh, the API error helper
- `src/proxy.ts`: refreshes the session on every request except Next's assets and image files
- `src/db/schema.ts`: Drizzle table definitions
- `supabase/`: local stack config and migrations
- `tests/unit`, `tests/e2e`: Vitest and Playwright

## Docs

- `docs/ROADMAP.md`: what Fluxnook is, the principles, the Volumes
- `docs/HOUSE-RULES.md`: how a chapter gets built
- `docs/STACK.md`: every pinned version and why it's there
- `docs/API.md`: the `/api/v1` routes
- `docs/releases/`: what each chapter changed; `CHANGELOG.md` lists them
- `docs/team/`: the seats
- `docs/plans/`: one plan per chapter

The Scribe owns this file from Volume 0 Chapter 2 onward.
