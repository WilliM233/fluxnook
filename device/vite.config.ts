import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { deviceMigrations } from "./migrations-plugin";

// The shell injects this policy into the page (Ch 2.1.2), so the preview serves
// the same string: the Chromium suite then runs PGlite under the policy the
// phone and Windows run it under, read from the one file that sets it.
const shellConfig = JSON.parse(
  readFileSync(
    new URL("../src-tauri/tauri.conf.json", import.meta.url),
    "utf8",
  ),
);
const contentSecurityPolicy: string = shellConfig.app.security.csp;

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
  preview: {
    headers: { "Content-Security-Policy": contentSecurityPolicy },
  },
});
