"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ContentRow } from "@/lib/catalog/contents-line";
import type { PickerComic } from "@/lib/catalog/item-page";
import { normalizeName } from "@/lib/catalog/normalize";
import { releasedLabel } from "@/lib/catalog/released";
import { formatLabel } from "./collected-in";

const REST = "One-shots and the rest";

/** The list cut into its series groups, in the order the page gave it. */
function groupsOf(comics: PickerComic[]) {
  const groups = new Map<string, PickerComic[]>();
  for (const comic of comics) {
    const label = comic.series ?? REST;
    groups.set(label, [...(groups.get(label) ?? []), comic]);
  }
  return [...groups];
}

/**
 * Edit contents on a collected comic's printing, and the picker it opens
 * (A11): the catalog's comics by series, the current contents ticked, Save
 * putting the ticked ones in list order. Nothing is fetched to fill it.
 */
export function ContentsEditor({
  editionId,
  format,
  current,
  comics,
}: {
  editionId: string;
  format: string;
  current: ContentRow[];
  comics: PickerComic[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const folded = normalizeName(query);
  const shown = useMemo(
    () =>
      folded
        ? comics.filter((c) =>
            normalizeName(`${c.series ?? ""} ${c.title}`).includes(folded),
          )
        : comics,
    [comics, folded],
  );

  function begin() {
    setTicked(new Set(current.map((row) => row.itemId)));
    setQuery("");
    setError(null);
    setOpen(true);
  }

  function toggle(id: string) {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(next);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/editions/${editionId}/contents`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: comics.filter((c) => ticked.has(c.id)).map((c) => c.id),
        }),
      });
      if (response.ok) {
        setOpen(false);
        router.refresh();
        return;
      }
      const body = await response.json().catch(() => null);
      setError(
        [400, 404, 409].includes(response.status) && body?.error?.message
          ? body.error.message
          : "Couldn't save just now. Try again.",
      );
    } catch {
      setError("Couldn't save just now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={begin}>
        Edit contents
      </Button>
      {open && (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent className="gap-5 border border-line-strong p-7 sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-heading text-[28px] leading-tight font-semibold">
                What does this {formatLabel(format).toLowerCase()} collect?
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Pick from the catalog's comics.
              </DialogDescription>
            </DialogHeader>

            <Input
              aria-label="A series or a title"
              placeholder="A series or a title"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <p className="text-[13px] text-dim">
              Showing {shown.length} of {comics.length}
            </p>

            <div className="flex max-h-[50vh] flex-col gap-4 overflow-y-auto pr-1">
              {groupsOf(shown).map(([label, rows]) => (
                <fieldset key={label} className="flex flex-col gap-1.5">
                  <legend className="mb-1.5 text-xs font-semibold tracking-wider text-dim uppercase">
                    {label}
                  </legend>
                  {rows.map((comic) => {
                    const on = ticked.has(comic.id);
                    return (
                      <label
                        key={comic.id}
                        className={`flex min-h-11 items-baseline gap-3 rounded-xl border px-3.5 py-2.5 ${on ? "border-primary" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(comic.id)}
                          className="size-4 self-center accent-primary"
                        />
                        {comic.number !== null && (
                          <span className="text-sm text-dim tabular-nums">
                            #{comic.number}
                          </span>
                        )}
                        <span className="font-heading text-lg font-semibold text-foreground">
                          {comic.title}
                        </span>
                        <span className="text-[13px] text-dim">
                          {releasedLabel(
                            comic.released_on,
                            comic.released_precision,
                          )}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ))}
            </div>

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
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button size="lg" disabled={busy} onClick={save}>
                Save contents
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
