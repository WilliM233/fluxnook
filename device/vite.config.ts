import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { deviceMigrations } from "./migrations-plugin";

// The stub's build. Not Next: an `output: 'export'` can't take the app's route
// handlers and cookies, which is Ch 2.2's seam (Q2 a).
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [deviceMigrations(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  // PGlite finds its wasm and data files beside itself (its bundler docs).
  optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  build: { outDir: "dist", emptyOutDir: true },
});
