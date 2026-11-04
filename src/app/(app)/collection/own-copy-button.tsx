"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Printing } from "@/lib/collection/sheet";
import { OwnCopySheet, type OwnItem } from "./own-copy-sheet";

/** **Own a copy** (A6): the primary at the Editions heading's right, and its sheet. */
export function OwnCopyButton({
  item,
  printings,
}: {
  item: OwnItem;
  printings: Printing[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="lg" className="ml-auto" onClick={() => setOpen(true)}>
        Own a copy
      </Button>
      {open && (
        <OwnCopySheet
          item={item}
          printings={printings}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
