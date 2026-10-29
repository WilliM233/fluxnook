"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  SeriesGroup,
  SeriesGroupOption,
  SeriesStatus,
} from "@/lib/catalog/match";
import type { ComicVineSeries } from "@/lib/providers/comicvine";
import { selectClass } from "./isbn-card";
import { Thumb } from "./rows";

export type SeriesFormat = "hardcover" | "tpb" | "omnibus";

/** What the sheet posts to `/api/v1/series/import`, less the key. */
export type SeriesChoice = {
  form: "issue" | "collected";
  format?: SeriesFormat;
  attachTo?: { series: string } | { collected: string };
};

const formats: { value: SeriesFormat; label: string }[] = [
  { value: "hardcover", label: "Hardcover" },
  { value: "tpb", label: "Trade paperback" },
  { value: "omnibus", label: "Omnibus" },
];

// A volume named like a run of trades starts on Collected editions (A8).
const COLLECTED_WORDS = /\b(collection|omnibus|compendium|library|trade)\b/i;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const size = (g: Pick<SeriesGroup, "group" | "count">) =>
  g.group === "collected"
    ? plural(g.count, "collected edition")
    : plural(g.count, "issue");
const pick = (g: Pick<SeriesGroup, "group" | "label">) =>
  g.group === "collected" ? { collected: g.label } : { series: g.label };

/**
 * Adding a Comic Vine series (A8): what its issues are, and whether it is a
 * run you already added by hand. On a match the sheet shows the group the
 * search found, Same or Different; on a new row a quiet select offers every
 * hand-entered run, since Comic Vine names some of them in ways no fold
 * reaches. The server holds the rules; the sheet only asks.
 */
export function SeriesSheet({
  result,
  cover,
  groups,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  result: ComicVineSeries & { catalog: SeriesStatus };
  cover: string | null;
  groups: SeriesGroupOption[];
  busy: boolean;
  error: string | null;
  onSubmit: (choice: SeriesChoice) => void;
  onClose: () => void;
}) {
  const ids = useId();
  const [form, setForm] = useState<"issue" | "collected">(
    COLLECTED_WORDS.test(result.name) ? "collected" : "issue",
  );
  const [format, setFormat] = useState<SeriesFormat>("hardcover");
  const [picked, setPicked] = useState("");
  const catalog = result.catalog;
  const candidates = catalog.status === "match" ? catalog.candidates : [];
  const collected = form === "collected";
  const options = groups.filter((g) => collected || g.group === "series");
  const choice = (attachTo?: SeriesChoice["attachTo"]): SeriesChoice => ({
    form,
    ...(collected ? { format } : {}),
    ...(attachTo ? { attachTo } : {}),
  });
  const chosen = options.find((g) => `${g.group}:${g.label}` === picked);

  function chooseForm(next: "issue" | "collected") {
    setForm(next);
    // A stem names collected editions; single issues can't attach to one.
    if (next === "issue" && picked.startsWith("collected:")) setPicked("");
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 border border-line-strong p-7 sm:max-w-2xl">
        <DialogHeader>
          <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Adding from Comic Vine
          </span>
          <DialogTitle className="font-heading text-[28px] leading-tight font-semibold">
            {candidates.length
              ? "Is this one already in your catalog?"
              : "Add this series"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            The series and every issue Comic Vine lists for it come in together.{" "}
            {candidates.length
              ? "If it's a run you added by hand, Comic Vine's details and covers go onto those issues instead of making a second set."
              : "If you added it by hand under another name, say which run and the issues join it."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <section
            aria-label="From Comic Vine"
            className="flex flex-col gap-2.5 rounded-xl border bg-background p-3.5"
          >
            <span className="text-[11px] font-semibold tracking-widest text-dim uppercase">
              From Comic Vine
            </span>
            <div className="flex gap-3">
              <Thumb src={cover} size="sheet" empty="no cover" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-heading text-[19px] font-semibold">
                  {result.name}
                </span>
                <span className="text-sm text-muted-foreground">
                  {[
                    result.year,
                    result.publisher,
                    result.issueCount !== null &&
                      plural(result.issueCount, "issue"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            </div>
          </section>
          {candidates.map((c) => (
            <section
              key={`${c.group}:${c.label}`}
              aria-label="In your catalog"
              className="flex flex-col gap-2.5 rounded-xl border border-primary bg-background p-3.5"
            >
              <span className="text-[11px] font-semibold tracking-widest text-primary uppercase">
                In your catalog
              </span>
              <span className="font-heading text-[19px] font-semibold">
                {c.label}
              </span>
              <span className="text-sm text-muted-foreground">
                {[
                  `${size(c)} added by hand`,
                  c.earliest !== null && `first issue ${c.earliest}`,
                  c.shelf && `on ${c.shelf}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {candidates.length > 1 && (
                <Button
                  size="lg"
                  disabled={busy || (c.group === "collected" && !collected)}
                  onClick={() => onSubmit(choice(pick(c)))}
                >
                  Same, add Comic Vine's details to this one
                </Button>
              )}
            </section>
          ))}
        </div>

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 text-sm font-semibold">
            What are these?
          </legend>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {(
              [
                ["issue", "Single issues"],
                ["collected", "Collected editions"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="inline-flex min-h-11 items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  name={`${ids}-form`}
                  value={value}
                  checked={form === value}
                  onChange={() => chooseForm(value)}
                  className="size-4 accent-primary"
                />
                {label}
              </label>
            ))}
            {collected && (
              <label className="inline-flex items-center gap-2 text-sm">
                Format
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as SeriesFormat)}
                  className={selectClass}
                >
                  {formats.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </fieldset>

        {candidates.length === 0 && (
          <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            Same as a run you added by hand?
            <select
              value={chosen ? picked : ""}
              onChange={(e) => setPicked(e.target.value)}
              className={selectClass}
            >
              <option value="">No</option>
              {options.map((g) => (
                <option
                  key={`${g.group}:${g.label}`}
                  value={`${g.group}:${g.label}`}
                >
                  {g.label}, {size(g)}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          {candidates.length === 1 && (
            <Button
              size="lg"
              disabled={
                busy || (candidates[0].group === "collected" && !collected)
              }
              onClick={() => onSubmit(choice(pick(candidates[0])))}
            >
              Same, add Comic Vine's details to it
            </Button>
          )}
          {candidates.length > 0 ? (
            <Button
              size="lg"
              variant="outline"
              disabled={busy}
              onClick={() => onSubmit(choice())}
            >
              Different, add as a new run
            </Button>
          ) : (
            <Button
              size="lg"
              disabled={busy}
              onClick={() => onSubmit(choice(chosen && pick(chosen)))}
            >
              Add
            </Button>
          )}
          <Button
            size="lg"
            variant="ghost"
            className="ml-auto text-muted-foreground"
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
        {candidates.some((c) => c.group === "collected") && !collected && (
          <p className="text-[13px] text-dim">
            A run of collected editions attaches as collected editions; choose
            that above to add it to the one you have.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
