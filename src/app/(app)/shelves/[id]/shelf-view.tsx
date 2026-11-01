"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/catalog/work-line";
import { countsLine } from "@/lib/shelves/lines";
import {
  type ShelfRow as Row,
  type ShelfPage,
  tally,
} from "@/lib/shelves/shelf-page";
import { ConfirmSheet } from "../confirm-sheet";
import { ShelfSheet } from "../shelf-sheet";
import { ShelfRow } from "./shelf-row";
import { type Status, StatusControl } from "./status-control";

/** A row as the view holds it: the read's row and the section it is in. */
export type ViewRow = Row & { section: string | null };

/** The one sheet open on the page, if any. */
type Sheet = { kind: "edit-shelf" } | { kind: "delete-shelf" };

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

// The page's text buttons, as drawn: dim words that light on hover.
const TEXT_BUTTON =
  "rounded text-[13px] text-dim outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/** The read's rows as one list in display order, each knowing its section. */
function flatten(page: ShelfPage): ViewRow[] {
  return [
    ...page.unsectioned.map((row) => ({ ...row, section: null })),
    ...page.sections.flatMap((s) =>
      s.rows.map((row) => ({ ...row, section: s.id })),
    ),
  ];
}

const SAVE_FAILED = "Couldn't save that. Try again.";

/** What a refused write says: the route's own words when it has them. */
async function refusal(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return (body?.error?.message as string | undefined) ?? fallback;
}

/**
 * A shelf in hand (A7, A9): the header, the works above the first section,
 * each section and its counts, every row with its status. The rows are state
 * seeded from the server's read, and seeded again whenever a refresh brings
 * a new one; a status applies the route's answer without a refresh.
 */
export function ShelfView({
  page,
  supabaseUrl,
}: {
  page: ShelfPage;
  supabaseUrl: string;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [seed, setSeed] = useState(page);
  const [rows, setRows] = useState(() => flatten(page));
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [alert, setAlert] = useState<string | null>(null);
  if (seed !== page) {
    setSeed(page);
    setRows(flatten(page));
  }

  const { shelf, sections } = page;
  const counts = { ...tally(rows), sections: sections.length };
  const unsectioned = rows.filter((row) => row.section === null);

  const hold = (id: string, held: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (held) next.add(id);
      else next.delete(id);
      return next;
    });

  async function setStatus(row: ViewRow, status: Status) {
    if (status === row.status) return;
    hold(row.id, true);
    try {
      const response = await fetch(
        `/api/v1/shelves/${shelf.id}/entries/${row.id}`,
        json("PATCH", { status }),
      );
      if (response.ok) {
        const entry: { status: Status } = await response.json();
        setRows((current) =>
          current.map((r) =>
            r.id === row.id ? { ...r, status: entry.status } : r,
          ),
        );
        setAlert(null);
      } else {
        setAlert(await refusal(response, SAVE_FAILED));
      }
    } catch {
      setAlert(SAVE_FAILED);
    } finally {
      hold(row.id, false);
    }
  }

  const rowOf = (row: ViewRow) => (
    <ShelfRow
      key={row.id}
      row={row}
      supabaseUrl={supabaseUrl}
      aside={
        <StatusControl
          title={row.item.title}
          status={row.status}
          busy={busy.has(row.id)}
          onPick={(status) => setStatus(row, status)}
        />
      }
    />
  );

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted-foreground">
          <Badge
            variant="outline"
            className="border-line-strong tracking-widest text-muted-foreground uppercase"
          >
            Shelf
          </Badge>
          <span>{countsLine(counts)}</span>
        </div>
        <h1 className="font-heading text-5xl leading-none font-semibold tracking-tight">
          {shelf.name}
        </h1>
        {shelf.description && (
          <p className="max-w-prose text-base whitespace-pre-line text-muted-foreground">
            {shelf.description}
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <Button
            size="lg"
            variant="outline"
            onClick={() => setSheet({ kind: "edit-shelf" })}
          >
            Edit shelf
          </Button>
          <button
            type="button"
            className={`ml-auto ${TEXT_BUTTON}`}
            onClick={() => setSheet({ kind: "delete-shelf" })}
          >
            Delete shelf
          </button>
        </div>
      </div>

      {sheet?.kind === "edit-shelf" && (
        <ShelfSheet
          title={`Edit ${shelf.name}`}
          lede="Its name and the words under it. Only you can see it."
          initial={shelf}
          submit="Save"
          failed="Couldn't save the shelf just now. Try again."
          send={(words) =>
            fetch(`/api/v1/shelves/${shelf.id}`, json("PATCH", words))
          }
          onSaved={() => {
            setSheet(null);
            router.refresh();
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "delete-shelf" && (
        <ConfirmSheet
          title="Delete shelf"
          sentence={`Delete ${shelf.name} and its ${plural(counts.works, "work")} from it? The works stay in the catalog.`}
          confirm="Delete shelf"
          failed="Couldn't delete the shelf just now. Try again."
          send={() => fetch(`/api/v1/shelves/${shelf.id}`, json("DELETE"))}
          onDone={() => router.push("/nook")}
          onClose={() => setSheet(null)}
        />
      )}

      <div className="flex flex-col gap-7 border-t pt-7">
        {counts.works === 0 && (
          <p className="text-muted-foreground">Nothing on it yet.</p>
        )}

        {unsectioned.length > 0 && (
          <div className="flex flex-col gap-3">
            <ol
              aria-label="Above the first section"
              className="flex flex-col gap-3"
            >
              {unsectioned.map(rowOf)}
            </ol>
            {sections.length > 0 && (
              <p className="text-[13px] text-dim">
                A work above the first section is on the shelf, not in a
                section. Drag it into one, or leave it.
              </p>
            )}
          </div>
        )}

        {sections.map((section) => {
          const held = rows.filter((row) => row.section === section.id);
          return (
            <section
              key={section.id}
              aria-labelledby={`section-${section.id}`}
              className="flex flex-col gap-3"
            >
              <div className="flex flex-wrap items-baseline gap-2.5">
                <h2
                  id={`section-${section.id}`}
                  className="font-heading text-[19px] font-semibold"
                >
                  {section.name}
                </h2>
                <span className="text-[13px] text-dim">
                  {countsLine(tally(held))}
                </span>
              </div>
              {held.length > 0 && (
                <ol className="flex flex-col gap-3">{held.map(rowOf)}</ol>
              )}
            </section>
          );
        })}

        {alert && (
          <p role="alert" className="text-sm text-destructive">
            {alert}
          </p>
        )}

        {counts.works > 0 && (
          <p className="text-[13px] text-dim">
            Numbers are the shelf's order, counted through the sections.
          </p>
        )}
      </div>
    </>
  );
}
