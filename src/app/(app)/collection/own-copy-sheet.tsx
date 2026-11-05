"use client";

import { useRef, useState } from "react";
import { FieldError } from "@/app/(app)/journal/log-read-sheet";
import { NONE, type Refusal, refusalOf } from "@/app/(app)/journal/refusal";
import { selectClass } from "@/app/(app)/search/isbn-card";
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
import { Textarea } from "@/components/ui/textarea";
import { conditions } from "@/db/vocabulary";
import { json } from "@/lib/api/request";
import {
  conditionLabel,
  formatLabel,
  type ItemType,
} from "@/lib/collection/formats";
import {
  type CopyFields,
  copyChange,
  copyPost,
  type Printing,
  printingOptions,
} from "@/lib/collection/sheet";
import { localToday } from "@/lib/journal/forms";

/** The work a copy is owned of, as the sheet needs it. */
export type OwnItem = {
  id: string;
  title: string;
  type: ItemType;
  form: string | null;
};

/** A copy as Edit this copy opens it. */
export type SheetCopy = {
  id: string;
  format: string;
  condition: string | null;
  acquiredOn: string | null;
  note: string;
};

const DRAWN = ["format", "condition", "acquiredOn", "note"];
const FIELD = "h-11 rounded-[10px] bg-background px-3";
const SELECT = `${selectClass} w-full`;

/**
 * Own a copy (Ch 1.7 A7), as drawn, and one component for every door: one
 * Format select listing the catalog's printings, then the formats it lacks,
 * so a pick posts either shape. Given a `copy` it is Edit this copy: Format
 * as text, Save. A refusal stays on the sheet: a 400 under its field, a 409
 * as its own line. Words typed close only on Cancel (1.6.2 Raccoon S3). Once a
 * write is out the sheet stays until the answer: Cancel can't take it back, so it
 * doesn't pretend to (1.7.2 Rummage B1, 1.7.3 B1). `onClose` says whether a post
 * was tried, since after one the page may know better than the sheet.
 */
export function OwnCopySheet({
  item,
  printings,
  copy,
  onSaved,
  onClose,
}: {
  item: OwnItem;
  printings: Printing[];
  copy?: SheetCopy;
  onSaved: () => void;
  onClose: (tried: boolean) => void;
}) {
  const { printed, lacking } = printingOptions(printings, item.type, item.form);
  const [choice, setChoice] = useState(
    () => printed[0]?.value ?? lacking[0]?.value ?? "",
  );
  const [opened] = useState<CopyFields>(() => ({
    condition: copy?.condition ?? "",
    acquiredOn: copy?.acquiredOn ?? "",
    note: copy?.note ?? "",
  }));
  const [fields, setFields] = useState(opened);
  const [refused, setRefused] = useState<Refusal>(NONE);
  const [busy, setBusy] = useState(false);
  const tried = useRef(false);
  const errors = refused.fields;
  const typed = fields.note.trim() !== (copy?.note ?? "").trim();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const change = copyChange(opened, fields);
    // A Save that changed nothing is done; the route would say "Nothing to change."
    if (copy && Object.keys(change).length === 0) {
      onSaved();
      return;
    }
    tried.current = true;
    setBusy(true);
    setRefused(NONE);
    const failed = `Couldn't ${copy ? "save" : "add"} that copy just now. Try again.`;
    try {
      const response = await (copy
        ? fetch(`/api/v1/copies/${copy.id}`, json("PATCH", change))
        : fetch(
            "/api/v1/copies",
            json("POST", copyPost(item.id, choice, fields)),
          ));
      if (response.ok) {
        // Busy stays on: the sheet is closing, so nothing posts twice.
        onSaved();
        return;
      }
      setRefused(await refusalOf(response, DRAWN, failed));
    } catch {
      setRefused({ fields: {}, line: failed });
    }
    setBusy(false);
  }

  return (
    <Dialog
      open
      onOpenChange={(next) =>
        !next && !typed && !busy && onClose(tried.current)
      }
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto border border-line-strong p-7 sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-[28px] leading-tight font-semibold">
            {copy ? "Edit this copy" : `Own a copy of ${item.title}`}
          </DialogTitle>
          <DialogDescription className="text-base text-muted-foreground">
            {copy
              ? "A copy's printing doesn't change. Remove it and own the right one."
              : "The format you hold. If the catalog has no printing in it yet, one is made for the copy."}
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={save} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              {copy ? (
                <>
                  <p className="text-sm leading-none font-medium">Format</p>
                  <p className="flex h-11 items-center text-base">
                    {formatLabel(copy.format)}
                  </p>
                </>
              ) : (
                <>
                  <Label htmlFor="copy-format">Format</Label>
                  <select
                    id="copy-format"
                    value={choice}
                    onChange={(e) => setChoice(e.target.value)}
                    aria-invalid={errors.format ? true : undefined}
                    aria-describedby={
                      errors.format ? "copy-format-error" : undefined
                    }
                    className={SELECT}
                  >
                    {printed.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                    {printed.length > 0 && lacking.length > 0 && (
                      <option disabled>──────────</option>
                    )}
                    {lacking.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <FieldError id="copy-format" error={errors.format} />
                </>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="copy-condition">Condition</Label>
              <select
                id="copy-condition"
                value={fields.condition}
                onChange={(e) =>
                  setFields({ ...fields, condition: e.target.value })
                }
                aria-invalid={errors.condition ? true : undefined}
                aria-describedby={
                  errors.condition ? "copy-condition-error" : undefined
                }
                className={SELECT}
              >
                <option value="" />
                {conditions.map((word) => (
                  <option key={word} value={word}>
                    {conditionLabel(word)}
                  </option>
                ))}
              </select>
              <FieldError id="copy-condition" error={errors.condition} />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:w-[calc(50%-0.5rem)]">
            <Label htmlFor="copy-acquired">Acquired</Label>
            <Input
              id="copy-acquired"
              type="date"
              max={localToday()}
              value={fields.acquiredOn}
              onChange={(e) =>
                setFields({ ...fields, acquiredOn: e.target.value })
              }
              aria-invalid={errors.acquiredOn ? true : undefined}
              aria-describedby={
                errors.acquiredOn ? "copy-acquired-error" : undefined
              }
              className={FIELD}
            />
            <FieldError id="copy-acquired" error={errors.acquiredOn} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="copy-note">Note</Label>
            <Textarea
              id="copy-note"
              rows={3}
              maxLength={2_000}
              placeholder="Where it came from, what's odd about it, anything the shelf should remember."
              value={fields.note}
              onChange={(e) => setFields({ ...fields, note: e.target.value })}
              aria-invalid={errors.note ? true : undefined}
              aria-describedby={errors.note ? "copy-note-error" : undefined}
              className="min-h-22 rounded-[10px] bg-background px-3 py-2.5 text-base"
            />
            <FieldError id="copy-note" error={errors.note} />
          </div>

          <p className="text-[13px] text-dim">
            A copy is yours alone. It stays private until Volume 2, when you can
            share a shelf by link.
          </p>

          {refused.line && (
            <p role="alert" className="text-sm text-destructive">
              {refused.line}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={busy}
              onClick={() => onClose(tried.current)}
            >
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              {copy ? "Save" : "Add it"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
