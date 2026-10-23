import { defineConfig } from "drizzle-kit";

// Generate only. The Supabase CLI applies supabase/migrations; drizzle-kit
// migrate or push would keep a second ledger.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  // DRIZZLE_OUT is set only by scripts/db-check.mjs, to generate into a copy.
  out: process.env.DRIZZLE_OUT ?? "./supabase/migrations",
  schemaFilter: ["public"],
  migrations: { prefix: "supabase" },
});
