"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { EntrySheet } from "@/app/(app)/journal/entry-sheet";
import {
  LogReadSheet,
  type SheetItem,
} from "@/app/(app)/journal/log-read-sheet";
import { ConfirmSheet } from "@/app/(app)/shelves/confirm-sheet";
import { Button } from "@/components/ui/button";
import { StarControl } from "@/components/ui/star-control";
import { TEXT_BUTTON } from "@/components/ui/text-button";
import { goneIsDone, json } from "@/lib/api/request";
import type { ItemEntry, ItemRead } from "@/lib/journal/item-reads";
import { starText } from "@/lib/journal/stars";
import { verb, words } from "@/lib/journal/words";

/** The work the section belongs to, as its sheets need it. */
export type JournalItem = SheetItem;

/** The one sheet open over the section, if any. */
type Sheet =
  | { kind: "log" }
  | { kind: "edit-read"; card: Card }
  | { kind: "add-entry"; card: Card }
  | { kind: "edit-entry"; card: Card; entry: CardEntry }
  | { kind: "delete-entry"; card: Card; entry: CardEntry }
  | { kind: "delete-read"; card: Card };

/** An entry with its date and pill printed on the server. */
export type CardEntry = ItemEntry & { written: string; pill: string | null };

/** A read with its status word and dates printed on the server. */
export type Card = Omit<ItemRead, "entries"> & {
  statusWord: string;
  dates: string | null;
  entries: CardEntry[];
};

/** The stars as A3's `PATCH` answers them, with the read's version. */
type Answer = { stars: number | null; updatedAt: string };

const STARS_FAILED = "Couldn't save that. Try again.";

/**
 * The Journal section's heading row and cards (Ch 1.6 A5): each card's stars
 * a live control posting A3's `PATCH`. A click shows at once and rolls back
 * on a refusal; a click made while one is saving waits its turn, and the
 * last one wins. Once saved, the card shows the newer of the route's answer
 * and the page's read, by the read's `updatedAt`: a refresh asked for before
 * the last save can't put older stars back under the arrow keys, and a
 * change made in another tab after it shows here (1.6.2 Rummage R1).
 */
