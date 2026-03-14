# FluxNook — Feature Specification

> **Working Title:** Project FluxNook
> **Stack:** Next.js · PostgreSQL · Prisma · TypeScript
> **Status:** M1 Foundation Complete
> **Last Updated:** March 14, 2026

---

## Vision

FluxNook is a personal media archival and collection tracker — a cozy corner for logging, reviewing, and studying physical media. Think Letterboxd meets Goodreads, purpose-built for someone who cares about the tangible artifact as much as the content itself.

The app starts as a single-user intranet tool and is architected to grow into a multi-user platform where collectors can share shelves, reviews, and discoveries with friends.

---

## Media Types

### Phase 1 (Core)
- **Movies** — Blu-ray, DVD, 4K UHD, VHS, LaserDisc, digital
- **Books** — Hardcover, paperback, mass market, special editions

### Phase 2 (Future Expansion)
- Music (vinyl, CD, cassette)
- Video games (physical media)
- Comics / graphic novels

---

## Feature Breakdown

### Milestone 1: Foundation ✅

The scaffolding. Nothing user-facing yet — just a solid base to build on.

| Feature | Description |
|---------|-------------|
| **Project scaffold** | Next.js app with TypeScript, ESLint, Prettier, and folder structure |
| **Database setup** | PostgreSQL connection via Prisma ORM (Docker Compose for dev) |
| **Schema design** | Initial data models for users, movies, books, collection items, reviews |
| **Environment config** | `.env.example` with all required variables documented, Zod validation at startup |
| **README** | Project overview, setup instructions, tech stack, contribution guide |
| **CI basics** | Linting, type checking, and Prisma validation on PRs (GitHub Actions) |

---

### Milestone 2: Core Logging

The heart of the app — adding media to your collection and writing about it.

#### Libraries & Organization

| Feature | Description |
|---------|-------------|
| **Libraries** | Each user has a master library per media type (Movie Library, Book Library). These are automatic — every item you add goes into the appropriate library. This is your complete collection. |
| **Shelves** | User-created sub-collections within a library for custom organization. Examples: "To Watch", "Favorites", "Vinegar Syndrome Collection", "Horror Shelf", "Currently Reading". An item can live on multiple shelves. |
| **Default shelves** | Auto-generated shelves per library: "Watched" / "Read", "Want to Watch" / "Want to Read", "Currently Watching" / "Currently Reading" |

#### Adding & Viewing

| Feature | Description |
|---------|-------------|
| **Add movie** | Search the shared movie catalog (or TMDB in M3) → add to your library with personal details (format, rating, review) |
| **Add book** | Search the shared book catalog (or Open Library in M3) → add to your library with personal details |
| **Manual entry fallback** | Form to manually enter media details when it doesn't exist in the catalog yet |
| **Library view** | Paginated, sortable view of your full library per media type |
| **Shelf view** | View contents of any individual shelf |
| **Detail view** | Individual page for each item showing catalog metadata + your personal data (rating, reviews, logs) |
| **Basic search** | Search your library by title, creator, year, or format |
| **Filter & sort** | Filter by format, rating, shelf, tags; sort by date added, date consumed, rating, title |

#### Rating & Reviews

| Feature | Description |
|---------|-------------|
| **Rating system** | Star rating (0.5–5 scale, half-star increments) |
| **Review/notes** | Free-text field for reviews, notes, and observations per entry |
| **Multiple reviews** | Support multiple dated reviews per item (for rewatches/rereads where your take evolves) |

#### Activity Tracking

| Feature | Description |
|---------|-------------|
| **Watch log** | Log each viewing of a movie with date, optional rating, and notes. Tracks first watch vs. rewatches. |
| **Read log** | Log reading sessions for a book: date, ending page number, optional notes. Builds a timeline of reading progress over time. |
| **Reading progress graph** | Visual graph of pages read over time per book — shows reading pace, breaks, and completion |
| **Rewatch/reread count** | Automatic count of how many times you've consumed an item based on log entries |
| **Activity timeline** | Chronological feed of all your logging activity across both libraries |

---

### Milestone 3: API Integrations

Auto-populate metadata so you're not hand-typing everything.

