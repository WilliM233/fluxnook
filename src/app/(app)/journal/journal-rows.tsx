"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TypePill } from "@/app/(app)/search/rows";
import { ConfirmSheet } from "@/app/(app)/shelves/confirm-sheet";
import { AccentStar } from "@/components/ui/accent-star";
import { TextButton } from "@/components/ui/text-button";
import { goneIsDone, json } from "@/lib/api/request";
import type { ItemType } from "@/lib/journal/words";
import { EntrySheet, type SheetEntry } from "./entry-sheet";
import { HEADING } from "./log-read-sheet";

/** One Journal row, every string printed on the server (A8). */
export type JournalRowView = {
  id: string;
  readId: string;
  work: {
    id: string;
    title: string;
    type: ItemType;
    form: string | null;
    line: string;
  };
  state: string;
  star: string | null;
  pill: string | null;
  time: string;
  entry: SheetEntry;
};

/** The rows written on one day, under its label. */
export type DayGroup = { day: string; rows: JournalRowView[] };

type Sheet =
  | { kind: "edit"; row: JournalRowView }
  | { kind: "delete"; row: JournalRowView };

/**
 * The Journal page's rows by day (A8), with each row's Edit and Delete:
 * 1.6.2's entry sheet and confirm, a 2xx reading the page again where it is.
 */
export function JournalRows({ days }: { days: DayGroup[] }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const saved = () => {
    setSheet(null);
    router.refresh();
  };
  // After a write that was tried, the page may know better than the sheet.
  const close = (tried: boolean) => (tried ? saved() : setSheet(null));

  return (
    <>
      {days.map(({ day, rows }) => (
        <section
          key={day}
          aria-label={day}
          className="flex flex-col gap-4 border-t pt-6"
        >
          <h2 className={HEADING}>{day}</h2>
          <ul className="flex flex-col gap-4">
            {rows.map((row) => (
              <li
                key={row.id}
                data-testid="journal-row"
                className="flex flex-col gap-4 rounded-2xl border bg-card p-5 md:flex-row"
              >
                <div className="flex flex-col gap-1.5 md:w-56 md:flex-none">
                  <Link
                    href={`/items/${row.work.id}`}
                    className="font-heading text-lg leading-tight font-semibold wrap-anywhere hover:text-accent-hover"
                  >
                    {row.work.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <TypePill type={row.work.type} />
                    {row.work.line && (
                      <span className="text-sm text-muted-foreground">
                        {row.work.line}
                      </span>
                    )}
                  </div>
                  <span className="text-[13px] text-dim">
                    <AccentStar text={row.state} star={row.star} />
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <p className="max-w-[62ch] text-sm wrap-anywhere whitespace-pre-line">
                    {row.entry.body}
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    {row.pill && (
                      <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs text-muted-foreground">
                        {row.pill}
                      </span>
                    )}
                    <span className="text-[13px] text-dim tabular-nums">
                      {row.time}
                    </span>
                    <span className="ml-auto flex gap-3">
                      <TextButton
                        aria-label="Edit entry"
                        onClick={() => setSheet({ kind: "edit", row })}
                      >
                        Edit
                      </TextButton>
                      <TextButton
                        aria-label="Delete entry"
                        onClick={() => setSheet({ kind: "delete", row })}
                      >
                        Delete
                      </TextButton>
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {sheet?.kind === "edit" && (
        <EntrySheet
          item={{ type: sheet.row.work.type, form: sheet.row.work.form }}
          readId={sheet.row.readId}
          entry={sheet.row.entry}
          onSaved={saved}
          onClose={close}
        />
      )}
      {sheet?.kind === "delete" && (
        <ConfirmSheet
          title="Delete entry"
          sentence="Delete this entry?"
          confirm="Delete"
          failed="Couldn't delete the entry just now. Try again."
          send={() =>
            goneIsDone(
              fetch(
                `/api/v1/occurrences/${sheet.row.readId}/entries/${sheet.row.id}`,
                json("DELETE"),
              ),
            )
          }
          onDone={saved}
          onClose={close}
        />
      )}
    </>
  );
}
