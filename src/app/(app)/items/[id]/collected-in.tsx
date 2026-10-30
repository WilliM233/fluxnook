import Link from "next/link";
import {
  type ContentsLineOptions,
  contentsLine,
} from "@/lib/catalog/contents-line";
import type { CollectedIn as CollectedInRow } from "@/lib/catalog/item-page";

const formatWords: Record<string, string> = { tpb: "Trade paperback" };

/** An edition format as a person says it: Hardcover, Trade paperback. */
export function formatLabel(format: string): string {
  return (
    formatWords[format] ?? format.charAt(0).toUpperCase() + format.slice(1)
  );
}

/**
 * The editions whose contents hold this page's comic or run (A9, A10): the
 * collected item's title, then "<format> · <year> · <what it holds>".
 */
export function CollectedIn({
  rows,
  line,
  empty,
  note,
}: {
  rows: CollectedInRow[];
  line: ContentsLineOptions;
  empty: string;
  note: string;
}) {
  return (
    <section
      aria-labelledby="collected-in"
      className="flex flex-col gap-3 border-t pt-6"
    >
      <h2 id="collected-in" className="font-heading text-[22px] font-semibold">
        Collected in
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul aria-label="Collected in" className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.editionId}
              className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-xl border bg-card px-4 py-3"
            >
              <Link
                href={`/items/${row.itemId}`}
                className="font-heading text-lg font-semibold text-foreground hover:text-accent-hover"
              >
                {row.title}
              </Link>
              <span className="sr-only"> · </span>
              <span className="text-sm text-muted-foreground">
                {[
                  formatLabel(row.format),
                  row.released_on?.slice(0, 4),
                  contentsLine(row.contents, line),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-dim">{note}</p>
    </section>
  );
}
