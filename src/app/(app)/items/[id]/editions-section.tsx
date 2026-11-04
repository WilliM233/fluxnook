import { CopyActions } from "@/app/(app)/collection/copy-actions";
import { OwnCopyButton } from "@/app/(app)/collection/own-copy-button";
import type { OwnItem } from "@/app/(app)/collection/own-copy-sheet";
import { OwnThis } from "@/app/(app)/collection/own-this";
import { contentsLine } from "@/lib/catalog/contents-line";
import type { ItemPage, PickerComic } from "@/lib/catalog/item-page";
import { BACKUP_ONLY, formatLabel } from "@/lib/collection/formats";
import {
  copyLine,
  editionsHeading,
  yoursViaText,
} from "@/lib/collection/lines";
import type { Ownership } from "@/lib/collection/owned";
import { ContentsEditor } from "./contents-editor";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

const CLOSING =
  "A printing the catalog knows about, and the copies of it you hold. Own a copy takes a format the catalog doesn't list yet.";

/** A printing's quiet line: publisher · year · pages, or a comic's issue count. */
function editionLine(edition: ItemPage["editions"][number]): string {
  return [
    edition.publisher,
    edition.released_on?.slice(0, 4),
    edition.pages !== null && plural(edition.pages, "page"),
    edition.contents > 0 && plural(edition.contents, "issue"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** What a backup's section says instead of owning anything (A6). */
function BackupNote({ ownership }: { ownership: Ownership }) {
  const via = ownership.via[0];
  return (
    <>
      <p className="text-sm text-muted-foreground">{BACKUP_ONLY}</p>
      {via && ownership.host && (
        <p className="text-sm text-dim">
          {yoursViaText(ownership.host.title, via.format)}
        </p>
      )}
    </>
  );
}

/**
 * The item page's Editions (A6), on every type: each printing as 1.3 and 1.4
 * built it, ending in I own this when the caller holds none of it, and under a
 * held one a line per copy. A backup is owned through what prints it, so its
 * section owns nothing.
 */
export function EditionsSection({
  item,
  editions,
  ownership,
  picker,
}: {
  item: OwnItem;
  editions: ItemPage["editions"];
  ownership: Ownership;
  /** A collected comic's printings say what they hold and take the picker (A10, A11). */
  picker: PickerComic[] | null;
}) {
  const backup = item.form === "backup";
  const heading = backup
    ? null
    : editionsHeading(
        editions.length,
        editions.reduce((sum, e) => sum + e.copies.length, 0),
      );

  return (
    <section
      aria-labelledby="editions"
      className="flex flex-col gap-3 border-t pt-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="editions" className="font-heading text-[22px] font-semibold">
            Editions
          </h2>
          {heading && <p className="text-[13px] text-dim">{heading}</p>}
        </div>
        {!backup && <OwnCopyButton item={item} printings={editions} />}
      </div>

      {backup && <BackupNote ownership={ownership} />}

      {editions.length === 0
        ? !backup && (
            <p className="text-sm text-muted-foreground">
              None in the catalog yet.
            </p>
          )
        : editions.length > 0 && (
            <ul className="flex flex-col gap-2">
              {editions.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-3"
                >
                  <span className="font-heading text-lg font-semibold text-foreground">
                    {formatLabel(e.format)}
                  </span>
                  <span className="sr-only"> · </span>
                  <span className="text-sm text-muted-foreground">
                    {[e.title, editionLine(e)].filter(Boolean).join(" · ")}
                  </span>
                  {e.isbn && (
                    <span className="text-sm text-dim tabular-nums">
                      ISBN {e.isbn}
                    </span>
                  )}
                  <span className="ml-auto flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    {!backup && e.copies.length === 0 && (
                      <OwnThis editionId={e.id} />
                    )}
                    {e.openlibrary_url && (
                      <a
                        href={e.openlibrary_url}
                        rel="noreferrer"
                        className="text-sm text-primary hover:text-accent-hover"
                      >
                        Open Library
                      </a>
                    )}
                    {e.comicvine_url && (
                      <a
                        href={e.comicvine_url}
                        rel="noreferrer"
                        className="text-sm text-primary hover:text-accent-hover"
                      >
                        Comic Vine
                      </a>
                    )}
                  </span>
                  {picker && (
                    <span className="flex basis-full flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">
                        Contents:{" "}
                        {contentsLine(e.contentsRows) || "Nothing yet"}
                      </span>
                      <ContentsEditor
                        editionId={e.id}
                        format={e.format}
                        current={e.contentsRows}
                        comics={picker}
                      />
                    </span>
                  )}
                  {e.copies.map((copy) => {
                    const line = copyLine(copy);
                    return (
                      <span
                        key={copy.id}
                        data-testid="copy"
                        className="flex basis-full flex-wrap items-baseline gap-x-3.5 gap-y-1 border-t pt-2.5 text-sm"
                      >
                        <span className="text-primary">Your copy</span>
                        {line && (
                          <span className="text-muted-foreground">{line}</span>
                        )}
                        {copy.note && (
                          <span className="whitespace-pre-line text-dim">
                            {copy.note}
                          </span>
                        )}
                        <CopyActions item={item} copy={copy} />
                      </span>
                    );
                  })}
                </li>
              ))}
            </ul>
          )}

      {!backup && <p className="text-sm text-dim">{CLOSING}</p>}
    </section>
  );
}
