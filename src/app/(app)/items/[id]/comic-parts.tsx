import Link from "next/link";
import type { ItemPage } from "@/lib/catalog/item-page";

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

type Pill = { key: string; node: React.ReactNode };

const linkClass = "text-primary hover:text-accent-hover";

/**
 * A comic's facts beside the pill (A10): its series, a link to the series
 * page once attached, then Vol. n, the kind and #n, each when known.
 */
export function comicPills(
  item: ItemPage["item"],
  series: ItemPage["series"],
): Pill[] {
  const name = series ? (
    <Link href={`/series/${series.id}`} className={linkClass}>
      {series.name}
    </Link>
  ) : (
    item.series
  );
  const pills: (Pill | false | null | "")[] = [
    name && { key: "series", node: name },
    series?.volume != null && { key: "volume", node: `Vol. ${series.volume}` },
    item.series_kind && { key: "kind", node: capital(item.series_kind) },
    item.number !== null && { key: "number", node: `#${item.number}` },
  ];
  return pills.filter((pill): pill is Pill => Boolean(pill));
}

/**
 * Where an issue sits in its run: "<name>, Vol. n · #n of <count> ·
 * previous #m · next #m", the name and the neighbours as links.
 */
export function SeriesLine({
  series,
  number,
}: {
  series: NonNullable<ItemPage["series"]>;
  number: number | null;
}) {
  const parts: Pill[] = [
    {
      key: "name",
      node: (
        <Link href={`/series/${series.id}`} className={linkClass}>
          {[series.name, series.volume !== null && `Vol. ${series.volume}`]
            .filter(Boolean)
            .join(", ")}
        </Link>
      ),
    },
    {
      key: "of",
      node:
        number !== null
          ? `#${number} of ${series.count}`
          : `${series.count} in the run`,
    },
  ];
  if (series.previous) {
    parts.push({
      key: "previous",
      node: (
        <>
          previous{" "}
          <Link href={`/items/${series.previous.id}`} className={linkClass}>
            #{series.previous.number}
          </Link>
        </>
      ),
    });
  }
  if (series.next) {
    parts.push({
      key: "next",
      node: (
        <>
          next{" "}
          <Link href={`/items/${series.next.id}`} className={linkClass}>
            #{series.next.number}
          </Link>
        </>
      ),
    });
  }
  return (
    <span>
      {parts.map((part, i) => (
        <span key={part.key}>
          {i > 0 && " · "}
          {part.node}
        </span>
      ))}
    </span>
  );
}
