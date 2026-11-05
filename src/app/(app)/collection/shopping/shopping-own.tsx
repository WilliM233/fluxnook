"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Printing } from "@/lib/collection/sheet";
import { OwnCopySheet, type OwnItem } from "../own-copy-sheet";

/**
 * **I own this** at a Shopping row's end (A11): opens Own a copy for the work.
 * It holds through the page's refresh, so a row on its way out can't open a
 * second sheet. A Cancel reads the page again only after a post was tried: an
 * answer lost after the copy landed leaves the sheet's line standing and the page
 * knows better. A close puts the keyboard back here, so a long list doesn't start
 * over from the header (1.7.3 Rummage S5).
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
  const button = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  function saved() {
    setOpen(false);
    refresh(() => router.refresh());
  }

  function close(tried: boolean) {
    refocus.current = true;
    if (tried) saved();
    else setOpen(false);
  }

  // After the sheet is gone and the button is enabled again.
  useEffect(() => {
    if (refocus.current && !open && !refreshing) {
      refocus.current = false;
      button.current?.focus();
    }
  }, [open, refreshing]);

  return (
    <>
      <button
        ref={button}
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
          onClose={close}
          onSaved={saved}
        />
      )}
    </>
  );
}
