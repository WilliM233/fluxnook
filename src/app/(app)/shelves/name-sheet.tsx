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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSheetHold } from "@/components/ui/sheet-hold";

/**
 * One name (A7): New section and Rename. `send` makes the call; a 2xx is
 * `onSaved`, anything else stays in the sheet with the route's words, a
 * 409's "already has a section named" included.
 */
export function NameSheet({
  title,
  lede,
  initial,
  submit,
  failed,
  send,
  onSaved,
  onClose,
}: {
  title: string;
  lede: string;
  initial: string;
  submit: string;
  failed: string;
  send: (name: string) => Promise<Response>;
  onSaved: () => void;
  onClose: (tried: boolean) => void;
}) {
  const [name, setName] = useState(initial);
  const [field, setField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hold = useSheetHold({ busy, onClose });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setField(null);
    setError(null);
    try {
      const response = await send(name);
      if (response.ok) {
        onSaved();
        return;
      }
      const body = await response.json().catch(() => null);
      if (body?.error?.fields?.name) setField(body.error.fields.name);
      else setError(body?.error?.message ?? failed);
    } catch {
      setError(failed);
    }
    setBusy(false);
  }

  return (
    <Dialog open {...hold.dialog}>
      <DialogContent className="gap-5 border border-line-strong p-7 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-[28px] leading-tight font-semibold">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {lede}
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={save} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="section-name"
              className="text-[13px] font-semibold text-muted-foreground"
            >
              Name
            </Label>
            <Input
              id="section-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={field ? true : undefined}
              aria-describedby={field ? "section-name-error" : undefined}
              className="h-11 rounded-[10px] bg-background px-3"
            />
            {field && (
              <p
                id="section-name-error"
                className="text-[13px] text-destructive"
              >
                {field}
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t pt-5">
            <Button type="button" size="lg" variant="outline" {...hold.cancel}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              {submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
