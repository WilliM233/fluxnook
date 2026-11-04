"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * A delete that asks once (A7): one sentence, Cancel, and a primary named
 * for what it does. `send` makes the call; a 2xx is `onDone`, anything else
 * stays in the sheet with the route's words. Once it's sent the sheet stays
 * until the answer: Cancel can't take back a delete in flight, so it doesn't
 * pretend to (1.7.2 Rummage B1).
 */
export function ConfirmSheet({
  title,
  sentence,
  confirm,
  failed,
  send,
  onDone,
  onClose,
}: {
  title: string;
  sentence: string;
  confirm: string;
  failed: string;
  send: () => Promise<Response>;
  onDone: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const response = await send();
      if (response.ok) {
        onDone();
        return;
      }
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? failed);
    } catch {
      setError(failed);
    }
    setBusy(false);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="gap-5 border border-line-strong p-7 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-[28px] leading-tight font-semibold">
            {title}
          </DialogTitle>
          <DialogDescription className="text-base text-muted-foreground">
            {sentence}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t pt-5">
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            variant="destructive"
            disabled={busy}
            onClick={go}
          >
            {confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
