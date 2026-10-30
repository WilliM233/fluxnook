import { plural } from "@/lib/catalog/work-line";

/**
 * A shelf's counts as its card, its page and a section heading print them
 * (A6, A7): the works always, every other part left out at zero (census C4).
 * A section's line has no sections part, so `sections` is left undefined.
 */
export function countsLine({
  works,
  done,
  skipped,
  sections,
}: {
  works: number;
  done: number;
  skipped: number;
  sections?: number;
}): string {
  return [
    plural(works, "work"),
    done > 0 && `${done} done`,
    skipped > 0 && `${skipped} skipped`,
    sections !== undefined && sections > 0 && plural(sections, "section"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The nook's line under its title, or what an empty nook says instead (A6). */
export function nookLine({
  shelves,
  works,
  done,
}: {
  shelves: number;
  works: number;
  done: number;
}): string {
  if (shelves === 0)
    return "No shelves yet. Make one and it stops being quiet.";
  return [
    `${shelves} ${shelves === 1 ? "shelf" : "shelves"}`,
    works > 0 && `${works} ${works === 1 ? "work" : "works"} on them`,
    done > 0 && `${done} done`,
  ]
    .filter(Boolean)
    .join(" · ");
}