| Feature | Description |
|---------|-------------|
| **TMDB integration** | Search TMDB by title → auto-fill movie metadata (title, year, director, cast, genre, poster, synopsis) |
| **Open Library integration** | Search Open Library by title/ISBN → auto-fill book metadata (title, author, publisher, year, cover, description, page count) |
| **Search-then-add flow** | Unified "Add to collection" flow: search API → select result → confirm/edit details → save |
| **Poster/cover storage** | Download and store cover images locally rather than hotlinking |
| **Metadata refresh** | Ability to re-fetch metadata from API to update existing entries |

---

### Milestone 4: Collection Management

Organize and understand your collection at a deeper level.

| Feature | Description |
|---------|-------------|
| **Tags** | Flexible tagging system (e.g., "giallo", "Italian horror", "first editions", "signed copies") |
| **Physical media details** | Format, edition, condition, purchase date, purchase price, barcode/UPC |
| **Dashboard** | Stats overview: total items by library, items by format, recent activity, rating distribution, reading pace trends, rewatch frequency |
| **Advanced stats** | Average rating by genre, monthly consumption charts, format breakdown, longest reading streaks |
| **Export** | CSV/JSON export of full collection for backup |
| **Bulk actions** | Add multiple items to a shelf, bulk tag, bulk rate |

---

### Milestone 5: Multi-User & Social

Transform from personal tool to shared platform.

| Feature | Description |
|---------|-------------|
| **Authentication** | NextAuth.js with email/password and OAuth providers |
| **User profiles** | Public profile page showing collection stats, recent activity, and shelves |
| **Privacy controls** | Per-shelf and per-item visibility (public, friends-only, private) |
| **Friend system** | Follow/friend other users to see their activity |
| **Activity feed** | Timeline of friends' recent additions, reviews, and ratings |
| **Collection browsing** | Browse a friend's collection with their shelves and reviews |

---

### Future Roadmap (Beyond M5)

Ideas parked for later consideration.

| Feature | Description |
|---------|-------------|
| **Letterboxd import** | Parse Letterboxd CSV export to seed movie library |
| **Goodreads import** | Parse Goodreads CSV export to seed book library |
| **Barcode scanning** | Mobile-friendly barcode/UPC scanner for quick physical media entry |
| **Music & games** | Expand media types to vinyl/CD/cassette and physical video games |
| **Comics / graphic novels** | Dedicated media type with issue tracking |
| **Recommendations** | "Because you liked X" suggestions based on ratings and genres |
| **Public lists** | Curated, shareable lists (e.g., "Best Italian Horror of the 80s") |

---

## Data Model

### M1 Schema (Current)

```
User
├── id (uuid)
├── email (unique)
├── username (unique)
├── displayName (optional)
├── avatarUrl (optional)
├── birthday
├── createdAt
└── updatedAt

Movie
├── id (uuid)
├── title
├── originalTitle (optional)
├── year (optional)
├── director (optional)
├── runtime (optional, minutes)
├── synopsis (optional)
├── posterUrl (optional)
├── cast (json array, optional)
├── genres (json array, optional)
├── createdAt
└── updatedAt

Book
├── id (uuid)
├── openLibraryId (optional, unique)
├── isbn (optional, unique)
├── title
├── author (optional)
├── publisher (optional)
├── yearPublished (optional)
├── genres (json array, optional)
├── description (optional)
├── coverUrl (optional)
├── pageCount (optional)
├── createdAt
└── updatedAt

CollectionItem
├── id (uuid)
├── userId → User
├── movieId → Movie (nullable)
├── bookId → Book (nullable)
├── format (enum: MediaFormat)
├── condition (enum: ItemCondition)
├── edition (optional)
├── notes (optional)
├── createdAt
├── updatedAt
├── unique(userId, movieId)
└── unique(userId, bookId)

Review
├── id (uuid)
├── userId → User
├── collectionItemId → CollectionItem
├── rating (float, 0.5–5.0, optional)
├── reviewText (optional)
├── consumedDate (optional)
├── createdAt
└── updatedAt
```

### M2 Additions (Planned)

