import Link from "next/link";
import { notFound } from "next/navigation";
import { serverDb } from "@/db/client";
import { workLine } from "@/lib/catalog/work-line";
import { anchorLabel } from "@/lib/journal/anchor";
import { nextCursor, parseCursor } from "@/lib/journal/cursor";
import { loadJournalPage } from "@/lib/journal/journal-page";
import {
  journalLede,
  readState,
  writtenLabel,
  writtenTime,
} from "@/lib/journal/lines";
import { starText } from "@/lib/journal/stars";
import { createClient } from "@/lib/supabase/server";
import { type DayGroup, JournalRows } from "./journal-rows";

/**
 * The Journal (Ch 1.6 A8): every entry of the caller's across every work,
 * newest first, 50 a page by keyset, under a label per day. Every string is
 * printed here, in the server's zone, so nothing differs at hydration; the
 * rows' Edit and Delete are the client's. A `before` that isn't a cursor is
 * the shell's not-found: a page has no 400 (census, C1).
 */
export default async function JournalPage({
  searchParams,
}: PageProps<"/journal">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The (app) layout has already sent anyone signed out to /.
  if (!user) notFound();

  const { before } = await searchParams;
  const cursor = before === undefined ? undefined : parseCursor(before);
  if (cursor === null) notFound();

  const { totals, rows, older } = await loadJournalPage(serverDb(), {
    userId: user.id,
    before: cursor,
  });

  const days: DayGroup[] = [];
  for (const { entry, read, work } of rows) {
    const day = writtenLabel(entry.writtenAt);
    if (days.at(-1)?.day !== day) days.push({ day, rows: [] });
    days[days.length - 1].rows.push({
      id: entry.id,
      readId: read.id,
      work: {
        id: work.id,
        title: work.title,
        type: work.type,
        form: work.form ?? null,
        line: workLine(work),
      },
      state: readState(work.type, read),
      star: read.stars === null ? null : starText(read.stars),
      pill:
        entry.anchorKind && entry.anchorValue
          ? anchorLabel(entry.anchorKind, entry.anchorValue)
          : null,
      time: writtenTime(entry.writtenAt),
      entry,
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-11">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-[34px] leading-tight font-normal">
          Journal
        </h1>
        <p className="text-muted-foreground">{journalLede(totals)}</p>
      </div>

      {days.length > 0 && <JournalRows days={days} />}

      {older && (
        <p className="flex flex-wrap items-baseline gap-3 text-sm">
          <Link
            href={`/journal?before=${nextCursor(older)}`}
            className="text-primary hover:text-accent-hover"
          >
            Older entries
          </Link>
          <span className="text-[13px] text-dim">
            50 a page, by date written.
          </span>
        </p>
      )}
    </main>
  );
}
