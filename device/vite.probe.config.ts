import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The probe's build (Ch 2.1.2, step 5): its own page and output, never inside the
// app's `device/dist`. The shell injects the app's policy around it through
// `src-tauri/tauri.probe.conf.json`.
export default defineConfig({
  root: fileURLToPath(new URL("./probe", import.meta.url)),
  optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  build: {
    outDir: fileURLToPath(new URL("./dist-probe", import.meta.url)),
    emptyOutDir: true,
  },
});
