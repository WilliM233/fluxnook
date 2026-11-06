"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { json } from "@/lib/api/request";

const FAILED = "Couldn't add that copy just now. Try again.";

/**
 * **I own this** (A6): one click, one copy of this printing, no sheet. It
 * holds through the answer and the page's refresh, so a second click can't
 * make a second copy; two tabs each clicking are two copies, each meant. On a
 * refusal the control comes back with the line.
 */
export function OwnThis({ editionId }: { editionId: string }) {
  const router = useRouter();
  const [refreshing, refresh] = useTransition();
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  // State lands a render late; this one stops a second click at once.
  const out = useRef(false);

  async function own() {
    if (out.current) return;
    out.current = true;
    setSending(true);
    setFailed(false);
    try {
      const response = await fetch(
        "/api/v1/copies",
        json("POST", { edition: editionId }),
      );
      if (response.ok) {
        refresh(() => router.refresh());
        return;
      }
    } catch {
      // Falls through to the line.
    }
    out.current = false;
    setSending(false);
    setFailed(true);
  }

  return (
    <>
      <button
        type="button"
        disabled={sending || refreshing}
        onClick={own}
        className="rounded text-sm text-primary outline-none hover:text-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      >
        I own this
      </button>
      {failed && (
        <span role="alert" className="text-[13px] text-destructive">
          {FAILED}
        </span>
      )}
    </>
  );
}
