"use client";

import Link from "next/link";
import { useState } from "react";
import { type Added, AddToShelf } from "@/app/(app)/shelves/add-to-shelf";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/catalog/work-line";

const EMPTY: ReadonlyMap<string, number> = new Map();

/** "62 added", or "59 added, 3 already there" when the shelf held some (A11). */
export function resultLine({
  added,
  skipped,
}: Pick<Added, "added" | "skipped">) {
  return skipped > 0
    ? `${added} added, ${skipped} already there`
    : `${added} added`;
}

/**
 * Add the run to a shelf (A11's series part): every issue on the page, in
 * the page's order, through the item page's sheet. An issue a shelf holds
 * stays where it is, so a shelf row only says how many; what happened shows
 * beside the button with the way to the shelf.
 */
export function AddRun({
  series,
  issues,
}: {
  series: { name: string; volume: number | null };
  issues: string[];
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Added | null>(null);
  const name =
    series.volume !== null
      ? `${series.name}, Vol. ${series.volume}`
      : series.name;

  if (issues.length === 0) return null;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="ml-auto"
        onClick={() => setOpen(true)}
      >
        Add the run to a shelf
      </Button>
      {result && (
        <span
          role="status"
          className="basis-full text-sm text-muted-foreground"
        >
          {resultLine(result)} ·{" "}
          <Link
            href={`/shelves/${result.shelf.id}`}
            className="text-primary hover:text-accent-hover"
          >
            {result.shelf.name}
          </Link>
        </span>
      )}
      {open && (
        <AddToShelf
          title={`Add ${plural(issues.length, "issue")} to a shelf`}
          lede={`${name}, in cover-date order, after whatever is already there. An issue already on the shelf stays where it is.`}
          items={issues}
          held={EMPTY}
          submit={`Add ${plural(issues.length, "issue")}`}
          onAdded={(added) => {
            setOpen(false);
            setResult(added);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
