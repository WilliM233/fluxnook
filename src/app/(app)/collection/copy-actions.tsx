"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ConfirmSheet } from "@/app/(app)/shelves/confirm-sheet";
import { TEXT_BUTTON } from "@/components/ui/text-button";
import { goneIsDone, json } from "@/lib/api/request";
import { removeSentence } from "@/lib/collection/lines";
import { OwnCopySheet, type OwnItem, type SheetCopy } from "./own-copy-sheet";

/** **Edit** and **Remove** on a copy's line (A6): dim words, a sheet, one confirm. */
export function CopyActions({
  item,
  copy,
}: {
  item: OwnItem;
  copy: SheetCopy;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<"edit" | "remove" | null>(null);

  const removing = useRef(false);

  function done() {
    setSheet(null);
    router.refresh();
  }

  // After a post that didn't answer, the page may know better: a Remove can land
  // and lose its answer, and a second tab may have taken the copy (the sheet's 404).
  function close(tried: boolean) {
    if (tried) done();
    else setSheet(null);
  }

  return (
    <span className="ml-auto flex items-baseline gap-3.5">
      <button
        type="button"
        aria-label="Edit this copy"
        className={TEXT_BUTTON}
        onClick={() => setSheet("edit")}
      >
        Edit
      </button>
      <button
        type="button"
        aria-label="Remove this copy"
        className={TEXT_BUTTON}
        onClick={() => setSheet("remove")}
      >
        Remove
      </button>
      {sheet === "edit" && (
        <OwnCopySheet
          item={item}
          printings={[]}
          copy={copy}
          onSaved={done}
          onClose={close}
        />
      )}
      {sheet === "remove" && (
        <ConfirmSheet
          title="Let go of this copy?"
          sentence={removeSentence(copy.note)}
          confirm="Remove"
          failed="Couldn't remove that copy just now. Try again."
          send={() => {
            removing.current = true;
            return goneIsDone(
              fetch(`/api/v1/copies/${copy.id}`, json("DELETE")),
            );
          }}
          onDone={done}
          onClose={() => close(removing.current)}
        />
      )}
    </span>
  );
}
