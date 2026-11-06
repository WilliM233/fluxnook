"use client";

import { closestCenter, DndContext } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LogReadSheet } from "@/app/(app)/journal/log-read-sheet";
import { AccentStar } from "@/components/ui/accent-star";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TEXT_BUTTON, TextButton } from "@/components/ui/text-button";
import { json } from "@/lib/api/request";
import type { PickerWork } from "@/lib/catalog/picker-works";
import { plural } from "@/lib/catalog/work-line";
import { localToday } from "@/lib/journal/forms";
import { starText } from "@/lib/journal/stars";
import { words } from "@/lib/journal/words";
import { headingId } from "@/lib/shelves/drop";
import { countsLine, type Rated } from "@/lib/shelves/lines";
import {
  type ShelfRow as Row,
  ratedOf,
  type ShelfPage,
  tally,
} from "@/lib/shelves/shelf-page";
import { ConfirmSheet } from "../confirm-sheet";
import { NameSheet } from "../name-sheet";
import { ShelfSheet } from "../shelf-sheet";
import { AddWorks } from "./add-works";
import { KEYS, useDragMove } from "./drag";
import { SortableHeading, SortableRow } from "./sortable-row";
import { type Status, StatusControl } from "./status-control";

/** A row as the view holds it: the read's row and the section it is in. */
export type ViewRow = Row & { section: string | null };

type Section = ShelfPage["sections"][number];

/** The one sheet open on the page, if any. */
type Sheet =
  | { kind: "add-works" }
  | { kind: "edit-shelf" }
  | { kind: "delete-shelf" }
  | { kind: "new-section" }
  | { kind: "rename"; section: Section }
  | { kind: "delete-section"; section: Section; works: number }
  | { kind: "log-read"; row: ViewRow };

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

/** Delete section's question (A7); an empty section has nothing to move. */
const deleteSectionSentence = (name: string, works: number) =>
  works === 0
    ? `Delete ${name}? It holds no works.`
    : `Delete ${name}? Its ${plural(works, "work")} ${works === 1 ? "moves" : "move"} above the first section.`;

/** Delete shelf's question (A7); an empty shelf has no works to keep. */
const deleteShelfSentence = (name: string, works: number) =>
  works === 0
    ? `Delete ${name}? It holds no works.`
    : `Delete ${name} and its ${plural(works, "work")} from it? The works stay in the catalog.`;

/**
 * A shelf's or a section's line (A7, 1.6 A9), its star in accent as drawn;
 * the text is `countsLine`'s, so a test reads it whole.
 */
