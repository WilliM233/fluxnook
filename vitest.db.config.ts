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
