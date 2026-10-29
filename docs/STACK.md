# Stack

Every version in `package.json` is exact (`.npmrc` has `save-exact=true`). This file is the why. A package lands here in the same commit that installs it; a bump changes its row.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node | 22.15.0 (`.nvmrc`) | The runtime the versions below were pinned against; meets Next 16 (>=20.9). CI reads `.nvmrc` |
| Docker Desktop | any current | The Supabase CLI runs the local stack in containers. CI starts only the services the gates use (`.github/actions/stack`): the database, gotrue, kong, postgrest, mailpit and, from Ch 1.2, storage-api for the `covers` bucket |

Fonts are not packages: Fraunces (titles) and Inter (text) come through `next/font/google` and are fetched at build, replacing Geist (Ch 1.2). The TMDB logo in `public/tmdb` is TMDB's own file, source noted beside it.

Providers (no package for either; each client is a closure over `fetch` in `src/lib/providers/`):

| Provider | Key | Limit | Notes |
|---|---|---|---|
| TMDB | v4 read token, `TMDB_API_KEY` | not handled before Volume 2 | Films and TV |
| Open Library (Ch 1.3) | none | 1 request a second anonymous, 3 identified by `User-Agent` | Books. `User-Agent` is `Fluxnook/<package.json version> (<OPENLIBRARY_CONTACT, else the repo URL>)`. Redirects followed only under `OPENLIBRARY_BASE_URL`. Pacing is not handled; a 429 is the call's 503. Tests read recordings in `tests/fixtures/openlibrary` through a stub |

Scaffold only, not installed: `create-next-app@16.4.2` generated the Next.js files in Chapter 0.2.

## dependencies

| Package | Version | Why |
|---|---|---|
| next | 16.4.2 | The app: App Router pages and route handlers under `/api/v1` |
| react, react-dom | 19.3.1 | Next 16's peer |
| @base-ui/react | 1.9.0 | Primitives under shadcn's default style (`base-nova`) |
| class-variance-authority | 0.7.1 | shadcn component variants |
| cn | 0.5.0 | shadcn's class merger; replaces clsx and tailwind-merge |
| lucide-react | 1.58.0 | shadcn's default icon set |
| zod | 4.6.7 | Validation at the `/api/v1` edge, requests and responses |
| @supabase/supabase-js | 2.118.0 | Supabase Auth: magic links, sessions, `getUser()`. Its bundled Storage client writes covers to the `covers` bucket from `src/lib/covers.ts`, server-side with the secret key |
| @supabase/ssr | 0.12.7 | Supabase's cookie-session helper for the App Router: the server client and the session-refresh proxy |
| drizzle-orm | 0.45.4 | Table definitions in `src/db/schema.ts`; `drizzle-orm/supabase` for `auth.users`. 1.0 is still a release candidate |
| postgres | 3.4.9 | The driver under `drizzle-orm/postgres-js` in `src/db/client.ts`, the server's only database client; `tests/db` also use it directly. Over `pg`: no `@types` package, and it is the driver `drizzle-orm/postgres-js` takes |

## devDependencies

| Package | Version | Why |
|---|---|---|
| typescript | 5.9.3 | 7.x has no JS compiler API, so Next's editor plugin won't load |
| @types/node | 22.20.5 | Matches the Node 22 runtime |
| @types/react, @types/react-dom | 19.3.0 | Types for React 19 |
| tailwindcss | 4.3.3 | Styling |
| @tailwindcss/turbopack | 4.3.3 | Tailwind's loader for Turbopack; Next 16.4 has no PostCSS config |
| @biomejs/biome | 2.5.15 | Lint and format, one tool (`npm run lint`) |
| vitest | 5.0.5 | Unit tests (`npm test`) |
| vite | 8.3.4 | Vitest 5's required peer; listed so it is pinned |
| @playwright/test | 1.64.1 | Browser and request tests (`npm run test:e2e`); Chromium by default, all three browsers with `PLAYWRIGHT_ALL_BROWSERS=1` |
| supabase | 2.121.0 | The Supabase CLI, pinned per repo and run through `npx`; nothing to install globally |
| drizzle-kit | 0.31.11 | Generates SQL migrations into `supabase/migrations`; never applies them |
| tsx | 4.23.15 | Runs the TypeScript fixture loader (`npm run fixtures:load`) on Node 22.15, which strips types only behind an experimental flag and without tsconfig paths. Already in the tree under drizzle-kit; replaces nothing, since `scripts/` had no TypeScript before |
| shadcn | 4.22.0 | The component CLI, and `shadcn/tailwind.css`, which `globals.css` imports at build time; nothing of it ships |
| tw-animate-css | 1.4.0 | Animations; a build-time CSS import in `globals.css` for shadcn |

## GitHub Actions

Pinned to a commit SHA, not a tag: a tag can be moved after the fact, a commit can't. The tag rides in a comment beside each `uses:` so a reader knows what the SHA is.

| Action or runner | Version | SHA | Why |
|---|---|---|---|
| `ubuntu-24.04` | runner | | Named, not `ubuntu-latest`, so the image moves only when this row does. Has Docker for the Supabase stack |
| actions/checkout | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` | Checks out the repo in every job |
| actions/setup-node | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` | Node from `.nvmrc`, with npm's cache, in `.github/actions/install` |
| actions/cache | v6.1.0 | `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` | Playwright's browsers between runs, keyed on the browser and `package-lock.json` |
| actions/upload-artifact | v7.0.2 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | The Playwright HTML report when an e2e job fails |
