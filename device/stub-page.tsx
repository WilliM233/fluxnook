import { type FormEvent, useEffect, useRef, useState } from "react";
import { version } from "../package.json";
import { type Device, type DeviceCounts, openDevice, readCounts } from "./db";
import {
  addShelf,
  type DeviceShelf,
  listShelves,
  ShelfNameRefused,
} from "./shelves";

type Opened = {
  device: Device;
  counts: DeviceCounts;
  shelves: DeviceShelf[];
};

async function readOpened(): Promise<Opened> {
  const device = await openDevice();
  const [counts, shelves] = await Promise.all([
    readCounts(device.client),
    listShelves(device.db),
  ]);
  return { device, counts, shelves };
}

/**
 * One open per page load: PGlite takes one connection per instance. A failed
 * wasm fetch rejects inside PGlite where no promise of ours hears it, and its
 * `exec` then waits forever, so a rejection nobody handled while the open is out
 * is the open failing.
 */
async function open(): Promise<Opened> {
  let hear = (_event: PromiseRejectionEvent) => {};
  const unheard = new Promise<never>((_resolve, reject) => {
    hear = (event) => reject(event.reason);
    window.addEventListener("unhandledrejection", hear);
  });
  try {
    return await Promise.race([readOpened(), unheard]);
  } finally {
    window.removeEventListener("unhandledrejection", hear);
  }
}
const opening = open();

function wordsOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The one page on the device until Ch 2.2 brings the app. A failed open prints
 * in words in the counts' place: a phone has no DevTools to read a blank page
 * with (A3's "Nothing else" reads as nothing else on a working page).
 */
export function StubPage() {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [openFailed, setOpenFailed] = useState<string | null>(null);
  const [shelves, setShelves] = useState<DeviceShelf[]>([]);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  // State lands on the next render, and a second Enter can land before it.
  const addOut = useRef(false);

  useEffect(() => {
    opening.then(
      (result) => {
        setOpened(result);
        setShelves(result.shelves);
      },
      (error: unknown) => setOpenFailed(wordsOf(error)),
    );
  }, []);

  // A disabled field drops focus, so it comes back when the hold lifts.
  useEffect(() => {
    if (opened && !adding) field.current?.focus();
  }, [opened, adding]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!opened || addOut.current) return;
    addOut.current = true;
    setAdding(true);
    setProblem(null);
    try {
      const shelf = await addShelf(opened.device.db, name);
      setShelves((current) => [shelf, ...current]);
      setName("");
    } catch (error) {
      setProblem(
        error instanceof ShelfNameRefused
          ? error.message
          : `That shelf didn't save: ${wordsOf(error)}`,
      );
    } finally {
      addOut.current = false;
      setAdding(false);
    }
  }

  if (openFailed) {
    return (
      <main className="mx-auto max-w-xl p-4">
        <p role="alert" className="text-destructive">
          Fluxnook couldn't open its database: {openFailed}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <div className="text-sm text-muted-foreground">
        {opened && (
          <p>
            {opened.counts.migrations} migrations · {opened.counts.tables}{" "}
            tables
          </p>
        )}
        <p>{version}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-1">
        <label htmlFor="shelf-name" className="text-sm">
          Shelf name
        </label>
        <div className="flex gap-2">
          <input
            id="shelf-name"
            ref={field}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!opened || adding}
            className="min-w-0 flex-1 rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!opened || adding}
            className="rounded-lg bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-accent-hover disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
      </form>
      <ul aria-label="Shelves" className="flex flex-col gap-1">
        {shelves.map((shelf) => (
          <li key={shelf.id}>{shelf.name}</li>
        ))}
      </ul>
    </main>
  );
}
