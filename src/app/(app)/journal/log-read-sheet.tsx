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
import { StarControl } from "@/components/ui/star-control";
import { Textarea } from "@/components/ui/textarea";
import type { occurrenceStatuses } from "@/db/vocabulary";
import {
  localToday,
  type Pin,
  type ReadForm,
  readChange,
  readPost,
} from "@/lib/journal/forms";
import {
  anchorKindsFor,
  type ItemType,
  verb,
  words,
} from "@/lib/journal/words";
import { AnchorFields } from "./anchor-fields";
import { NONE, type Refusal, refusalOf } from "./refusal";
import { WhereItStands } from "./where-it-stands";

type Status = (typeof occurrenceStatuses)[number];

/** The work a read is logged against. */
export type SheetItem = {
  id: string;
  title: string;
  type: ItemType;
  form: string | null;
};

// label-wide, as the drawing heads each block.
export const HEADING =
  "text-xs font-semibold tracking-wider text-muted-foreground uppercase";

const FIELD = "h-11 rounded-[10px] bg-background px-3";

const DRAWN = [
  "status",
  "startedOn",
  "finishedOn",
  "stars",
  "entry.body",
  "entry.anchorKind",
  "entry.anchorValue",
];

/** A field's error under it, tied to it for a screen reader. */
export function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={`${id}-error`} className="text-[13px] text-destructive">
      {error}
    </p>
  ) : null;
}

/** A read as Edit this read opens it. */
export type SheetRead = {
  id: string;
  status: Status;
  startedOn: string | null;
  finishedOn: string | null;
  stars: number | null;
};

/**
 * Log a read (Ch 1.6 A6), as drawn: where it stands, the dates, the stars
 * and a first entry if you like, posted as one write. Given a `read`, it is
 * Edit this read (A7): the same fields prefilled, no entry, Save. Finished
 * empties and greys while Reading is pressed, and comes back as it was when
 * it isn't. A refusal stays on the sheet: a 409 is its own line.
 */
export function LogReadSheet({
  item,
  read,
  onSaved,
  onClose,
}: {
  item: SheetItem;
  read?: SheetRead;
  onSaved: () => void;
  onClose: (tried: boolean) => void;
}) {
  const w = words(item.type);
  const [form, setForm] = useState<ReadForm>(() =>
    read
      ? {
          status: read.status,
          startedOn: read.startedOn ?? "",
          finishedOn: read.finishedOn ?? "",
          stars: read.stars,
        }
      : {
          status: "done",
          startedOn: "",
          finishedOn: localToday(),
          stars: null,
        },
  );
  const [body, setBody] = useState("");
  const [pin, setPin] = useState<Pin>(() => ({
    anchorKind: anchorKindsFor(item.type, item.form)[0] ?? "",
    anchorValue: "",
  }));
  const [refused, setRefused] = useState<Refusal>(NONE);
  const [busy, setBusy] = useState(false);
  const reading = form.status === "in_progress";
  const errors = refused.fields;
  const hold = useSheetHold({ busy, typed: body.trim() !== "", onClose });

  function pick(status: Status) {
    setForm((current) => ({
      ...current,
      status,
      // Out of Reading, an empty Finished wakes as today.
      finishedOn:
        status !== "in_progress" && !current.finishedOn
          ? localToday()
          : current.finishedOn,
    }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setRefused(NONE);
    const failed = `Couldn't ${read ? "save" : "log"} that ${verb(item.type)} just now. Try again.`;
    try {
      const response = await fetch(
        read ? `/api/v1/occurrences/${read.id}` : "/api/v1/occurrences",
        {
          method: read ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            read ? readChange(form) : readPost(item.id, form, { body, ...pin }),
          ),
        },
      );
      if (response.ok) {
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
    <Dialog open {...hold.dialog}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto border border-line-strong p-7 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-[28px] leading-tight font-semibold">
            {read ? w.editRead : w.logOf(item.title)}
          </DialogTitle>
          {!read && (
            <DialogDescription className="text-sm text-muted-foreground">
              {w.lede}
            </DialogDescription>
          )}
        </DialogHeader>

        <form noValidate onSubmit={save} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className={HEADING}>Where it stands</p>
            <WhereItStands
              type={item.type}
              status={form.status}
              onPick={pick}
            />
            <FieldError id="read-status" error={errors.status} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="read-started" className={HEADING}>
                Started
              </Label>
              <Input
                id="read-started"
                type="date"
                value={form.startedOn}
                onChange={(e) =>
                  setForm({ ...form, startedOn: e.target.value })
                }
                aria-invalid={errors.startedOn ? true : undefined}
                aria-describedby={
                  errors.startedOn ? "read-started-error" : undefined
                }
                className={FIELD}
              />
              <FieldError id="read-started" error={errors.startedOn} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="read-finished" className={HEADING}>
                Finished
              </Label>
              <Input
                id="read-finished"
                type="date"
                value={reading ? "" : form.finishedOn}
                disabled={reading}
                onChange={(e) =>
                  setForm({ ...form, finishedOn: e.target.value })
                }
                aria-invalid={errors.finishedOn ? true : undefined}
                aria-describedby={
                  errors.finishedOn ? "read-finished-error" : undefined
                }
                className={FIELD}
              />
              <FieldError id="read-finished" error={errors.finishedOn} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className={HEADING}>Stars</p>
            <StarControl
              label="Stars"
              clear
              value={form.stars}
              onChange={(stars) => setForm({ ...form, stars })}
            />
            <p className="text-[13px] text-dim">
              The left half of a star is the half. Arrow keys move a half step.
            </p>
            <FieldError id="read-stars" error={errors.stars} />
          </div>

          {!read && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="read-entry" className={HEADING}>
                A first entry, if you like
              </Label>
              <Textarea
                id="read-entry"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-invalid={errors["entry.body"] ? true : undefined}
                aria-describedby={
                  errors["entry.body"] ? "read-entry-error" : undefined
                }
                className="min-h-28 rounded-[10px] bg-background px-3 py-2.5 text-base"
              />
              <FieldError id="read-entry" error={errors["entry.body"]} />
              <AnchorFields
                id="read-entry-where"
                type={item.type}
                form={item.form}
                pin={pin}
                onPin={setPin}
                errors={{
                  anchorKind: errors["entry.anchorKind"],
                  anchorValue: errors["entry.anchorValue"],
                }}
              />
            </div>
          )}

          {refused.line && (
            <p role="alert" className="text-sm text-destructive">
              {refused.line}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t pt-5">
            <Button type="button" size="lg" variant="outline" {...hold.cancel}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              {read ? "Save" : "Log it"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
