"use client";

import { useEffect, useRef } from "react";

/**
 * A sheet's hold, one shape in one place (House Rules step 3; Ch 1.8 A1).
 * While a write is out (`busy`) nothing closes the sheet: Cancel can't take the
 * write back, so it doesn't pretend to (1.7.2 B1, 1.7.3 B1). Words typed
 * (`typed`) close only on Cancel, since Escape or a stray click would throw a
 * paragraph away (1.6.2 S3). Props on `Dialog` wouldn't do: a sheet renders its
 * own Cancel, which never passes the dialog's `onOpenChange`, and that door is
 * where both misses were.
 *
 * `onClose` says whether a write was tried, since no answer isn't no write: a
 * post can land and lose its answer, and then the page may know better than the
 * sheet (1.7.3 S1). What goes into a field while a write is out isn't in the
 * write, and the good answer would close the sheet over it, so the fields hold
 * too (1.8.1 B3). A sheet mounts `<Dialog open {...hold.dialog}>`,
 * `<Button {...hold.cancel}>` and `<fieldset {...hold.fields}>`.
 */
export function useSheetHold({
  busy,
  typed = false,
  onClose,
}: {
  busy: boolean;
  typed?: boolean;
  onClose: (tried: boolean) => void;
}) {
  const held = busy;
  const tried = useRef(false);

  useEffect(() => {
    if (busy) tried.current = true;
  }, [busy]);

  return {
    dialog: {
      onOpenChange: (open: boolean) => {
        if (!open && !held && !typed) onClose(tried.current);
      },
    },
    cancel: { disabled: held, onClick: () => onClose(tried.current) },
    // A wrapper only: no group for a screen reader, no box on the page.
    fields: { disabled: held, role: "none", className: "contents" },
  };
}
