import Link from "next/link";
import type { ReactNode } from "react";
import { StripThumb } from "@/app/(app)/nook/shelf-card";
import { TypePill } from "@/app/(app)/search/rows";
import { workLine } from "@/lib/catalog/work-line";
import type { ShelfRow as Row } from "@/lib/shelves/shelf-page";

/**
 * One work on a shelf, as designed (A7): its shelf-wide number, the grip,
 * the cover, the title to the work's page, the type and its line, and at
 * the right the status control with Remove under it. Markup only: the
 * shelf view fills the grip and the aside.
 */
export function ShelfRow({
  row,
  supabaseUrl,
  grip,
  aside,
}: {
  row: Row;
  supabaseUrl: string;
  grip?: ReactNode;
  aside?: ReactNode;
}) {
  const skipped = row.status === "skipped";
  const line = workLine(row.item);
  return (
    <li
      data-testid="entry"
      className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-3.5"
    >
      <span className="w-8 flex-none text-right text-[13px] text-dim tabular-nums">
        {row.position}
      </span>
      {grip ?? <span aria-hidden="true" className="size-11 flex-none" />}
      <div className={skipped ? "opacity-60" : undefined}>
        <StripThumb cover={row.item} supabaseUrl={supabaseUrl} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Link
          href={`/items/${row.item.id}`}
          className={`font-heading text-[22px] leading-tight font-semibold hover:text-accent-hover ${skipped ? "text-dim line-through" : ""}`}
        >
          {row.item.title}
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <TypePill type={row.item.type} />
          {line && (
            <span className="text-[15px] text-muted-foreground">{line}</span>
          )}
        </div>
      </div>
      {aside && (
        <div className="ml-auto flex flex-col items-end gap-1.5">{aside}</div>
      )}
    </li>
  );
}
