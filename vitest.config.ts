import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { deviceMigrations } from "./device/migrations-plugin";

// Unit tests read nothing from .env.local but the TMDB token and the Comic
// Vine key, which only the live tests use (each skips without one).
// Everything else is injected.
const env = loadEnv("test", process.cwd(), "");

export default defineConfig({
  plugins: [deviceMigrations()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    env: {
      TMDB_API_KEY: env.TMDB_API_KEY ?? "",
      COMICVINE_API_KEY: env.COMICVINE_API_KEY ?? "",
    },
  },
});