export function JournalCards({
  item,
  heading,
  cards,
}: {
  item: JournalItem;
  heading: string;
  cards: Card[];
}) {
  const router = useRouter();
  const w = words(item.type);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  // Stars clicked and not yet answered, by read id.
  const [clicked, setClicked] = useState<Record<string, number | null>>({});
  // The route's last answer per read, with its version.
  const [answered, setAnswered] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [alerts, setAlerts] = useState<Record<string, string>>({});
  // The cards saving now, and the stars each will send next.
  const saving = useRef(new Set<string>());
  const queued = useRef(new Map<string, number | null>());

  /** The stars a card shows: a click saving, else the newer version. */
  function shown(card: Card): number | null {
    if (card.id in clicked) return clicked[card.id];
    const answer = answered[card.id];
    // Fixed-width UTC text, so the newer compares greater.
    return answer && answer.updatedAt > card.updatedAt
      ? answer.stars
      : card.stars;
  }

  const hold = (id: string, held: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (held) next.add(id);
      else next.delete(id);
      return next;
    });

  function forget<T>(map: Record<string, T>, id: string) {
    const { [id]: _, ...rest } = map;
    return rest;
  }

  async function rate(card: Card, stars: number | null) {
    setClicked((current) => ({ ...current, [card.id]: stars }));
    setAlerts((current) => forget(current, card.id));
    // A click while one saves waits its turn (1.6.2 Rummage R5).
    if (saving.current.has(card.id)) {
      queued.current.set(card.id, stars);
      return;
    }
    saving.current.add(card.id);
    hold(card.id, true);
    let next: number | null | undefined = stars;
    try {
      while (next !== undefined) {
        const response = await fetch(
          `/api/v1/occurrences/${card.id}`,
          json("PATCH", { stars: next }),
        );
        // Deleted in another tab: the refresh takes the card away (R2).
        if (response.status === 404) break;
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error?.message ?? STARS_FAILED);
        }
        const answer: Answer = await response.json();
        setAnswered((current) => ({ ...current, [card.id]: answer }));
        next = queued.current.get(card.id);
        queued.current.delete(card.id);
      }
    } catch (error) {
      setAlerts((current) => ({
        ...current,
        [card.id]: error instanceof Error ? error.message : STARS_FAILED,
      }));
    } finally {
      queued.current.delete(card.id);
      saving.current.delete(card.id);
      setClicked((current) => forget(current, card.id));
      hold(card.id, false);
      router.refresh();
    }
  }

  /** A sheet saved: the page's read is the one to show now. */
  function saved() {
    setSheet(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="journal" className="font-heading text-[22px] font-semibold">
            Journal
          </h2>
          <p className="text-[13px] text-dim">{heading}</p>
        </div>
        <Button
          size="lg"
          className="ml-auto"
          onClick={() => setSheet({ kind: "log" })}
        >
          {w.log}
        </Button>
      </div>
      {cards.length > 0 && (
        <ul className="flex flex-col gap-3">
          {cards.map((card) => {
            const stars = shown(card);
            return (
              <li
                key={card.id}
                data-testid="read"
                className="flex flex-col gap-3 rounded-2xl border bg-card p-5"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-heading text-[19px] font-semibold">
                    {card.statusWord}
                  </span>
                  {card.dates && (
                    <span className="text-sm text-muted-foreground">
                      {card.dates}
                    </span>
                  )}
                  <StarControl
                    className="ml-auto"
                    compact
                    value={stars}
                    label={stars === null ? "Unrated" : starText(stars)}
                    busy={busy.has(card.id)}
                    onChange={(next) => rate(card, next)}
                  />
                  <button
                    type="button"
                    aria-label={w.editRead}
                    className={TEXT_BUTTON}
                    onClick={() =>
                      setSheet({ kind: "edit-read", card: { ...card, stars } })
                    }
                  >
                    Edit
                  </button>
                  {/* Not drawn: the walk deletes a read, and beside Edit is
                      where a read's own action lives (1.6.2 plan, step 7). */}
                  <button
                    type="button"
                    aria-label={`Delete this ${verb(item.type)}`}
                    className={TEXT_BUTTON}
                    onClick={() => setSheet({ kind: "delete-read", card })}
                  >
                    Delete
                  </button>
                </div>
                {alerts[card.id] && (
                  <p role="alert" className="text-sm text-destructive">
                    {alerts[card.id]}
                  </p>
                )}
                {card.entries.map((entry) => (
                  <div
                    key={entry.id}
                    data-testid="entry"
                    className="flex flex-col gap-2 border-t pt-3"
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-[13px] text-dim">
                        {entry.written}
                      </span>
                      {entry.pill && (
                        <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs text-muted-foreground">
                          {entry.pill}
                        </span>
                      )}
                      <span className="ml-auto flex gap-3">
                        <button
                          type="button"
                          aria-label="Edit entry"
                          className={TEXT_BUTTON}
                          onClick={() =>
                            setSheet({ kind: "edit-entry", card, entry })
                          }
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          aria-label="Delete entry"
                          className={TEXT_BUTTON}
                          onClick={() =>
                            setSheet({ kind: "delete-entry", card, entry })
                          }
                        >
                          Delete
                        </button>
                      </span>
                    </div>
                    <p className="max-w-[62ch] text-sm wrap-anywhere whitespace-pre-line">
                      {entry.body}
                    </p>
                  </div>
                ))}
                <div>
                  <button
                    type="button"
                    className="rounded text-sm text-primary outline-none hover:text-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50"
                    onClick={() => setSheet({ kind: "add-entry", card })}
                  >
                    Add an entry
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {sheet?.kind === "log" && (
        <LogReadSheet
          item={item}
          onSaved={saved}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "edit-read" && (
        <LogReadSheet
          item={item}
          read={sheet.card}
          onSaved={saved}
          onClose={() => setSheet(null)}
        />
      )}
      {(sheet?.kind === "add-entry" || sheet?.kind === "edit-entry") && (
        <EntrySheet
          item={item}
          readId={sheet.card.id}
          entry={sheet.kind === "edit-entry" ? sheet.entry : undefined}
          onSaved={saved}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "delete-entry" && (
        <ConfirmSheet
          title="Delete entry"
          sentence="Delete this entry?"
          confirm="Delete"
          failed="Couldn't delete the entry just now. Try again."
          send={() =>
            goneIsDone(
              fetch(
                `/api/v1/occurrences/${sheet.card.id}/entries/${sheet.entry.id}`,
                json("DELETE"),
              ),
            )
          }
          onDone={saved}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "delete-read" && (
        <ConfirmSheet
          title={w.deleteRead}
          // The count is the page's: the entries the card shows (A7).
          sentence={w.deleteReadQuestion(sheet.card.entries.length)}
          confirm="Delete"
          failed={`Couldn't delete the ${verb(item.type)} just now. Try again.`}
          send={() =>
            goneIsDone(
              fetch(`/api/v1/occurrences/${sheet.card.id}`, json("DELETE")),
            )
          }
          onDone={saved}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