function CountsText({
  counts,
  rated,
}: {
  counts: Parameters<typeof countsLine>[0];
  rated: Rated;
}) {
  const star = rated.n > 0 && rated.mean !== null ? starText(rated.mean) : null;
  return <AccentStar text={countsLine({ ...counts, rated })} star={star} />;
}

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
  works,
  supabaseUrl,
}: {
  page: ShelfPage;
  works: PickerWork[];
  supabaseUrl: string;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [seed, setSeed] = useState(page);
  const [rows, setRows] = useState(() => flatten(page));
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [alert, setAlert] = useState<string | null>(null);
  // Rows just marked Done that offer to log the read (1.6 A10): view state
  // only, so a reload shows Remove again.
  const [offers, setOffers] = useState<ReadonlySet<string>>(new Set());
  // Edit shelf sends what it opened with, so it waits for the read a write asked
  // for: a stale one puts the old words back (1.8.1 B4).
  const [refreshing, refresh] = useTransition();
  if (seed !== page) {
    const fresh = flatten(page);
    setSeed(page);
    setRows(fresh);
    // An offer follows a Done the server answered; a read that shows the
    // row isn't Done any more takes it away (1.6.3 Rummage R2).
    const done = new Set(
      fresh.filter((r) => r.status === "done").map((r) => r.id),
    );
    setOffers((current) =>
      [...current].every((id) => done.has(id))
        ? current
        : new Set([...current].filter((id) => done.has(id))),
    );
  }

  const { shelf, sections } = page;
  const counts = { ...tally(rows), sections: sections.length };
  const unsectioned = rows.filter((row) => row.section === null);
  const drag = useDragMove({
    shelfId: shelf.id,
    sections,
    rows,
    setRows,
    setAlert,
  });

  const hold = (id: string, held: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (held) next.add(id);
      else next.delete(id);
      return next;
    });

  const offer = (id: string, on: boolean) =>
    setOffers((current) => {
      if (current.has(id) === on) return current;
      const next = new Set(current);
      if (on) next.add(id);
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
        // Only a Done the server has answered offers to log; a failure never.
        offer(row.id, entry.status === "done");
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

  /** A work off the shelf, asking nothing: the catalog keeps it (A7). */
  async function remove(row: ViewRow) {
    hold(row.id, true);
    try {
      const response = await fetch(
        `/api/v1/shelves/${shelf.id}/entries/${row.id}`,
        json("DELETE"),
      );
      if (response.ok) {
        setAlert(null);
        router.refresh();
      } else {
        setAlert(await refusal(response, SAVE_FAILED));
      }
    } catch {
      setAlert(SAVE_FAILED);
    } finally {
      hold(row.id, false);
    }
  }

  /** A sheet's write is done: close it and read the shelf again. */
  const saved = () => {
    setSheet(null);
    refresh(() => router.refresh());
  };

  /** After a write that was tried, the page may know better than the sheet. */
  const close = (tried: boolean) => (tried ? saved() : setSheet(null));

  /** The offer under a row just marked Done, in Remove's place (1.6 A10). */
  const offerOf = (row: ViewRow) => {
    const w = words(row.item.type);
    return (
      <span className="flex items-center gap-3 text-[13px]">
        <span className="text-muted-foreground">{w.ask}</span>
        <button
          type="button"
          disabled={busy.has(row.id)}
          className="rounded text-primary outline-none hover:text-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => setSheet({ kind: "log-read", row })}
        >
          {w.log}
        </button>
        <TextButton
          disabled={busy.has(row.id)}
          onClick={() => offer(row.id, false)}
        >
          Not now
        </TextButton>
      </span>
    );
  };

  const rowOf = (row: ViewRow) => (
    <SortableRow
      key={row.id}
      row={row}
      supabaseUrl={supabaseUrl}
      disabled={drag.moving}
      aside={
        <>
          <StatusControl
            title={row.item.title}
            status={row.status}
            busy={busy.has(row.id)}
            onPick={(status) => setStatus(row, status)}
          />
          {offers.has(row.id) ? (
            offerOf(row)
          ) : (
            <button
              type="button"
              aria-label={`Remove ${row.item.title}`}
              disabled={busy.has(row.id)}
              className={TEXT_BUTTON}
              onClick={() => remove(row)}
            >
              Remove
            </button>
          )}
        </>
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
          <span>
            <CountsText counts={counts} rated={ratedOf(rows)} />
          </span>
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
          <Button size="lg" onClick={() => setSheet({ kind: "add-works" })}>
            Add works
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => setSheet({ kind: "new-section" })}
          >
            New section
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={refreshing}
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

      {sheet?.kind === "log-read" && (
        <LogReadSheet
          item={{
            id: sheet.row.item.id,
            title: sheet.row.item.title,
            type: sheet.row.item.type,
            form: sheet.row.item.form ?? null,
          }}
          // An open read is the one Done means: finish it, never log a
          // second (1.6.3 Raccoon N9, L at the exit Browse).
          read={
            sheet.row.open
              ? {
                  ...sheet.row.open,
                  status: "done",
                  finishedOn: localToday(),
                }
              : undefined
          }
          onSaved={() => {
            offer(sheet.row.id, false);
            saved();
          }}
          onClose={(tried, lost) => {
            // No answer may mean it landed, and the read below shows it: the
            // offer that stayed would log a second (1.8.1 B2, 1.6.3 N9).
            if (lost) offer(sheet.row.id, false);
            close(tried);
          }}
        />
      )}
      {sheet?.kind === "add-works" && (
        <AddWorks
          shelf={shelf}
          sections={sections}
          held={new Map(rows.map((row) => [row.item.id, row.position]))}
          works={works}
          onAdded={saved}
          onClose={close}
        />
      )}
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
          onSaved={saved}
          onClose={close}
        />
      )}
      {sheet?.kind === "new-section" && (
        <NameSheet
          title="New section"
          lede="It goes after the last section, empty until you drag or add works into it."
          initial=""
          submit="Make section"
          failed="Couldn't make the section just now. Try again."
          send={(name) =>
            fetch(
              `/api/v1/shelves/${shelf.id}/sections`,
              json("POST", { name }),
            )
          }
          onSaved={saved}
          onClose={close}
        />
      )}
      {sheet?.kind === "rename" && (
        <NameSheet
          title={`Rename ${sheet.section.name}`}
          lede="Its works and their order stay as they are."
          initial={sheet.section.name}
          submit="Rename"
          failed="Couldn't rename the section just now. Try again."
          send={(name) =>
            fetch(
              `/api/v1/shelves/${shelf.id}/sections/${sheet.section.id}`,
              json("PATCH", { name }),
            )
          }
          onSaved={saved}
          onClose={close}
        />
      )}
      {sheet?.kind === "delete-section" && (
        <ConfirmSheet
          title="Delete section"
          sentence={deleteSectionSentence(sheet.section.name, sheet.works)}
          confirm="Delete section"
          failed="Couldn't delete the section just now. Try again."
          send={() =>
            fetch(
              `/api/v1/shelves/${shelf.id}/sections/${sheet.section.id}`,
              json("DELETE"),
            )
          }
          onDone={saved}
          onClose={close}
        />
      )}
      {sheet?.kind === "delete-shelf" && (
        <ConfirmSheet
          title="Delete shelf"
          sentence={deleteShelfSentence(shelf.name, counts.works)}
          confirm="Delete shelf"
          failed="Couldn't delete the shelf just now. Try again."
          send={() => fetch(`/api/v1/shelves/${shelf.id}`, json("DELETE"))}
          onDone={() => router.push("/nook")}
          // No answer may mean it's gone, and the good answer's door is the nook.
          onClose={(tried, lost) =>
            lost ? router.push("/nook") : close(tried)
          }
        />
      )}

      <div className="flex flex-col gap-7 border-t pt-7">
        {counts.works === 0 && (
          <p className="text-muted-foreground">Nothing on it yet.</p>
        )}

        <DndContext
          id={`shelf-${shelf.id}`}
          collisionDetection={closestCenter}
          {...drag.context}
        >
          <SortableContext
            items={drag.sequence}
            strategy={verticalListSortingStrategy}
          >
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
                  <SortableHeading id={headingId(section.id)}>
                    <h2
                      id={`section-${section.id}`}
                      className="font-heading text-[19px] font-semibold"
                    >
                      {section.name}
                    </h2>
                    <span className="text-[13px] text-dim">
                      <CountsText counts={tally(held)} rated={ratedOf(held)} />
                    </span>
                    <span className="ml-auto flex gap-4">
                      <button
                        type="button"
                        aria-label={`Rename ${section.name}`}
                        className={TEXT_BUTTON}
                        onClick={() => setSheet({ kind: "rename", section })}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete section ${section.name}`}
                        className={TEXT_BUTTON}
                        onClick={() =>
                          setSheet({
                            kind: "delete-section",
                            section,
                            works: held.length,
                          })
                        }
                      >
                        Delete section
                      </button>
                    </span>
                  </SortableHeading>
                  {held.length > 0 && (
                    <ol className="flex flex-col gap-3">{held.map(rowOf)}</ol>
                  )}
                </section>
              );
            })}
          </SortableContext>
        </DndContext>

        {alert && (
          <p role="alert" className="text-sm text-destructive">
            {alert}
          </p>
        )}

        {counts.works > 0 && (
          <p className="text-[13px] text-dim">
            Numbers are the shelf's order, counted through the sections. {KEYS}{" "}
            A row's status is this shelf's: done here means past it on this
            list, not read or watched, which the journal keeps. Delete section
            moves its works above the first section; nothing is lost by deleting
            a section. Stars on a row are its latest starred read or watch; the
            shelf's star is the mean over the works that have one, with how many
            that is. The offer under a row just marked Done logs the read or
            watch in the journal, once, or finishes the one you have open, and
            goes away on its own.
          </p>
        )}
      </div>
    </>
  );
}
