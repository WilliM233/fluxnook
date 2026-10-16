# Stack

Every version in `package.json` is exact (`.npmrc` has `save-exact=true`). This file is the why. A package lands here in the same commit that installs it; a bump changes its row.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node | 22.15.0 | The runtime the versions below were pinned against; meets Next 16 (>=20.9) |
| Docker Desktop | any current | The Supabase CLI runs the local stack in containers |

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
| @supabase/supabase-js | 2.118.0 | Supabase Auth: magic links, sessions, `getUser()` |
| @supabase/ssr | 0.12.7 | Supabase's cookie-session helper for the App Router: the server client and the session-refresh proxy |
| drizzle-orm | 0.45.4 | Table definitions in `src/db/schema.ts`; `drizzle-orm/supabase` for `auth.users`. 1.0 is still a release candidate |

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
| @playwright/test | 1.64.1 | Browser and request tests (`npm run test:e2e`); Chromium only for now |
| supabase | 2.121.0 | The Supabase CLI, pinned per repo and run through `npx`; nothing to install globally |
| drizzle-kit | 0.31.11 | Generates SQL migrations into `supabase/migrations`; never applies them |
| shadcn | 4.22.0 | The component CLI, and `shadcn/tailwind.css`, which `globals.css` imports at build time; nothing of it ships |
| tw-animate-css | 1.4.0 | Animations; a build-time CSS import in `globals.css` for shadcn |
