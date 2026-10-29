import { and, eq, inArray, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { editionSources, editions, items } from "@/db/schema";
import type { CoverStore } from "@/lib/covers";
import { isbn10to13 } from "@/lib/isbn";
import {
  type EditionFormat,
  type OpenLibrary,
  type OpenLibraryEdition,
  type OpenLibraryWork,
  ProviderError,
  parseOpenLibraryEditionKey,
} from "@/lib/providers/openlibrary";
import {
  ConflictError,
  cacheWorkCover,
  itemForKey,
  KeyTaken,
  NotFoundError,
  openLibraryWork,
  writeBook,
} from "./import";
import { normalizeTitle } from "./normalize";

const openLibraryUrl = (key: string) => `https://openlibrary.org/${key}`;

/** An edition's title when it isn't one of its work's, folded; else null. */
function ownTitle(title: string, workTitles: (string | undefined)[]) {
  const folded = normalizeTitle(title);
  if (folded === "") return null;
  const same = workTitles.some((t) => t && normalizeTitle(t) === folded);
  return same ? null : title;
}

/** The ISBN-13s an edition is known by: its 13s, or its 10s converted when it has none. */
export function editionIsbns(edition: OpenLibraryEdition): string[] {
  const isbns = edition.isbn13.length
    ? edition.isbn13
    : edition.isbn10.map(isbn10to13);
  return [...new Set(isbns)];
}

/**
 * The catalog's edition behind an Open Library edition key or any of these
 * ISBNs, with its item, or null. An ISBN names one printing across the
 * catalog, whichever source brought it.
 */
export async function editionFor(
  db: Pick<Db, "select">,
  key: string,
  isbns: string[],
): Promise<{ editionId: string; itemId: string } | null> {
  const bySource = [
    and(eq(editionSources.source, "openlibrary"), eq(editionSources.key, key)),
  ];
  if (isbns.length) {
    bySource.push(
      and(
        eq(editionSources.source, "isbn"),
        inArray(editionSources.key, isbns),
      ),
    );
  }
  const [row] = await db
    .select({ editionId: editions.id, itemId: editions.item })
    .from(editionSources)
    .innerJoin(editions, eq(editions.id, editionSources.edition))
    .where(or(...bySource))
    .limit(1);
  return row ?? null;
}

export type EditionImport = {
  id: string;
  itemId: string;
  created: boolean;
};

/**
 * An Open Library edition into the catalog (A7). Idempotent first: an edition
 * whose key or any ISBN is already a source answers with it, nothing written.
 * Then, in one transaction, the work exactly as an item import would make or
 * attach it (`attachTo` passes through), and the printing under it with its
 * `openlibrary` source and an `isbn` source per ISBN-13. 409 when `attachTo`
 * already holds another Open Library work: the edition belongs elsewhere.
 * The work's cover after the commit; the edition's own is a Deferral.
 */
export async function importEditionFromOpenLibrary(
  db: Db,
  ol: OpenLibrary,
  covers: CoverStore | null,
  {
    key,
    format,
    attachTo,
  }: { key: string; format: EditionFormat; attachTo?: string },
): Promise<EditionImport> {
  if (!parseOpenLibraryEditionKey(key)) {
    throw new NotFoundError(`Not an Open Library edition key: ${key}`);
  }
  const known = await editionFor(db, key, []);
  if (known)
    return { id: known.editionId, itemId: known.itemId, created: false };

  let edition: OpenLibraryEdition;
  try {
    edition = await ol.edition(key);
  } catch (error) {
    if (error instanceof ProviderError && error.status === 404) {
      throw new NotFoundError(`Open Library has no ${key}.`);
    }
    throw error;
  }
  const isbns = editionIsbns(edition);
  const byIsbn = await editionFor(db, key, isbns);
  if (byIsbn) {
    return { id: byIsbn.editionId, itemId: byIsbn.itemId, created: false };
  }
  if (!edition.workKey) {
    throw new NotFoundError(`Open Library's ${key} names no work.`);
  }
  const workKey = edition.workKey;

  if (attachTo) {
    const [held] = await db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.id, attachTo));
    if (!held) throw new NotFoundError(`No item ${attachTo}.`);
    const holder = await itemForKey(db, "openlibrary", workKey);
    if (holder && holder !== attachTo) {
      throw new ConflictError(
        `That edition belongs to ${workKey}, which is another item.`,
      );
    }
  }

  // Twice at most: when another import wins the work's key mid-way, the
  // second pass finds the work held and puts the printing under it.
  for (let attempt = 0; ; attempt++) {
    const heldWork = await itemForKey(db, "openlibrary", workKey);
    const work: OpenLibraryWork | null = heldWork
      ? null
      : await openLibraryWork(ol, workKey);
    try {
      return await writeEdition(db, ol, covers, {
        key,
        format,
        attachTo,
        edition,
        isbns,
        workKey,
        heldWork,
        work,
      });
    } catch (error) {
      if (!(error instanceof KeyTaken)) throw error;
      const winner = await editionFor(db, key, isbns);
      if (winner) {
        return { id: winner.editionId, itemId: winner.itemId, created: false };
      }
      if (attempt > 0) throw error;
    }
  }
}

async function writeEdition(
  db: Db,
  ol: OpenLibrary,
  covers: CoverStore | null,
  {
    key,
    format,
    attachTo,
    edition,
    isbns,
    workKey,
    heldWork,
    work,
  }: {
    key: string;
    format: EditionFormat;
    attachTo?: string;
    edition: OpenLibraryEdition;
    isbns: string[];
    workKey: string;
    heldWork: string | null;
    work: OpenLibraryWork | null;
  },
): Promise<EditionImport> {
  const result = await db.transaction(async (tx) => {
    const { id: itemId } = work
      ? await writeBook(tx, work, attachTo)
      : { id: heldWork as string };
    if (attachTo && itemId !== attachTo) {
      throw new ConflictError(
        `That edition belongs to ${workKey}, which is another item.`,
      );
    }
    const [item] = await tx
      .select({ title: items.title })
      .from(items)
      .where(eq(items.id, itemId));
    const [row] = await tx
      .insert(editions)
      .values({
        item: itemId,
        format,
        // A printing titled as its work is that work; only a different
        // title, once folded, is the edition's own, on whichever path the
        // work arrived ('Salem's Lot is Salem's Lot, Rummage R5).
        title: ownTitle(edition.title, [work?.title, item.title]),
        releasedOn: edition.publishedOn,
        releasedPrecision: edition.publishedPrecision,
        publisher: edition.publisher,
        pages: edition.pages,
      })
      .returning({ id: editions.id });
    const sources = [
      { source: "openlibrary", key, url: openLibraryUrl(key) },
      ...isbns.map((isbn) => ({ source: "isbn", key: isbn, url: null })),
    ];
    const claimed = await tx
      .insert(editionSources)
      .values(sources.map((s) => ({ ...s, edition: row.id })))
      .onConflictDoNothing()
      .returning({ key: editionSources.key });
    // Another import holds the key or an ISBN: this one rolls back.
    if (claimed.length !== sources.length) throw new KeyTaken();
    return { id: row.id, itemId };
  });

  if (work) await cacheWorkCover(db, ol, covers, result.itemId, work);
  return { ...result, created: true };
}
