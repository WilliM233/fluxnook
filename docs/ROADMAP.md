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
Exit: a user exists, logs in locally, sees an empty nook. The team can run a chapter end to end, CI gates every PR, and the three fixtures validate in CI. Closed 2026-10-23, `v0.0.0`, PR #60.
- Ch 1: Repo reset, House Rules, CLAUDE.md, the agent briefs, plan template, PR and issue templates. Done, v0.0.0-ch.1
- Ch 2: Scaffold the stack, Supabase local, auth, the empty nook page. Done, v0.0.0-ch.2 (#50, PR #51)
- Ch 3: CI and the test harness: Actions on every PR, Supabase local in the runner, Playwright through the mail catcher, a signed-in test fixture, a database test, nightly full Playwright on dev. Done, v0.0.0-ch.3 (#52, PR #53)
- Ch 4: Fixtures, films: the fixture convention (raw export in, script, normalized JSON out, Zod shape checked in CI) built on the King Letterboxd list, the flattest of the three inputs. Done, v0.0.0-ch.4 (#54, PR #55)
- Ch 5: Fixtures, books: the King works from the list's descriptions, in publication order, with adaptation-of and contained-in (story inside Night Shift) relations. Done, v0.0.0-ch.5 (#56, PR #57)
- Ch 6: Fixtures, comics: the TMNT Mirage tab as series, issues, collected editions with contents, owned-via and read flags. Done, v0.0.0-ch.6 (#58, PR #59)
- Fixtures are data files until Volume 1 Ch 1 adds the tables; loading them is an acceptance line of that chapter

### Volume 1: Alpha
A usable app for one person. Exit: the King path lives in the app as a cross-media book-then-films shelf, the TMNT sheet is retired, L's physical library is tracked, and the sheet has stopped being opened.
- Ch 1: Schema and migrations for the whole core model above, including visibility, occurrences, copies and franchise, even where no UI exists yet. Loads the Volume 0 fixtures. Done, v0.1.0-ch.1 (#61, PR #62); plan at docs/plans/1.1-schema.md
- Ch 2: Providers, film and TV: TMDB search and import into the local catalog, cover cache, the item page. Done, v0.1.0-ch.2 (#63, PR #64); plan at docs/plans/1.2-providers-film-tv.md, design at https://claude.ai/artifact/Kz18YNtugryAE1SEzNXiLp
- Ch 3: Providers, books: Open Library search and ISBN lookup. ISBN entry is the main path for matching the library. Done, v0.1.0-ch.3 (#65, PR #66); plan at docs/plans/1.3-providers-books.md, design at https://claude.ai/artifact/CPehVxMcpMH21hfELe4xG8 (exports in docs/designs/1.3/), the Deep Field design system at https://claude.ai/artifact/BFgHbCApeRScHbeeusWdxq (docs/designs/deep-field/)
- Ch 4: Providers, comics: Metron search and import; edition contents where Metron has them, manual fill where it does not. Next
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

- 2026-10-29 A book's `summary` is Open Library's blurb, not its wiki: the description cut at its first horizontal rule, markdown links unwrapped to their text, emphasis stripped, and a link whose text is only "source" dropped with its parentheses (the Browse showed Carrie's ending "(source)"). Nothing else is touched; a wrong blurb is the item-edit Deferral's (Ch 1.3 Q1, Browse)
- 2026-10-29 An Open Library call waits 20 s, not 10: the ISBN path is three calls in a row and a slow afternoon at Open Library tripped 10 s once in the Browse. A retry before the 503 is a Deferral (Ch 1.3 Browse)
- 2026-10-28 The Open Library work is the item: `item_sources (openlibrary, works/OL…W)`. An ISBN resolves to an edition and its work; the work becomes the item and the edition an `editions` row with `edition_sources (openlibrary, books/OL…M)` and `(isbn, <13 digits>)`, the first provider-written editions (Ch 1.3)
- 2026-10-28 Books match on folded title and folded author, not year: Open Library's `first_publish_year` is unreliable (Night Shift 1960, 'Salem's Lot 1959), so for type `book` the attach rule is same type, same normalized title, and the catalog's author folded equal to any of the result's author names; the year is shown on the sheet and never gates. Films and TV keep the 2026-10-24 rule (Ch 1.3)
- 2026-10-28 Open Library doesn't know a novel from a collection: a new book imports with `form` `novel`; an attach keeps the held form (Night Shift stays a collection). The first wrong form is the trigger for the item-edit Deferral (Ch 1.3)
- 2026-10-28 `author` stays text: Open Library's author names deduped and joined with ", " (it lists King twice on 'Salem's Lot). An author entity waits for a page that reads one (Ch 1.3)
- 2026-10-28 `/search` gains a Books chip, and All fans out to TMDB and Open Library in parallel, rows grouped by provider (films and TV first, then books, each in its provider's order); a provider failing leaves a one-line note in its group and the other still shows. Open Library has its own route under `/api/v1/providers/openlibrary/` (Ch 1.3)
- 2026-10-28 ISBN entry is the one search box: ten or thirteen digits with hyphens, spaces or a trailing X and a valid check digit switch the box into ISBN mode, one card for the edition over the work's catalog status, Add importing both through the same match sheet. A bad check digit is caught in the browser; Open Library is never asked. No scanner this chapter (Ch 1.3)
- 2026-10-28 `editions` gains `publisher text null` and `pages int null`; the ISBN lives in `edition_sources` as source `isbn` with the 13-digit form as key (a 10 converts). `format` is not null and Open Library's `physical_format` is null more often than not, so the ISBN card carries a Format select preselected from Open Library's word (paperback, hardcover, ebook, audiobook), Paperback when it has none (Ch 1.3)
- 2026-10-28 Book covers go in the same `covers` bucket at `openlibrary/<cover id>.jpg`, the work's cover on the item. An edition cover column waits for the collection chapter, where the cover you own matters (Deferral) (Ch 1.3)
- 2026-10-28 Open Library keys are canonical `works/OL…W` and `books/OL…M`, source `openlibrary`. No key: `OPENLIBRARY_BASE_URL` and `OPENLIBRARY_COVERS_BASE_URL` are the stub seams, `OPENLIBRARY_CONTACT` is optional and only fills the User-Agent they ask for (3 req/s identified, 1 anonymous). The footer says "Book data from Open Library" (Ch 1.3)
- 2026-10-28 The item page grows an Editions section for books (format, publisher, year, pages, ISBN, source link); nothing else on it moves (Ch 1.3)
- 2026-10-24 The attach rule is the server's: an attach target has the same type, the same normalized title and a year within 1 of the TMDB result, or the import is 409; the match sheet only shows the rule (Ch 1.2 S1)
- 2026-10-24 A finer date for the same year refines a coarser one on attach; a date from a different year never replaces a held one, and a held title or summary is never replaced (Ch 1.2 Q2)
- 2026-10-24 TMDB keys are stored canonical, `movie/<int>` and `tv/<int>`: `movie/0133805` is `movie/133805`, so one id is one item (Ch 1.2 B1)
- 2026-10-24 Secrets stay out of the repo, local defaults included: `.env.example` carries empty slots, CI fills them from the tool that owns them (Ch 1.2 D1)
- 2026-10-24 Search is its own page (`/search`), TMDB only until the next providers land; an empty query lists the catalog's recent items. The nook stays empty until shelves (Ch 1.2)
- 2026-10-24 Import attaches to a likely match instead of making a second item: a result whose type, normalized title and year (within 1) match a catalog item with no TMDB source shows a sheet, and the person says same or different. Reconciliation of the Letterboxd rows happens here, as the 2026-10-22 call parked it (Ch 1.2)
- 2026-10-24 The TMDB token is server-only; tests run on recorded responses through a `TMDB_BASE_URL` stub, and one live test runs only when the key is present. CI never holds a provider secret (Ch 1.2)
- 2026-10-24 TV is item type `tv` with `item_tv` (seasons, episodes, air dates, ended); films get `item_films` (runtime, original title). `summary` and `cover_path` are shared, so they live on `items` (Ch 1.2)
- 2026-10-24 TMDB source keys carry the kind (`movie/603`, `tv/1396`) because the ids collide; TMDB collections become franchises on import (Ch 1.2)
- 2026-10-24 Posters are cached at w500 in a public Storage bucket `covers`, written by the server with a server-only key; a poster failure never fails an import (Ch 1.2)
- 2026-10-24 The item page shows relations in both directions and the signed-in user's shelves from its first version; later chapters add their sections to it rather than making new pages (Ch 1.2)
- 2026-10-24 A manual item's source key is its own uuid; `created_by` is the person who added it (Ch 1.2)
- 2026-10-24 The look is Deep Field: near-black violet ground, one lavender accent, Fraunces for titles, Inter for text; covers carry the warmth. Tokens are CSS variables so a theme setting can offer Nebula and Dusk later (Deferral). Chosen on the Ch 1.2 palette board (Ch 1.2)
- 2026-10-23 Type-specific columns are child tables (`item_books`, `item_comics`), not jsonb: a handful of real columns per type, all sorted and filtered on, and plain SQL reads better in review. A column two types share lives on `items` (`form`, checked per type). `item_films` waits for TMDB's first film column (Ch 1.1)
- 2026-10-23 Every enumeration is `text` with a check constraint, never a Postgres enum: adding a value is a readable constraint swap, and `ALTER TYPE` inside a transactional migration is a trap (Ch 1.1)
- 2026-10-23 The catalog (items, sources, relations, editions, franchises) is global and deduped by source; user content points at it. `item_sources (source, key)` is the identity table, and `manual` is a source like any provider, so the fixtures' `<source>:<key>` ids land there and a later TMDB import adds a row to the same item instead of a duplicate. Manual items carry `created_by` (Ch 1.1)
- 2026-10-23 Release dates are `released_on date` + `released_precision` (`day`, `month`, `year`), both null or both set; the fixtures' year and year-plus-month fit, and dates sort (Ch 1.1)
- 2026-10-23 The show is the item; season and episode are the journal anchor. Episodes as items wait for someone wanting to rate one. Comic `series` stays text until Metron (Ch 1.1)
- 2026-10-23 Relations carry no position until a feature reads one; the fixtures have none (Ch 1.1)
- 2026-10-23 Visibility is `private`, `unlisted`, `public`, default private, on shelves, entries, occurrences, journal entries and copies. Effective visibility (a child never more visible than its parent) is an API rule in Volume 2, not a constraint today (Ch 1.1)
- 2026-10-23 The journal anchor is `anchor_kind` (`page`, `chapter`, `episode`, `issue`) plus `anchor_value` text as shown; entries sort by date, never by anchor (Ch 1.1)
- 2026-10-23 Shelf entries are ordered by integer position, renumbered on move; unique (shelf, item); a section belongs to its shelf by a composite key. Lexorank only if Ch 5's drag earns it (Ch 1.1)
- 2026-10-23 One edition-format vocabulary across types (`floppy`, `tpb`, `hardcover`, `omnibus`, `paperback`, `ebook`, `audiobook`, `dvd`, `blu-ray`, `4k`, `digital`), narrowed per type at the API, not in the schema (Ch 1.1)
- 2026-10-23 No soft delete in alpha. A user's delete cascades to everything they own; a catalog row restricts while content points at it; an edition restricts while a copy exists (Ch 1.1)
- 2026-10-23 Occurrence status is `in_progress`, `done`, `abandoned`; dates nullable (the Mirage reads have none); stars `numeric(2,1)` in half steps. Journal entries are a table from this chapter with zero rows (Ch 1.1)
- 2026-10-23 The fixtures' leftovers: `source_note` is kept on items as provenance and a comic's `source_date` folds into it; a fixture shelf's `date` becomes its `created_at`; `gaps` are printed by the loader, never loaded (Ch 1.1)
- 2026-10-23 The loader (`fixtures:load --user`) is a script through the Drizzle runtime client, not `seed.sql`: the fixtures carry one user's shelves, copies and occurrences. Catalog rows upsert on their source key; content loads only into an empty user, `--replace` empties first (Ch 1.1)
- 2026-10-23 From Ch 1.2 on, a chapter that brings a screen gets its design made in the Nookkeeper's seat before the spec goes to the team, so the expectation is set up front
- 2026-10-23 A shelf's `url` is optional. The TMNT sheet is private and has no public link; the shape asks for a URL only where one exists (Ch 0.6 Q1)
- 2026-10-23 A backup's host resolves only to a listed Vol 1 Main issue named exactly `Teenage Mutant Ninja Turtles #<n>`; any other host cell becomes an anthology item even when it matches a listed row's title, so seven comics exist twice until Metron reconciles them in Volume 1 Ch 4. Cells are never read past their literal text (Ch 0.6 Q2)
- 2026-10-23 Comic forms use collectors' words: `issue` (single/floppy), `one-shot`, `backup` (a short printed inside another comic), `collected` (a trade, hardcover or omnibus as a work), `anthology` (a host book that isn't the run's own). Edition formats `floppy`, `tpb`, `hardcover`, `omnibus`. Series kinds `ongoing`, `micro-series`, `mini-series`, `crossover`, `tie-in`, `minor`. Story arcs and runs-by-creative-team wait for Metron
- 2026-10-23 A collected edition is a `collected` work with an edition (its printing) and contents on the edition; owning it is a copy of that edition. Ownership of the issues it collects is derived through contents ("owned via"), never written as contained-in. Narrative containment (a backup inside an issue) is contained-in; physical collection is edition contents. The TMNT Ultimate Collections are the first data under the rule
- 2026-10-23 A backup story is contained-in its host; a host the sheet doesn't list as an issue becomes an `anthology` item from the cell text, reprints included, until Metron can resolve printings (Volume 1 Ch 4)
- 2026-10-23 Read flags from a sheet are occurrences (`done`, no date), never a property of the copy or the shelf entry
- 2026-10-23 A tab of the TMNT sheet is a run, and a run is a shelf with the tab's sections; the hand-made tab is taken as it is, section rules declared per chapter, cells never corrected
- 2026-10-23 A work carries its original publication date; an edition carries its own (a book first published in 1892, the copy in hand from 1998). A fixture's `year` on a book is the work's year as the note gives it, and a second year for the same title stops the build; edition dates wait for editions (Volume 1 Ch 1) and provider dates (Ch 3). From the Ch 0.5 Raccoon's S2: without the rule a year typo silently forked a work into two shelf entries
- 2026-10-23 A short story is a `book` item with a `form` (novel, novella, collection, story, series), not its own type; Night Shift is a `collection` item its stories are contained-in. One type, form is metadata
- 2026-10-23 "Series: The Dark Tower (1981)" is a `book` with form `series` until the franchise entity exists in Volume 1; as-is rules out turning it into The Gunslinger
- 2026-10-23 Works with no provider get `manual:<slug>-<year>` ids; manual entry is the product's fallback path and that is what these are. Open Library ids arrive as providers in Volume 1 Ch 3, not as ids
- 2026-10-23 `author` on a book is derived from the note's prefix ("Bachman Novel" is Richard Bachman, everything else Stephen King); the one interpretation past the literal note, kept so the Bachman distinction survives
- 2026-10-23 Relations (adaptation-of, contained-in) are a top-level array in the fixture that produced them and may point across fixture files; the test checks ids across every file together
- 2026-10-23 The books fixture carries a publication-order shelf of the works (stories reached through their collection); the interleaved book-then-film King path waits for shelves with sections in Volume 1 Ch 5
- 2026-10-23 A film whose note names no work is recorded under `gaps` in the fixture, not filled in; The Long Walk is the one today
- 2026-10-23 Design calls for the fixture chapters are made on the data, not the GUI; L revisits them once there is a screen to look at
- 2026-10-22 `Closes #<issue>` in the PR, not `Refs`. The Afterword is the branch's last commit, so closing on merge is right and saves L a step; and only a closing keyword links the PR in the issue's Development panel, which `Refs` never does
- 2026-10-22 L bookends every chapter: opens the branch and makes the first commit (the spec), runs the Browse, checks CI, merges. The Binder opens the issue and keeps it as the chapter's log; the Nookkeeper reviews the plan and the handoff, not each step
- 2026-10-22 Fixtures are data files, not rows. No content table exists until Volume 1 Ch 1, so `supabase/seed/` holds normalized JSON with a Zod shape checked in CI, and the loader is a Volume 1 Ch 1 acceptance line. The shape gets fitted to real data before the schema is drawn, not after
- 2026-10-22 One fixture chapter per media type (films, books, comics): the types behave differently and each deserves its own attention. The convention lands with films, the flattest input; books adds the relations; comics adds editions and contents
- 2026-10-22 Raw exports are taken as they are: the Letterboxd King list (its four questionable years included) and the hand-collected TMNT sheet. Reconciliation waits for the provider import in Volume 1, which is where the data would get corrected anyway. The King list is the book list: every film's description names the work it adapts
- 2026-10-22 Only the King list CSV and the Mirage tab are committed. The rest of the Letterboxd export (diary, reviews, likes, other lists) stays out of the repo; Letterboxd import is a 1.0 feature and L can re-export then. The other TMNT tabs (Archie, IDW, Movies/TV) wait for their own chapters
- 2026-10-22 No `npm audit` gate in CI: the 11 advisories are all devDependencies and the offered fix downgrades shadcn. Re-check at the Volume 2 deploy chapter
- 2026-10-22 The Notion Library and Reading Log are not Volume 0 inputs; they are stale and the book side of the King path doesn't need them. Candidates for the Volume 2 CSV import
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

- 2026-10-29 Ch 1.3 closed, v0.1.0-ch.3 (#65, PR #66); Ch 1.4 is next. The second provider, the first provider-written editions; two calls added from the Afterword (the blurb rule, the 20 s timeout) and the census-at-census-commit and Browse-block rules to House Rules
- 2026-10-28 Ch 1.3 design talk: ten leans on the work-and-edition model, book matching, form, author, the fan-out, ISBN mode, edition columns, covers, keys and the item page, all taken; two Open Library findings (bad first-publish years, a loose ISBN endpoint) shaped them. The Deep Field design system made first, then four screens. Ch 1.3 spec written, docs/plans/1.3-providers-books.md; the Ch 1.2 Afterword addendum rides the same commit
- 2026-10-24 Ch 1.2 closed, v0.1.0-ch.2 (#63, PR #64); Ch 1.3 is next. The first screens and the first provider; four calls added from the Afterword (attach rule, date rule, canonical keys, secrets)
- 2026-10-24 Ch 1.2 design talk: nine leans on search, import, TV, covers and the item page; the design made first (five screens and a palette board), Deep Field chosen over Nebula and Dusk. Ch 1.2 spec written, docs/plans/1.2-providers-film-tv.md
- 2026-10-23 Ch 1.1 closed; Ch 1.2 is next. First Fable-QA chapter; the migration-fold and design-talk rules added from the Afterword.
- 2026-10-23 Ch 1.1 design talk: fifteen leans on the data model taken against the fixtures as they landed, four calls on their leftovers. Ch 1.1 spec written, docs/plans/1.1-schema.md; the first Fable-QA chapter
- 2026-10-23 Volume 0 closed: PR #60 `dev` to `main`, merge commit, `v0.0.0`, GitHub Release from the PR body. Six chapters, `v0.0.0-ch.1` to `ch.6`
- 2026-10-23 Ch 0.6 closed; Volume 0's exit is met (a user logs in and sees an empty nook, CI gates every PR, three fixtures validate in CI). Next: the `dev` to `main` close PR and `v0.0.0`, then Volume 1 Ch 1
- 2026-10-23 Ch 0.6 design talk: five calls on comic forms, the edition model, backups, read flags and runs. Ch 0.6 spec written, docs/plans/0.6-fixtures-comics.md; last chapter of Volume 0
- 2026-10-23 Ch 0.5 closed; Ch 0.6 is next. Edition-date call added from the Afterword
- 2026-10-23 Ch 0.5 design talk: eight calls on works, ids, relations and the books shelf; the fixture-order open call closed (films landed first). Ch 0.5 spec written, docs/plans/0.5-fixtures-books.md
- 2026-10-22 Ch 0.4 closed; Ch 0.5 is next. Item ids are `<source>:<key>` (`letterboxd:20ZQ`), which Ch 0.5, 0.6 and the Volume 1 loader inherit
- 2026-10-22 Ch 0.3 closed; Ch 0.4 is next. Two calls added from the Afterword
- 2026-10-22 Ch 0.3 design talk. Fixtures become data files and split into one chapter per media type (Ch 4 films, 5 books, 6 comics); Volume 0 exit widened; six calls added. Ch 0.3 spec written, docs/plans/0.3-ci-harness.md
- 2026-10-16 Created. Phases, milestone definitions, core model shape, stack, calls and deferrals from the restart session.
- 2026-10-16 Ch 0.2 closed; Ch 0.3 is next
- 2026-10-16 Ch 0.2 Afterword: visibility line matches CLAUDE.md; Data API call names both settings
- 2026-10-16 Ch 0.2 plan review: Data API call and the visibility scope call
- 2026-10-16 After reading the March 2026 repo: added the progress anchor, the occurrence-off-item call, the git and review calls, the Scribe seat. Ch 1 scope widened to the repo reset
