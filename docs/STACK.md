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

## devDependencies

| Package | Version | Why |
|---|---|---|
| typescript | 5.9.3 | 7.x has no JS compiler API, so Next's editor plugin won't load |
| @types/node | 22.20.5 | Matches the Node 22 runtime |
| @types/react, @types/react-dom | 19.3.0 | Types for React 19 |
| tailwindcss | 4.3.3 | Styling |
| @tailwindcss/turbopack | 4.3.3 | Tailwind's loader for Turbopack; Next 16.4 has no PostCSS config |
| @biomejs/biome | 2.5.15 | Lint and format, one tool (`npm run lint`) |
