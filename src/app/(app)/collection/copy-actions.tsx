"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmSheet } from "@/app/(app)/shelves/confirm-sheet";
import { TEXT_BUTTON } from "@/components/ui/text-button";
import { goneIsDone, json } from "@/lib/api/request";
import { OwnCopySheet, type OwnItem, type SheetCopy } from "./own-copy-sheet";

const KEEPS = "The printing stays in the catalog.";

/** What Remove says, the note's first line quoted when there is one (A6). */
function removeSentence(note: string): string {
  const first = note.split(/\r?\n/)[0].trim();
  return first ? `"${first}" goes with it. ${KEEPS}` : KEEPS;
}

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

  function done() {
    setSheet(null);
    router.refresh();
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
          // A second tab may have removed it (the sheet's 404): the page reads again.
          onClose={done}
        />
      )}
      {sheet === "remove" && (
        <ConfirmSheet
          title="Let go of this copy?"
          sentence={removeSentence(copy.note)}
          confirm="Remove"
          failed="Couldn't remove that copy just now. Try again."
          send={() =>
            goneIsDone(fetch(`/api/v1/copies/${copy.id}`, json("DELETE")))
          }
          onDone={done}
          onClose={() => setSheet(null)}
        />
      )}
    </span>
  );
}
