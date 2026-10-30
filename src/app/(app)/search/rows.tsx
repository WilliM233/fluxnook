import type { ReactNode } from "react";

export const typeLabel: Record<string, string> = {
  movie: "Film",
  film: "Film",
  tv: "TV",
  book: "Book",
  comic: "Comic",
  series: "Series",
};

export const sourceLabel: Record<string, string> = {
  letterboxd: "Letterboxd",
  tmdb: "TMDB",
  manual: "added by hand",
};

// A shelf row and a nook card's strip are the smallest (Ch 1.5).
const thumbSizes = {
  row: { box: "h-27 w-18", width: 72, height: 108 },
  sheet: { box: "h-21 w-14", width: 56, height: 84 },
  shelf: { box: "h-18 w-12", width: 48, height: 72 },
};

/** A poster or cover thumbnail, or a quiet box saying there is none. */
export function Thumb({
  src,
  size = "row",
  empty = "no poster",
}: {
  src: string | null;
  size?: "row" | "sheet" | "shelf";
  empty?: "no poster" | "no cover";
}) {
  const { box, width, height } = thumbSizes[size];
  return src ? (
    // biome-ignore lint/performance/noImgElement: plain img this chapter (next/image is a Deferral)
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      className={`${box} flex-none rounded-md bg-card object-cover`}
    />
  ) : (
    <div
      aria-hidden="true"
      className={`${box} flex flex-none items-center justify-center rounded-md border border-dashed border-line-strong text-[10px] text-dim`}
    >
      {empty}
    </div>
  );
}

/** One row of results or of the recent list, as the design draws it. */
export function Row({
  thumb,
  title,
  year,
  type,
  summary,
  line,
  status,
  action,
}: {
  thumb: string | null;
  title: string;
  year: number | null;
  type: string;
  summary?: string | null;
  // The second line when it isn't a summary: a book's author and editions.
  line?: ReactNode;
  status?: ReactNode;
  action: ReactNode;
}) {
  const printed = type === "book" || type === "comic" || type === "series";
  return (
    <li className="flex items-stretch gap-4 rounded-2xl border bg-card p-3.5">
      <Thumb src={thumb} empty={printed ? "no cover" : "no poster"} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span className="font-heading text-[22px] font-semibold">
            {title}
          </span>
          {year && <span className="text-muted-foreground">{year}</span>}
          <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            {typeLabel[type] ?? type}
          </span>
        </div>
        {summary && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {summary}
          </p>
        )}
        {line && <p className="text-[15px] text-muted-foreground">{line}</p>}
        {status && <div className="mt-auto text-[13px]">{status}</div>}
      </div>
      <div className="flex items-center">{action}</div>
    </li>
  );
}
