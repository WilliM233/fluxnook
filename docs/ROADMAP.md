# Fluxnook Roadmap

Standing doc for the product-owner seat; the repo copy mirrors the project copy. Volumes are milestones, chapters are runs the dev team lands one at a time. A chapter opens only when its plan is written and approved. Edit this file when a call changes; add a History line.


## What Fluxnook is

A hosted media nook: collect films, TV, books, comics, games (more later) in one place, organize them into shelves, log each read or watch with a quick star rating and a journal entry, and track the physical library alongside. Letterboxd plus Goodreads plus the collector's spreadsheet, with a journal in place of the critic's review. Sharing comes after the single-player product is something you would miss.

## Principles

- Complete product at every milestone, then enhance. No goliath out of the gate.
- Data model before stack. The relational design is the consequential decision; everything else is replaceable.
- Private by default. Visibility is a column from the first migration; the social layer is built on it later, never bolted on.
- Journal, not review. Entries are many, dated, anchored to a specific read or watch. Stars are a quick note of how it felt, not a verdict.
- Collection is first-class. Owning a copy is a different fact from having read the item.
- Providers do the typing. Manual entry exists as the fallback, never the main path.
- The app helps curate, the user controls the list. Suggestions are offered, never forced.

## Stack (lock exact versions in Volume 0)

- Next.js + TypeScript, single app, no monorepo until a second client exists
- API surface: Zod-validated route handlers under /api/v1; no server actions for mutations, so a native client is a drop-in later
- Postgres on Supabase; Supabase CLI for local (Docker), Supabase cloud for hosting. Same shape both places
- Drizzle ORM (plain SQL migrations, readable in review). RLS off; authorization lives in the API layer
- Supabase Auth (email + magic link; OAuth is 1.0+). Custom auth ruled out
- Supabase Storage for cover cache and photos of owned copies
- Tailwind + shadcn/ui, Vitest + Playwright, Biome
- Android: PWA then Trusted Web Activity for the Play Store. Capacitor only if a native plugin earns it
- Hosting: Vercel + Supabase cloud, free tiers until it matters. Background jobs deferred; provider sync is on demand

## Vocabulary and seats

See docs/HOUSE-RULES.md. Volume = milestone, Chapter = run, Plan = docs/plans/<vol>.<n>-<slug>.md. Seats: the Nookkeeper (PO), the Cartographer (architect), the Binder (developer, Claude Code main), the Raccoon (QA), the Scribe (docs), and L. Five agents is the ceiling; subagents run one at a time

## Core model (shape only; the Volume 1 schema chapter decides columns)

- Media item: type-agnostic core (title, type, release date, franchise refs, provider ids) plus type-specific metadata. Relations between items: adaptation-of, contained-in (a story inside an issue, an episode inside a season)
- Edition: child of a media item (a printing, a cut, a platform release). For comics, an edition has contents: the issues it collects
- Shelf: ordered list with one level of sections. Entries point at media items; each entry carries a status (unmarked, done, skipped) so skipped stays visible
- Occurrence: one read, watch or play of an item, with dates, status, star rating. Journal entries hang off occurrences and carry an optional progress anchor (page, episode, issue, chapter) so an entry can say where in the work it was written. Read and watched are computed from occurrences, never from the collection
- Copy: an owned thing. Points at an edition, carries format, condition, acquired date, note. Ownership of an issue is derived through the copy's edition contents and shown as "owned via <copy>"; the note field covers edge cases
- Shopping view: items on my shelves with no copy. Derived, not stored. "Wishlist" is not a word in the product
- Franchise: entity seeded by providers (TMDB collections, IGDB franchises, Metron series). Stored from Volume 1, surfaced as suggestions in 1.0+
- Visibility: on every table that holds user content (shelves, entries, occurrences, journal entries, copies) from the first migration. Account tables such as profiles don't carry it. Private by default

## Volumes

### Volume 0: Foundations
Exit: a user exists, logs in locally, sees an empty nook. The team can run a chapter end to end.
- Ch 1: Repo reset, House Rules, CLAUDE.md, the agent briefs, plan template, PR and issue templates
- Ch 2: Scaffold the stack, Supabase local, auth, the empty nook page
- Ch 3: CI, test harness, seed fixtures (the King path, the TMNT Mirage tab) as test data the later chapters are accepted against

### Volume 1: Alpha
A usable app for one person. Exit: the King path lives in the app as a cross-media book-then-films shelf, the TMNT sheet is retired, L's physical library is tracked, and the sheet has stopped being opened.
- Ch 1: Schema and migrations for the whole core model above, including visibility, occurrences, copies and franchise, even where no UI exists yet
- Ch 2: Providers, film and TV: TMDB search and import into the local catalog, cover cache, the item page
- Ch 3: Providers, books: Open Library search and ISBN lookup. ISBN entry is the main path for matching the library
- Ch 4: Providers, comics: Metron search and import; edition contents where Metron has them, manual fill where it does not
- Ch 5: Shelves: create, sections, drag ordering, add from catalog, status per entry (unmarked, done, skipped), aggregate stars across the shelf
- Ch 6: Occurrences and journal: log a read or watch, stars, journal entries, item page history
- Ch 7: Collection: copies with edition and format, derived ownership via contents, the shopping view
- Manual item entry is a fallback form that ships with Ch 2, not its own chapter

