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
import { Textarea } from "@/components/ui/textarea";

export type ShelfWords = { name: string; description: string };

/**
 * A shelf's name and description (A6, A7): New shelf on the nook, Edit shelf
 * on the shelf page. `send` makes the call; a 2xx hands its body to
 * `onSaved`, anything else stays in the sheet with the route's words.
 */
export function ShelfSheet({
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
  initial: ShelfWords;
  submit: string;
  failed: string;
  send: (words: ShelfWords) => Promise<Response>;
  onSaved: (body: unknown) => void;
  onClose: (tried: boolean) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hold = useSheetHold({ busy, onClose });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await send({ name, description });
      const body = await response.json().catch(() => null);
      if (response.ok) {
        onSaved(body);
        return;
      }
      setFields(body?.error?.fields ?? {});
      if (!body?.error?.fields) setError(body?.error?.message ?? failed);
    } catch {
      setError(failed);
    }
    setBusy(false);
  }

  return (
    <Dialog open {...hold.dialog}>
      <DialogContent className="gap-5 border border-line-strong p-7 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-[28px] leading-tight font-semibold">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {lede}
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={save} className="flex flex-col gap-5">
          <fieldset {...hold.fields}>
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="shelf-name"
                className="text-[13px] font-semibold text-muted-foreground"
              >
                Name
              </Label>
              <Input
                id="shelf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={fields.name ? true : undefined}
                aria-describedby={fields.name ? "shelf-name-error" : undefined}
                className="h-11 rounded-[10px] bg-background px-3"
              />
              {fields.name && (
                <p
                  id="shelf-name-error"
                  className="text-[13px] text-destructive"
                >
                  {fields.name}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="shelf-description"
                className="text-[13px] font-semibold text-muted-foreground"
              >
                Description
              </Label>
              <Textarea
                id="shelf-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                aria-invalid={fields.description ? true : undefined}
                aria-describedby={
                  fields.description ? "shelf-description-error" : undefined
                }
                className="min-h-24 rounded-[10px] bg-background px-3"
              />
              {fields.description && (
                <p
                  id="shelf-description-error"
                  className="text-[13px] text-destructive"
                >
                  {fields.description}
                </p>
              )}
            </div>
          </fieldset>

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
