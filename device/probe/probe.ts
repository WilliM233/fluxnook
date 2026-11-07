import { PGlite } from "@electric-sql/pglite";

// The scheme (useHttpsScheme) is fixed at the first install and can never change
// without wiping every phone, so it is chosen on what the real WebViews measure
// (Ch 2.1.2, step 7). This page takes those measures under the app's own policy
// and prints one line per measure, for a person or a script to read. It is never
// part of the app's build.

type Reading = [measure: string, value: string];

const readings: Reading[] = [];
const lines = document.getElementById("lines");

function note(measure: string, value: unknown): void {
  readings.push([measure, String(value)]);
  if (lines) lines.textContent += `${measure}: ${String(value)}\n`;
}

async function attempt<T>(work: () => Promise<T> | T): Promise<T | string> {
  try {
    return await work();
  } catch (error) {
    return `refused (${error instanceof Error ? error.message : String(error)})`;
  }
}

// A second launch of the same app finds the first one's lock held: the guard
// 2.1.1's `holdTheStore` relies on, across processes.
async function lockAcrossWindows(): Promise<string> {
  if (!("locks" in navigator)) return "no navigator.locks";
  return new Promise((report) => {
    navigator.locks.request("fluxnook-probe", { ifAvailable: true }, (lock) => {
      if (lock === null) {
        report("held by another window");
        return undefined;
      }
      report("mine, held until this window closes");
      return new Promise<void>(() => {});
    });
  });
}

async function measure(): Promise<void> {
  const chrome = navigator.userAgent.match(/Chrome\/([\d.]+)/);
  note("user agent Chrome", chrome ? chrome[1] : navigator.userAgent);
  note("origin", location.origin);
  note("isSecureContext", window.isSecureContext);
  note("navigator.locks", "locks" in navigator);
  note("lock", await lockAcrossWindows());
  note("crypto.randomUUID", typeof crypto.randomUUID === "function");
  note(
    "OPFS getDirectory",
    await attempt(async () => {
      if (typeof navigator.storage?.getDirectory !== "function")
        return "absent";
      await navigator.storage.getDirectory();
      return "works";
    }),
  );
  note(
    "eval",
    await attempt(() => {
      // biome-ignore lint/security/noGlobalEval: the measure is whether the policy refuses it
      eval("1");
      return "allowed";
    }),
  );
  note("persisted at load", await attempt(() => navigator.storage.persisted()));
  note("persist()", await attempt(() => navigator.storage.persist()));
  note(
    "quota MB",
    await attempt(async () => {
      const { quota } = await navigator.storage.estimate();
      return quota === undefined ? "unknown" : Math.round(quota / 1_048_576);
    }),
  );

  const started = performance.now();
  const opened = await attempt(async () => {
    const db = new PGlite("idb://fluxnook-probe");
    await db.waitReady;
    return db;
  });
  if (typeof opened === "string") {
    note("PGlite", opened);
  } else {
    note("PGlite first open ms", Math.round(performance.now() - started));
    const version = await opened.query<{ version: string }>("select version()");
    note(
      "PGlite version",
      version.rows[0]?.version.split(" ").slice(0, 2).join(" "),
    );
    await opened.exec(
      "create table if not exists launches (at timestamptz default now())",
    );
    await opened.exec("insert into launches default values");
    const count = await opened.query<{ n: number }>(
      "select count(*)::int as n from launches",
    );
    note("launches counted", count.rows[0]?.n);
  }
  note("done", true);
}

declare global {
  interface Window {
    probeReadings?: Reading[];
  }
}

measure()
  .catch((error) => note("probe failed", error))
  .finally(() => {
    window.probeReadings = readings;
  });
