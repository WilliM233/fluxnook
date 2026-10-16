import { defineConfig } from "drizzle-kit";

// Generate only. The Supabase CLI applies supabase/migrations; drizzle-kit
// migrate or push would keep a second ledger.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./supabase/migrations",
  schemaFilter: ["public"],
  migrations: { prefix: "supabase" },
});