### Volume 2: Beta
A few invited people, hosted. Exit: three people besides L keep a real shelf in it and nothing has lost data.
- Deploy to Vercel + Supabase cloud, invite-only signup, backups verified
- Visibility goes live: public profile, shelf shareable by link
- Responsive layout that is good on a phone; PWA installable
- Export (full account as JSON and CSV) and CSV import of a sheet
- Provider search refinement from real use; provider rate-limit and cache behavior hardened
- Games provider (IGDB) if a beta user needs it, else 1.0

### Volume 3: 1.0
Open signup, in the Play Store. Exit: a stranger signs up, brings their history, builds a shelf, shares it.
- Open registration
- Goodreads and Letterboxd export import
- Follow, comments on shelves, a feed of people you follow
- IGDB for games if not already landed
- TWA published to the Play Store
- Provider-derived edition contents wherever the data exists

### 1.0+ (named so they stay out of 1.0)
- Cross-media suggestions from the franchise entity
- Barcode scan while shopping (browser BarcodeDetector first)
- Shelf cloning across nooks
- Year-in-review stats, notifications, OAuth sign-in, background provider refresh
- Capacitor if a native plugin earns it; iPhone when there is one to test on
- Deeper section nesting on shelves if one level proves short

## Calls made (with reason)

- 2026-10-16 Fully hosted long term, like the competitors; nothing to self-install. Social can come late
- 2026-10-16 Journal over review; stars are a quick note, not a verdict
- 2026-10-16 Collection is core; shopping view is derived from shelves minus copies
- 2026-10-16 Edition is a child of the item; read/watched tracks the item, ownership tracks the copy
- 2026-10-16 Ownership of collected issues is derived through edition contents and labelled "owned via", with a note field for edge cases
- 2026-10-16 Providers are in alpha for every type alpha needs (TMDB, Open Library, Metron); manual entry is a fallback form only
- 2026-10-16 Social stays out of alpha and beta entirely; visibility columns ship in the first migration
- 2026-10-16 Half stars allowed; stars live on the occurrence
- 2026-10-16 Seat names confirmed: Nookkeeper, Cartographer, Binder, Raccoon, Scribe
- 2026-10-16 Semver: v0.<vol>.0 at Volume close, v0.<vol>.0-ch.<n> per chapter on dev, patch for hotfixes
- 2026-10-16 Supabase Data API is off for the public schema (config.toml `[api] schemas` without public, and `auto_expose_new_tables = false` so GraphQL can't reach it either). The server is the only database client; the browser holds the publishable key for auth only. Found by the Cartographer in Ch 0.2: with RLS off, an exposed schema is readable and writable by anyone with that key
- 2026-10-16 Visibility is a column on content tables (shelves, entries, occurrences, journal entries, copies), not on account tables such as profiles
- 2026-10-16 Android is PWA then TWA, not Capacitor, unless a native plugin earns it
- 2026-10-16 Occurrences and journal entries hang off the media item, never off the owned copy. The March 2026 attempt hung reviews and logs off CollectionItem, which made it impossible to log a watch of something you don't own; that is the reason the model split
- 2026-10-16 Journal entries carry a progress anchor. Kept from the March 2026 ReadLog (ending page per session), generalized to page, episode, issue or chapter
- 2026-10-16 Two branches, dev and main, both protected, nothing pushed directly. A test branch only when a test environment exists that PR previews don't cover
- 2026-10-16 Every PR is read by L and the Nookkeeper and merged by hand by L; every chapter has a Browse line L runs before sign-off

## Open calls

- Comic Vine vs Metron for comics (lean Metron: free, models trades and their contents; verify coverage of Mirage-era TMNT in the Ch 4 feasibility read)

## Deferrals

- Books-to-films adaptation data: no provider links them. Manual adaptation-of links in alpha; Wikidata "based on" explored at 1.0+
- Comics backup stories and anthology appearances: manual contained-in links; no provider is clean here

## History

- 2026-10-16 Created. Phases, milestone definitions, core model shape, stack, calls and deferrals from the restart session.
- 2026-10-16 Ch 0.2 Afterword: visibility line matches CLAUDE.md; Data API call names both settings
- 2026-10-16 Ch 0.2 plan review: Data API call and the visibility scope call
- 2026-10-16 After reading the March 2026 repo: added the progress anchor, the occurrence-off-item call, the git and review calls, the Scribe seat. Ch 1 scope widened to the repo reset
