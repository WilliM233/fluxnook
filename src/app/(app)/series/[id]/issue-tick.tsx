"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ConfirmSheet } from "@/app/(app)/shelves/confirm-sheet";
import { goneIsDone, json } from "@/lib/api/request";
import { tickLabel, tileVia, untickSentence } from "@/lib/collection/lines";
import type { HeldCopy } from "@/lib/collection/owned";
import { asksFirst, newestFloppy } from "@/lib/collection/ticks";
import { useTickReport } from "./tick-line";

const FAILED = "Couldn't change that. Try again.";

/**
 * A tile's **Owned** box (A8). A tick posts one floppy; an untick asks A4 what
 * the issue holds now, so its rule runs on the copy as it stands, not as this
 * page last saw it, and lets the newest go, asking first when that copy has
 * words on it. One answer at a time: the box takes no second click until its
 * own refresh has landed, and until then it reads what it knows, so a
 * neighbour's refresh can't put it back. Disabled until hydrated: a native box
 * clicked before then shows a tick nothing posted.
 */
export function IssueTick({
  item,
  title,
  floppies,
  via,
}: {
  item: string;
  title: string;
  floppies: number;
  via: string | null;
}) {
  const router = useRouter();
  const report = useTickReport();
  const [refreshing, refresh] = useTransition();
  const [hydrated, setHydrated] = useState(false);
  const [wanted, setWanted] = useState<boolean | null>(null);
  const [known, setKnown] = useState<number | null>(null);
  const [settling, setSettling] = useState(false);
  const [asking, setAsking] = useState<HeldCopy | null>(null);
  // State lands a render late; this one stops a second click at once.
  const out = useRef(false);

  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    if (!settling || refreshing) return;
    setSettling(false);
    setKnown(null);
    out.current = false;
  }, [settling, refreshing]);

  const count = known ?? floppies;
  const ticked = wanted ?? count > 0;

  /** A good answer: the count moves now, and the page catches up behind it. */
  function settle(next: number) {
    report(false);
    setKnown(next);
    setWanted(null);
    refresh(() => router.refresh());
    setSettling(true);
  }

  function refuse() {
    setKnown(null);
    setWanted(null);
    report(true);
    out.current = false;
  }

  async function tick() {
    setWanted(true);
    try {
      const response = await fetch(
        "/api/v1/copies",
        json("POST", { item, format: "floppy" }),
      );
      if (response.ok) {
        settle(count + 1);
        return;
      }
    } catch {
      // Falls through to the line.
    }
    refuse();
  }

  const letGo = (copy: HeldCopy) =>
    goneIsDone(fetch(`/api/v1/copies/${copy.id}`, json("DELETE")));

  async function untick() {
    setWanted(false);
    try {
      const read = await fetch(`/api/v1/copies?item=${item}`);
      if (!read.ok) {
        refuse();
        return;
      }
      const { held } = (await read.json()) as { held: HeldCopy[] };
      const standing = held.filter((copy) => copy.format === "floppy").length;
      const newest = newestFloppy(held);
      if (!newest) {
        // Another tab let it go first: nothing to do but say so.
        settle(0);
        return;
      }
      if (asksFirst(newest)) {
        setKnown(standing);
        setWanted(null);
        setAsking(newest);
        return;
      }
      const response = await letGo(newest);
      if (response.ok) {
        settle(standing - 1);
        return;
      }
    } catch {
      // Falls through to the line.
    }
    refuse();
  }

  function toggle() {
    if (out.current) return;
    out.current = true;
    if (ticked) untick();
    else tick();
  }

  return (
    <>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
        <input
          type="checkbox"
          data-testid="tick"
          aria-label={`Owned, ${title}`}
          checked={ticked}
          disabled={!hydrated}
          aria-busy={wanted !== null || settling || refreshing || !!asking}
          onChange={toggle}
          className="size-4.5 flex-none accent-primary"
        />
        <span data-testid="tick-label">{tickLabel(count)}</span>
      </label>
      {via && (
        <span data-testid="tile-via" className="text-[13px] text-dim">
          {tileVia(via, ticked)}
        </span>
      )}
      {asking && (
        <ConfirmSheet
          title="Let go of this floppy?"
          sentence={untickSentence(asking)}
          confirm="Remove"
          failed={FAILED}
          send={() => letGo(asking)}
          onDone={() => {
            setAsking(null);
            settle(count - 1);
          }}
          onClose={() => {
            setAsking(null);
            setKnown(null);
            out.current = false;
          }}
        />
      )}
    </>
  );
}
