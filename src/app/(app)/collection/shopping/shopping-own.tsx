"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Printing } from "@/lib/collection/sheet";
import { OwnCopySheet, type OwnItem } from "../own-copy-sheet";

/**
 * **I own this** at a Shopping row's end (A11): opens Own a copy for the work.
 * It holds through the page's refresh, so a row on its way out can't open a
 * second sheet. On Cancel too, since an answer lost after the copy landed
 * leaves the sheet's line standing and the page knows better.
 */
export function ShoppingOwn({
  item,
  printings,
}: {
  item: OwnItem;
  printings: Printing[];
}) {
  const router = useRouter();
  const [refreshing, refresh] = useTransition();
  const [open, setOpen] = useState(false);

  function done() {
    setOpen(false);
    refresh(() => router.refresh());
  }

  return (
    <>
      <button
        type="button"
        aria-label={`I own this, ${item.title}`}
        disabled={refreshing}
        onClick={() => setOpen(true)}
        className="rounded text-sm font-medium text-primary outline-none hover:text-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      >
        I own this
      </button>
      {open && (
        <OwnCopySheet
          item={item}
          printings={printings}
          onClose={done}
          onSaved={done}
        />
      )}
    </>
  );
}