```
Library
├── id (uuid)
├── userId → User
├── mediaType (enum: movies, books)
├── createdAt
└── updatedAt

Shelf
├── id (uuid)
├── userId → User
├── libraryId → Library
├── name
├── description (optional)
├── isDefault (boolean)
├── visibility (enum: public, friends, private)
├── sortOrder (integer)
├── createdAt
└── updatedAt

ShelfItem (join table)
├── shelfId → Shelf
├── collectionItemId → CollectionItem
└── addedAt

WatchLog
├── id (uuid)
├── collectionItemId → CollectionItem
├── date
├── rating (optional)
├── notes (optional)
├── isRewatch (boolean)
├── createdAt
└── updatedAt

ReadLog
├── id (uuid)
├── collectionItemId → CollectionItem
├── date
├── endingPage (integer)
├── notes (optional)
├── createdAt
└── updatedAt

Tag
├── id (uuid)
├── userId → User
├── name
└── createdAt

ItemTag (join table)
├── collectionItemId → CollectionItem
└── tagId → Tag
```

### Key Relationships

- A **User** has **Libraries** (one per media type, auto-created)
- A **Library** has many **Shelves** (including default shelves)
- A **User** has many **CollectionItems**, **Reviews**, **Shelves**, and **Tags**
- A **CollectionItem** belongs to either a **Movie** or a **Book** (not both — nullable polymorphic FKs)
- A **CollectionItem** can have many **Reviews** (supporting rewatches/rereads with evolving takes)
- A **CollectionItem** can have many **WatchLogs** (movies) or **ReadLogs** (books)
- A **CollectionItem** can belong to many **Shelves** (via ShelfItem)
- A **CollectionItem** can have many **Tags** (via ItemTag)
- **Movie** and **Book** are shared reference entities — multiple users can link to the same movie/book while each having their own CollectionItem with personal metadata
- **ReadLog** entries track page progress over time, enabling reading pace visualization

---

## API Integrations

### TMDB (The Movie Database)
- **Endpoint:** `https://api.themoviedb.org/3/`
- **Auth:** API key (free tier)
- **Key endpoints:**
  - `/search/movie` — search by title
  - `/movie/{id}` — full movie details
  - `/movie/{id}/credits` — cast and crew
  - `/configuration` — image base URLs
- **Rate limit:** ~40 requests/10 seconds
- **Notes:** Letterboxd uses TMDB under the hood. Excellent data quality.

### Open Library
- **Endpoint:** `https://openlibrary.org/`
- **Auth:** None required (fully open)
- **Key endpoints:**
  - `/search.json?q=` — search by title/author
  - `/isbn/{isbn}.json` — lookup by ISBN
  - `/works/{id}.json` — work details
  - `/covers` — cover images
- **Rate limit:** Be respectful, no hard limit documented
- **Notes:** Free and open. Data quality varies — may need Google Books API as supplement later.

---

## Tech Stack Details

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 16 (App Router) | Full-stack React with SSR and API routes |
| Language | TypeScript | Type safety across the entire stack |
| Database | PostgreSQL 16 | Relational data storage |
| ORM | Prisma | Type-safe database queries and migrations |
| Validation | Zod | Runtime environment variable validation |
| Auth (M5) | NextAuth.js | Authentication and session management |
| Styling | Tailwind CSS | Utility-first CSS |
| Deployment (initial) | Local / Intranet (TrueNAS) | Personal use on home network |
| Deployment (future) | TBD | Public-facing multi-user app |

---

## Design Principles

1. **Collection-first** — The physical item is a first-class citizen, not an afterthought
2. **Low friction logging** — Adding an entry should take seconds, not minutes
3. **Study tool** — This is for someone who studies media, not just consumes it
4. **Cozy, not corporate** — The UI should feel like a personal library, not a SaaS dashboard
5. **Offline-resilient** — Core logging works without external API access
6. **Portable data** — Your collection is always exportable; no lock-in

---

## Open Questions

- [ ] Styling framework — Tailwind CSS vs. something with more personality (CSS Modules, Styled Components)?
- [ ] Image storage — local filesystem vs. object storage (S3/Cloudflare R2) for covers/posters?
- [ ] Review format — plain text only, or support markdown for richer reviews?
- [ ] Reading progress — should ReadLog also track start page, or just ending page per session?
- [ ] Watch log detail — should movie watch logs support location/platform (e.g., "theater", "home", "streaming")?
