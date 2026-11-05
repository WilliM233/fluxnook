import Link from "next/link";
import type { ReactNode } from "react";
import { Thumb, TypePill } from "@/app/(app)/search/rows";
import { coverPublicUrl } from "@/lib/cover-url";

const printed = (type: string) => type === "book" || type === "comic";

/**
 * A row on Collection and on Shopping (A10, A11), as drawn: the thumb, the
 * work's title linking to its page, the type pill and the line, then whatever
 * else the page prints in dim, and what you can do with it at the right. On a
 * phone the actions go under the text.
 */
export function CollectionRow({
  testId,
  work,
  supabaseUrl,
  line,
  children,
  action,
}: {
  testId: string;
  work: {
    id: string;
    title: string;
    type: string;
    cover_path: string | null;
  };
  supabaseUrl: string;
  line: string;
  children?: ReactNode;
  action: ReactNode;
}) {
  return (
    <li
      data-testid={testId}
      data-item={work.id}
      className="flex flex-col gap-3 rounded-2xl border bg-card p-3.5 sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <Thumb
          size="shelf"
          src={work.cover_path && coverPublicUrl(supabaseUrl, work.cover_path)}
          empty={printed(work.type) ? "no cover" : "no poster"}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1 [overflow-wrap:anywhere]">
          <Link
            href={`/items/${work.id}`}
            className="font-heading text-lg leading-snug font-semibold hover:text-accent-hover"
          >
            {work.title}
          </Link>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <TypePill type={work.type} />
            <span
              data-testid="row-line"
              className="min-w-0 text-[15px] text-muted-foreground"
            >
              {line}
            </span>
          </div>
          {children}
        </div>
      </div>
      <div className="flex flex-none sm:justify-end">{action}</div>
    </li>
  );
}
