"use client";

import Link from "next/link";
import { useState } from "react";
import { selectClass } from "@/app/(app)/search/isbn-card";
import { TypePill } from "@/app/(app)/search/rows";
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
import { normalizeName } from "@/lib/catalog/normalize";
import {
  matchesFind,
  type PickerWork,
  pickerLine,
} from "@/lib/catalog/picker-works";
import { plural } from "@/lib/catalog/work-line";

/** The most rows the sheet shows at once; the box narrows the rest. */
const SHOWN = 50;

const FAILED = "Couldn't add those just now. Try again.";

/**
 * Add works (A11): the caller's catalog with a Find box and an Into select.
 * A work already on the shelf is ticked, disabled and says where it is; the
 * new ticks go on in list order. The list came with the page: nothing is
 * fetched.
 */
export function AddWorks({
  shelf,
  sections,
  held,
  works,
  onAdded,
  onClose,
}: {
  shelf: { id: string; name: string };
  sections: { id: string; name: string }[];
  held: ReadonlyMap<string, number>;
  works: PickerWork[];
  onAdded: () => void;
  onClose: (tried: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [into, setInto] = useState("");
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hold = useSheetHold({ busy, onClose });

  const folded = normalizeName(query);
  const matched = works.filter((work) => matchesFind(work, folded));
  const shown = matched.slice(0, SHOWN);

  function toggle(id: string) {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(next);
  }

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/shelves/${shelf.id}/entries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // In list order, whatever order they were ticked in.
          items: works.filter((w) => ticked.has(w.id)).map((w) => w.id),
          section: into || null,
        }),
      });
      if (response.ok) {
        onAdded();
        return;
      }
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? FAILED);
    } catch {
      setError(FAILED);
    }
    setBusy(false);
  }

  return (
    <Dialog open {...hold.dialog}>
      <DialogContent className="gap-5 border border-line-strong p-7 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-[28px] leading-tight font-semibold">
            Add works to {shelf.name}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Pick from your catalog. Not there yet?{" "}
            {/* A link is a door out too: no leaving over a post (1.8.1 B1). */}
            {busy ? (
              "Search the providers"
            ) : (
              <Link
                href="/search"
                className="text-primary hover:text-accent-hover"
              >
                Search the providers
              </Link>
            )}{" "}
            and come back.
          </DialogDescription>
        </DialogHeader>

        <fieldset {...hold.fields}>
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="find-works"
              className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
              Find
            </Label>
            <Input
              id="find-works"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 rounded-[10px] bg-background px-3"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="into-section"
              className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
              Into
            </Label>
            <select
              id="into-section"
              value={into}
              onChange={(e) => setInto(e.target.value)}
              className={selectClass}
            >
              {/* With sections, the unsectioned works sit above the first one,
                so "end" would point the wrong way. */}
              <option value="">
                {sections.length > 0 ? "No section" : "At the end"}
              </option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </div>

          <p className="text-[13px] text-dim">
            Showing {shown.length} of {works.length}. The ones already on this
            shelf are ticked and stay put.
          </p>

          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-1">
            {shown.map((work) => {
              const at = held.get(work.id);
              const on = at !== undefined || ticked.has(work.id);
              const line = pickerLine(work);
              return (
                <label
                  key={work.id}
                  data-testid="pick"
                  className={`flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3.5 py-2.5 ${
                    at !== undefined ? "opacity-60" : on ? "border-primary" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={at !== undefined}
                    onChange={() => toggle(work.id)}
                    className="size-4 accent-primary"
                  />
                  <span
                    data-testid="pick-title"
                    className="font-heading text-[22px] leading-tight font-semibold text-foreground"
                  >
                    {work.title}
                  </span>
                  <TypePill type={work.type} />
                  {line && (
                    <span
                      data-testid="pick-line"
                      className="text-[15px] text-muted-foreground"
                    >
                      {line}
                    </span>
                  )}
                  {at !== undefined && (
                    <span className="text-[13px] text-dim">
                      on this shelf, #{at}
                    </span>
                  )}
                </label>
              );
            })}
            {matched.length > shown.length && (
              <p className="text-[13px] text-dim">Narrow it to see the rest.</p>
            )}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2.5 border-t pt-5">
          <span className="text-sm text-muted-foreground">
            {ticked.size} picked
          </span>
          <Button
            size="lg"
            variant="outline"
            className="ml-auto"
            {...hold.cancel}
          >
            Cancel
          </Button>
          <Button size="lg" disabled={busy || ticked.size === 0} onClick={add}>
            Add {plural(ticked.size, "work")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
