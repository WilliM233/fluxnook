"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type EntryForm,
  entryChange,
  entryPost,
  localFromIso,
  localNow,
} from "@/lib/journal/forms";
import { type AnchorKind, anchorKindsFor } from "@/lib/journal/words";
import { AnchorFields } from "./anchor-fields";
import { FieldError, HEADING, type SheetItem } from "./log-read-sheet";
import { NONE, type Refusal, refusalOf } from "./refusal";

/** An entry as Edit entry opens it. */
export type SheetEntry = {
  id: string;
  writtenAt: string;
  body: string;
  anchorKind: AnchorKind | null;
  anchorValue: string | null;
};

const DRAWN = ["body", "anchorKind", "anchorValue", "writtenAt"];
const FAILED = "Couldn't save the entry just now. Try again.";

/**
 * Add an entry and Edit entry (Ch 1.6 A7), one sheet on the Log sheet's
 * frame: the text, "Where in it", and when it was written, now unless you
 * say otherwise. The time is sent only when moved (`forms.ts`).
 */
export function EntrySheet({
  item,
  readId,
  entry,
  onSaved,
  onClose,
}: {
  item: Pick<SheetItem, "type" | "form">;
  readId: string;
  entry?: SheetEntry;
  onSaved: () => void;
  onClose: () => void;
}) {
  // The sheet opens on a click, so these run in the browser, in its zone.
  const [opened] = useState(() =>
    entry ? localFromIso(entry.writtenAt) : localNow(),
  );
  const [form, setForm] = useState<EntryForm>(() => ({
    body: entry?.body ?? "",
    anchorKind:
      entry?.anchorKind ?? anchorKindsFor(item.type, item.form)[0] ?? "",
    anchorValue: entry?.anchorValue ?? "",
    writtenAt: opened,
  }));
  const [refused, setRefused] = useState<Refusal>(NONE);
  const [busy, setBusy] = useState(false);
  const errors = refused.fields;
  // Words typed close only on Cancel: an overlay click or Escape would
  // throw a paragraph away without a word (1.6.2 Raccoon S3).
  const typed = form.body.trim() !== "" && form.body !== (entry?.body ?? "");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setRefused(NONE);
    const path = `/api/v1/occurrences/${readId}/entries`;
    try {
      const response = await fetch(entry ? `${path}/${entry.id}` : path, {
        method: entry ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          entry ? entryChange(form, opened) : entryPost(form),
        ),
      });
      if (response.ok) {
        onSaved();
        return;
      }
      setRefused(await refusalOf(response, DRAWN, FAILED));
    } catch {
      setRefused({ fields: {}, line: FAILED });
    }
    setBusy(false);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !typed && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto border border-line-strong p-7 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-[28px] leading-tight font-semibold">
            {entry ? "Edit entry" : "Add an entry"}
          </DialogTitle>
        </DialogHeader>

        <form noValidate onSubmit={save} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="entry-body" className={HEADING}>
              Entry
            </Label>
            <Textarea
              id="entry-body"
              rows={5}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              aria-invalid={errors.body ? true : undefined}
              aria-describedby={errors.body ? "entry-body-error" : undefined}
              className="min-h-32 rounded-[10px] bg-background px-3 py-2.5 text-base"
            />
            <FieldError id="entry-body" error={errors.body} />
            <AnchorFields
              id="entry-where"
              type={item.type}
              form={item.form}
              pin={form}
              onPin={(pin) => setForm({ ...form, ...pin })}
              errors={{
                anchorKind: errors.anchorKind,
                anchorValue: errors.anchorValue,
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="entry-written" className={HEADING}>
              Written
            </Label>
            <Input
              id="entry-written"
              type="datetime-local"
              step={60}
              value={form.writtenAt}
              onChange={(e) => setForm({ ...form, writtenAt: e.target.value })}
              aria-invalid={errors.writtenAt ? true : undefined}
              aria-describedby={
                errors.writtenAt ? "entry-written-error" : undefined
              }
              className="h-11 w-64 rounded-[10px] bg-background px-3"
            />
            <FieldError id="entry-written" error={errors.writtenAt} />
          </div>

          {refused.line && (
            <p role="alert" className="text-sm text-destructive">
              {refused.line}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t pt-5">
            <Button type="button" size="lg" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
