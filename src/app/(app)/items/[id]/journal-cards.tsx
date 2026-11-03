"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  LogReadSheet,
  type SheetItem,
} from "@/app/(app)/journal/log-read-sheet";
import { Button } from "@/components/ui/button";
import { StarControl } from "@/components/ui/star-control";
import type { ItemEntry, ItemRead } from "@/lib/journal/item-reads";
import { starText } from "@/lib/journal/stars";
import { words } from "@/lib/journal/words";

/** The work the section belongs to, as its sheets need it. */
export type JournalItem = SheetItem;

/** The one sheet open over the section, if any. */
type Sheet = { kind: "log" } | { kind: "edit-read"; card: Card };

/** An entry with its date and pill printed on the server. */
export type CardEntry = ItemEntry & { written: string; pill: string | null };

/** A read with its status word and dates printed on the server. */
export type Card = Omit<ItemRead, "entries"> & {
  statusWord: string;
  dates: string | null;
  entries: CardEntry[];
};

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const STARS_FAILED = "Couldn't save that. Try again.";

// The page's text buttons, as drawn: dim words that light on hover.
const TEXT_BUTTON =
  "rounded text-[13px] text-dim outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The Journal section's heading row and cards (Ch 1.6 A5): each card's stars
 * a live control posting A3's `PATCH`. A click shows at once and rolls back
 * on a refusal; the page's own read replaces it once the read agrees.
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
  // Stars clicked but not yet read back from the server, by read id.
  const [clicked, setClicked] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [alerts, setAlerts] = useState<Record<string, string>>({});
  // A click gives way to the server's read only once the read agrees with
  // it: a refresh asked for after one click can render before the next click
  // commits, and would put the older stars back under the arrow keys.
  const [seen, setSeen] = useState(cards);
  if (seen !== cards) {
    setSeen(cards);
    setClicked((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id, stars]) => {
          const card = cards.find((c) => c.id === id);
          return card !== undefined && card.stars !== stars;
        }),
      ),
    );
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
    hold(card.id, true);
    setClicked((current) => ({ ...current, [card.id]: stars }));
    setAlerts((current) => forget(current, card.id));
    try {
      const response = await fetch(
        `/api/v1/occurrences/${card.id}`,
        json("PATCH", { stars }),
      );
      if (response.ok) {
        router.refresh();
      } else {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? STARS_FAILED);
      }
    } catch (error) {
      setClicked((current) => forget(current, card.id));
      setAlerts((current) => ({
        ...current,
        [card.id]: error instanceof Error ? error.message : STARS_FAILED,
      }));
    } finally {
      hold(card.id, false);
    }
  }

  /** A sheet saved: the page's read is the one to show now. */
  function saved() {
    setSheet(null);
    setClicked({});
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
            const stars = card.id in clicked ? clicked[card.id] : card.stars;
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
                    </div>
                    <p className="max-w-[62ch] text-sm whitespace-pre-line">
                      {entry.body}
                    </p>
                  </div>
                ))}
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
    </>
  );
}
