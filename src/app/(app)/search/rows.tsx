import type { ReactNode } from "react";

export const typeLabel: Record<string, string> = {
  movie: "Film",
  film: "Film",
  tv: "TV",
  book: "Book",
  comic: "Comic",
};

export const sourceLabel: Record<string, string> = {
  letterboxd: "Letterboxd",
  tmdb: "TMDB",
  manual: "added by hand",
};

/** A poster thumbnail, or a quiet box where there is none. */
export function Thumb({
  src,
  size = "row",
}: {
  src: string | null;
  size?: "row" | "sheet";
}) {
  const box = size === "row" ? "h-27 w-18" : "h-21 w-14";
  return src ? (
    // biome-ignore lint/performance/noImgElement: plain img this chapter (next/image is a Deferral)
    <img
      src={src}
      alt=""
      width={size === "row" ? 72 : 56}
      height={size === "row" ? 108 : 84}
      className={`${box} flex-none rounded-md bg-card object-cover`}
    />
  ) : (
    <div
      aria-hidden="true"
      className={`${box} flex flex-none items-center justify-center rounded-md border border-dashed border-line-strong text-[10px] text-dim`}
    >
      no poster
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
  status,
  action,
}: {
  thumb: string | null;
  title: string;
  year: number | null;
  type: string;
  summary?: string | null;
  status?: ReactNode;
  action: ReactNode;
}) {
  return (
    <li className="flex items-stretch gap-4 rounded-2xl border bg-card p-3.5">
      <Thumb src={thumb} />
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
        {status && <div className="mt-auto text-[13px]">{status}</div>}
      </div>
      <div className="flex items-center">{action}</div>
    </li>
  );
}
