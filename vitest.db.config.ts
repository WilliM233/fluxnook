import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Database tests: they need the local stack up (`npx supabase start`) and
// read .env.local like the app does. `npm test` never includes them.
const env = loadEnv("test", process.cwd(), "");

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/db/**/*.test.ts"],
    // Local Postgres has 100 slots and the stack holds about 46. Each file's
    // pool opens up to 10 under a page's parallel reads, so a worker per core on
    // a 32-core box ran out (53300, 1.7.3 step 3).
    maxWorkers: 8,
    // A hook that loads or resets waits its turn behind the loader's advisory
    // lock with the other files; on a fresh catalog that queue passes 10 s (A15 a).
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: env.DATABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      // Server-only: the cover store's key, and the providers, which db
      // tests point at the stubs they start themselves.
      SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY ?? "",
      TMDB_API_KEY: env.TMDB_API_KEY ?? "",
      TMDB_BASE_URL: env.TMDB_BASE_URL ?? "",
      TMDB_IMAGE_BASE_URL: env.TMDB_IMAGE_BASE_URL ?? "",
      OPENLIBRARY_BASE_URL: env.OPENLIBRARY_BASE_URL ?? "",
      OPENLIBRARY_COVERS_BASE_URL: env.OPENLIBRARY_COVERS_BASE_URL ?? "",
      OPENLIBRARY_CONTACT: env.OPENLIBRARY_CONTACT ?? "",
      COMICVINE_API_KEY: env.COMICVINE_API_KEY ?? "",
      COMICVINE_BASE_URL: env.COMICVINE_BASE_URL ?? "",
      COMICVINE_CONTACT: env.COMICVINE_CONTACT ?? "",
    },
  },
});
