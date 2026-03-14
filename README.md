# FluxNook

A personal media archival and collection tracker for books and movies. Letterboxd meets Goodreads, built for people who care about the physical artifact as much as the content itself.

[![CI](https://github.com/WilliM233/fluxnook/actions/workflows/ci.yml/badge.svg)](https://github.com/WilliM233/fluxnook/actions/workflows/ci.yml)
![License](https://img.shields.io/github/license/WilliM233/fluxnook)

---

## About

FluxNook is a media collection tracker designed for logging, reviewing, and studying physical media. Track your movie and book collections, write reviews, log watch and reading sessions, and organize everything into custom shelves.

The app starts as a single-user tool designed for intranet deployment and is architected to grow into a multi-user social platform where collectors can share shelves, reviews, and discoveries with friends.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | Next.js (App Router) | Full-stack React with SSR and built-in API routes |
| **Language** | TypeScript | Type safety across the entire stack |
| **Database** | PostgreSQL | Relational data with strong query support |
| **ORM** | Prisma | Type-safe queries, schema-as-code, and versioned migrations |
| **Styling** | Tailwind CSS | Utility-first CSS for rapid UI development |
| **Validation** | Zod | Runtime environment variable validation |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or later
- [Docker](https://www.docker.com/products/docker-desktop/) (for the development database)
- [Git](https://git-scm.com/)

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/WilliM233/fluxnook.git
   cd fluxnook
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables:**

   ```bash
   cp .env.example .env
   ```

   Open `.env` and update `DATABASE_URL` with your database credentials.

4. **Start the development database:**

   ```bash
   docker compose up -d
   ```

   This spins up a PostgreSQL 16 container. The default credentials in `docker-compose.yml` match the example connection string:

   ```
   DATABASE_URL="postgresql://fluxnook:fluxnook_dev@localhost:5432/fluxnook_dev?schema=public"
   ```

5. **Run database migrations:**

   ```bash
   npx prisma migrate dev
   ```

6. **Start the development server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run start` | Run the production build |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting without making changes |

## Project Structure

```
fluxnook/
├── .github/workflows/   # CI pipeline
├── prisma/
│   ├── migrations/      # Versioned database migrations
│   └── schema.prisma    # Database schema definition
├── src/
│   ├── app/             # Next.js App Router pages and layouts
│   ├── components/      # Reusable React components
│   ├── lib/             # Utilities, database client, API helpers
│   └── types/           # Shared TypeScript type definitions
├── docker-compose.yml   # Development database
├── prisma.config.ts     # Prisma CLI configuration
└── .env.example         # Environment variable template
```

## Database Schema

FluxNook uses a shared catalog model — movies and books exist as reference entities, while each user's personal collection links to them with their own metadata.

**Current models (M1):**

- **User** — account identity and profile
- **Movie** — shared movie catalog entry
- **Book** — shared book catalog entry
- **CollectionItem** — a user's personal copy linking to a movie or book, with format, condition, and edition details
- **Review** — ratings and written reviews tied to collection items

**Coming in M2:** Library, Shelf, WatchLog, ReadLog, Tag

## Roadmap

Development is organized into milestones tracked on the [project board](https://github.com/users/WilliM233/projects/3/views/1).

- **M1: Foundation** — Project scaffold, database, CI, environment config ✅
- **M2: Core Logging** — Libraries, shelves, media entry, ratings, reviews, watch/read logs
- **M3: API Integrations** — TMDB for movies, Open Library for books
- **M4: Collection Management** — Tags, dashboard, stats, export
- **M5: Multi-User & Social** — Authentication, profiles, friends, activity feeds

See [FEATURES.md](./FEATURES.md) for the full feature specification.

## Contributing

This project uses GitHub Flow:

1. Create a feature branch from `develop`: `git checkout -b feature/your-feature`
2. Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `ci:`
3. Open a pull request targeting `develop`
4. CI must pass before merging
5. Stable releases merge from `develop` into `main`

## License

This project is licensed under the MIT License — see the [LICENSE](./LICENSE) file for details.