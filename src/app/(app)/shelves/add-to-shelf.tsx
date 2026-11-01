"use client";

import { useEffect, useId, useState } from "react";
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
import { countsLine } from "@/lib/shelves/lines";
import type { ShelfListed } from "@/lib/shelves/list";

const NEW = "new";
const FAILED = "Couldn't add that just now. Try again.";
const UNREAD = "Couldn't read your shelves just now. Try again.";
const MADE =
  "The shelf was made; adding to it didn't take. Open it from your nook and try there.";

/** What an add did, for the page that opened the sheet. */
export type Added = {
  shelf: { id: string; name: string };
  added: number;
  skipped: number;
};

async function message(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return {
    text: (body?.error?.message as string | undefined) ?? fallback,
    fields: (body?.error?.fields ?? {}) as Record<string, string>,
  };
}

/**
 * Add to shelf (A10), and Add the run (A11) on the same frame: the caller's
 * shelves as radio rows, read when the sheet opens, the picked one's Into
 * beneath it, and "Or a new shelf", which makes the shelf and adds to it in
 * two calls. A shelf in `held` already holds the work and can't be picked;
 * otherwise `has` says how many of `items` a shelf holds, and adding them
 * again skips those (A5).
 */
export function AddToShelf({
  title,
  lede,
  items,
  held,
  submit,
  onAdded,
  onClose,
}: {
  title: string;
  lede: string;
  items: string[];
  held: ReadonlyMap<string, number>;
  submit: string;
  onAdded: (added: Added) => void;
  onClose: () => void;
}) {
  const ids = useId();
  const [shelves, setShelves] = useState<ShelfListed[] | null>(null);
  const [picked, setPicked] = useState("");
  const [into, setInto] = useState("");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A shelf "Or a new shelf" made whose add didn't take: a retry fills it
  // rather than making a second of the same name.
  const [made, setMade] = useState<{ id: string; name: string } | null>(null);

  const query =
    items.length === 1 ? `item=${items[0]}` : `items=${items.join(",")}`;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await fetch(`/api/v1/shelves?${query}`);
        if (!live) return;
        if (!response.ok) {
          setError((await message(response, UNREAD)).text);
          return;
        }
        const listed: ShelfListed[] = await response.json();
        if (!live) return;
        setShelves(listed);
        if (listed.length === 0) setPicked(NEW);
      } catch {
        if (live) setError(UNREAD);
      }
    })();
    return () => {
      live = false;
    };
  }, [query]);

  const shelf = shelves?.find((s) => s.id === picked);
  // A blank new name is the route's to refuse, so its sentence shows.
  const ready = !busy && (picked === NEW || shelf !== undefined);

  function pick(id: string) {
    setPicked(id);
    setInto("");
    setError(null);
  }

  async function makeShelf(): Promise<{ id: string; name: string } | null> {
    if (made) return made;
    const response = await fetch("/api/v1/shelves", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const refused = await message(response, FAILED);
      if (refused.fields.name) setNameError(refused.fields.name);
      else setError(refused.text);
      return null;
    }
    const { id } = await response.json();
    const fresh = { id: id as string, name: name.trim() };
    setMade(fresh);
    return fresh;
  }

  async function add() {
    setBusy(true);
    setError(null);
    setNameError(null);
    try {
      const target = picked === NEW ? await makeShelf() : shelf;
      if (!target) {
        setBusy(false);
        return;
      }
      const response = await fetch(`/api/v1/shelves/${target.id}/entries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, section: into || null }),
      });
      if (response.ok) {
        const { added, skipped } = await response.json();
        onAdded({
          shelf: { id: target.id, name: target.name },
          added,
          skipped,
        });
        return;
      }
      const refused = (await message(response, FAILED)).text;
      setError(picked === NEW ? `${MADE} ${refused}` : refused);
    } catch {
      setError(FAILED);
    }
    setBusy(false);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="gap-5 border border-line-strong p-7 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-[28px] leading-tight font-semibold">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {lede}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Which shelf
          </legend>
          {shelves === null && !error && (
            <p className="text-sm text-muted-foreground">
              Reading your shelves…
            </p>
          )}
          {shelves?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No shelves yet. Or a new shelf, below.
            </p>
          )}
          {shelves?.map((s) => {
            const at = held.get(s.id);
            const on = picked === s.id;
            const line =
              at !== undefined
                ? `Already on it, #${at}`
                : [
                    countsLine({
                      works: s.count,
                      done: 0,
                      skipped: 0,
                      sections: s.sections.length,
                    }),
                    s.has > 0 && `${s.has} of these already on it`,
                  ]
                    .filter(Boolean)
                    .join(" · ");
            return (
              <div key={s.id} className="flex flex-col gap-2.5">
                <label
                  data-testid="shelf-choice"
                  className={`flex min-h-11 items-center gap-3.5 rounded-xl border px-3.5 py-3 ${
                    at !== undefined
                      ? "opacity-60"
                      : on
                        ? "border-primary"
                        : "border-line-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${ids}-shelf`}
                    value={s.id}
                    checked={on}
                    disabled={at !== undefined}
                    onChange={() => pick(s.id)}
                    className="size-4 accent-primary"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-heading text-lg leading-tight font-semibold">
                      {s.name}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {line}
                    </span>
                  </span>
                </label>
                {on && s.sections.length > 0 && (
                  <div className="ml-8 flex flex-col gap-2">
                    <Label
                      htmlFor={`${ids}-into`}
                      className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                    >
                      Into
                    </Label>
                    <select
                      id={`${ids}-into`}
                      value={into}
                      onChange={(e) => setInto(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">At the end</option>
                      {s.sections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
          {shelves !== null && (
            <label className="inline-flex min-h-11 items-center gap-3.5 px-3.5 text-sm text-primary">
              <input
                type="radio"
                name={`${ids}-shelf`}
                value={NEW}
                checked={picked === NEW}
                onChange={() => pick(NEW)}
                className="size-4 accent-primary"
              />
              Or a new shelf
            </label>
          )}
          {picked === NEW && (
            <div className="ml-8 flex flex-col gap-2">
              <Label
                htmlFor={`${ids}-name`}
                className="text-[13px] font-semibold text-muted-foreground"
              >
                Name
              </Label>
              <Input
                id={`${ids}-name`}
                value={name}
                disabled={made !== null}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? `${ids}-name-error` : undefined}
                className="h-11 rounded-[10px] bg-background px-3"
              />
              {nameError && (
                <p
                  id={`${ids}-name-error`}
                  className="text-[13px] text-destructive"
                >
                  {nameError}
                </p>
              )}
            </div>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t pt-5">
          <Button size="lg" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" disabled={!ready} onClick={add}>
            {submit}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
