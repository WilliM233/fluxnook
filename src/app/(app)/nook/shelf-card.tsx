import Link from "next/link";
import { Thumb } from "@/app/(app)/search/rows";
import { coverPublicUrl } from "@/lib/covers";
import { countsLine } from "@/lib/shelves/lines";
import type { NookShelf, StripCover } from "@/lib/shelves/nook-page";

const printed = (type: string) => type === "book" || type === "comic";

/** One slot of the strip: the cover, or the box that says there is none. */
export function StripThumb({
  cover,
  supabaseUrl,
}: {
  cover: StripCover;
  supabaseUrl: string;
}) {
  return (
    <Thumb
      size="shelf"
      src={cover.cover_path && coverPublicUrl(supabaseUrl, cover.cover_path)}
      empty={printed(cover.type) ? "no cover" : "no poster"}
    />
  );
}

/**
 * A shelf on the nook (A6): its name, its counts, where it came from, the
 * description in two lines, and the first five covers in shelf order.
 */
export function ShelfCard({
  shelf,
  supabaseUrl,
}: {
  shelf: NookShelf;
  supabaseUrl: string;
}) {
  const line = [
    countsLine(shelf),
    // The fixture's two King shelves carry their Letterboxd list's URL.
    shelf.sourceUrl && "from Letterboxd",
  ]
    .filter(Boolean)
    .join(" · ");
  const rest = shelf.works - shelf.covers.length;
  return (
    <li>
      <Link
        href={`/shelves/${shelf.id}`}
        className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-5 transition-colors hover:border-line-strong"
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-[22px] leading-tight font-semibold">
            {shelf.name}
          </h2>
          <p className="text-[13px] text-muted-foreground">{line}</p>
        </div>
        {shelf.description && (
          <p className="line-clamp-2 text-[15px] text-muted-foreground">
            {shelf.description}
          </p>
        )}
        {shelf.covers.length > 0 && (
          <div className="mt-auto flex items-center gap-2">
            {shelf.covers.map((cover, i) => (
              <StripThumb
                // The strip is the shelf's first five; order is the key.
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed positions
                key={i}
                cover={cover}
                supabaseUrl={supabaseUrl}
              />
            ))}
            {rest > 0 && (
              <span className="ml-1 text-sm text-dim">{`+${rest}`}</span>
            )}
          </div>
        )}
      </Link>
    </li>
  );
}
