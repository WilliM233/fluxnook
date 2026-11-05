import Link from "next/link";
import type { ChipType } from "@/lib/collection/shopping";

const CHIPS: { type: ChipType; label: string }[] = [
  { type: "all", label: "All" },
  { type: "book", label: "Books" },
  { type: "comic", label: "Comics" },
  { type: "film", label: "Films" },
  { type: "tv", label: "TV" },
];

/** `/collection` under a chip; All is the bare page. */
export const chipHref = (type: ChipType) =>
  type === "all" ? "/collection" : `/collection?type=${type}`;

/**
 * The chip rail (A10): links, so a chip is a page you can keep. One drops the
 * `before` it was on, since a place in one list means nothing in another.
 */
export function ChipRail({ picked }: { picked: ChipType }) {
  return (
    <nav aria-label="Filter by type" className="flex flex-wrap gap-2">
      {CHIPS.map(({ type, label }) => (
        <Link
          key={type}
          href={chipHref(type)}
          aria-current={picked === type ? "page" : undefined}
          className={
            picked === type
              ? "rounded-full bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground"
              : "rounded-full border border-line-strong px-3.5 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground"
          }
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
