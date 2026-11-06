import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  franchiseSources,
  franchises,
  itemBooks,
  itemFilms,
  itemFranchises,
  itemSources,
  items,
  itemTv,
} from "@/db/schema";
import type { releasedPrecisions } from "@/db/vocabulary";
import type { CoverStore } from "@/lib/covers";
import {
  type OpenLibrary,
  type OpenLibraryWork,
  parseOpenLibraryWorkKey,
} from "@/lib/providers/openlibrary";
import {
  ProviderError,
  parseTmdbKey,
  type Tmdb,
  type TmdbItem,
} from "@/lib/providers/tmdb";
import { type MatchRow, matchRow, sameWork } from "./match";

/** No such item here, or no such key at the provider. */
export class NotFoundError extends Error {}

/** The attach target can't take this key: it has that provider's source, or is another work. */
export class ConflictError extends Error {}

/** Thrown inside a transaction when another import won the key first. */
export class KeyTaken extends Error {}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const precisionRank = { year: 0, month: 1, day: 2 } as const;
const COVER_LIMIT = 5 * 1024 * 1024;
const COVER_TIMEOUT_MS = 10_000;

const tmdbUrl = (key: string) => `https://www.themoviedb.org/${key}`;
const openLibraryUrl = (key: string) => `https://openlibrary.org/${key}`;

/** What an import writes onto an item it attaches to, when the item lacks it. */
type Fills = {
  summary: string | null;
  releasedOn: string | null;
  releasedPrecision: (typeof releasedPrecisions)[number] | null;
};

const providerName = { tmdb: "TMDB", openlibrary: "Open Library" } as const;

export async function itemForKey(
  db: Db | Tx,
  source: "tmdb" | "openlibrary",
  key: string,
) {
  const [row] = await db
    .select({ item: itemSources.item })
    .from(itemSources)
    .where(and(eq(itemSources.source, source), eq(itemSources.key, key)));
  return row?.item ?? null;
}

/**
 * A TMDB key into the catalog (A5). In one transaction: a new item with its
 * source, type row and franchise, or, with `attachTo`, the source and every
 * missing column on that item. Never replaces a title or a summary, nor a
 * date with one from another year; a finer date for the same year replaces a
 * coarser one (Ch 1.2 Q2). The poster is fetched after the commit, and a
 * failure there leaves `cover_path` null without failing the import.
 * Idempotent by key: a key already in the catalog returns its item.
 */
export async function importFromTmdb(
  db: Db,
  tmdb: Tmdb,
  covers: CoverStore | null,
  { key: asked, attachTo }: { key: string; attachTo?: string },
): Promise<{ id: string; created: boolean }> {
  const parsed = parseTmdbKey(asked);
  if (!parsed) throw new NotFoundError(`Not a TMDB key: ${asked}`);
  // One spelling per TMDB id: `movie/0133805` is `movie/133805`, or the
  // catalog would hold the same film twice under two keys (Ch 1.2 B1).
  const key = `${parsed.kind}/${parsed.id}`;
  const existing = await itemForKey(db, "tmdb", key);
  if (existing) return { id: existing, created: false };

  let details: TmdbItem;
  try {
    details = await tmdb.details(key);
  } catch (error) {
    if (error instanceof ProviderError && error.status === 404) {
      throw new NotFoundError(`TMDB has no ${key}.`);
    }
    throw error;
  }

  let result: { id: string; created: boolean };
  try {
    result = await db.transaction(async (tx) => {
      const id = attachTo
        ? await attach(tx, attachTo, matchRow(details), details)
        : await create(tx, details);
      const [source] = await tx
        .insert(itemSources)
        .values({ item: id, source: "tmdb", key, url: tmdbUrl(key) })
        .onConflictDoNothing()
        .returning({ item: itemSources.item });
      if (!source) throw new KeyTaken();
      await writeChild(tx, id, details);
      if (details.collection) await addFranchise(tx, id, details.collection);
      return { id, created: !attachTo };
    });
  } catch (error) {
    if (!(error instanceof KeyTaken)) throw error;
    const winner = await itemForKey(db, "tmdb", key);
    if (!winner) throw error;
    return { id: winner, created: false };
  }

  await cachePoster(db, tmdb, covers, result.id, details);
  return result;
}

/**
 * An Open Library work key into the catalog (A6), the TMDB import's shape: a
 * new `book` (form `novel`, its author row, its source), or, with `attachTo`,
 * the source and the missing columns on a book that looks like it. Never
 * touches a held title, form or author. The cover is the work's first, after
 * the commit. Idempotent by key.
 */
export async function importFromOpenLibrary(
  db: Db,
  ol: OpenLibrary,
  covers: CoverStore | null,
  { key, attachTo }: { key: string; attachTo?: string },
): Promise<{ id: string; created: boolean }> {
  if (!parseOpenLibraryWorkKey(key)) {
    throw new NotFoundError(`Not an Open Library work key: ${key}`);
  }
  const existing = await itemForKey(db, "openlibrary", key);
  if (existing) return { id: existing, created: false };

  const work = await openLibraryWork(ol, key);
  let result: { id: string; created: boolean };
  try {
    result = await db.transaction((tx) => writeBook(tx, work, attachTo));
  } catch (error) {
    if (!(error instanceof KeyTaken)) throw error;
    const winner = await itemForKey(db, "openlibrary", key);
    if (!winner) throw error;
    return { id: winner, created: false };
  }

  await cacheWorkCover(db, ol, covers, result.id, work);
  return result;
}

/** A work's details, with Open Library's 404 as the catalog's. */
export async function openLibraryWork(ol: OpenLibrary, key: string) {
  try {
    return await ol.work(key);
  } catch (error) {
    if (error instanceof ProviderError && error.status === 404) {
      throw new NotFoundError(`Open Library has no ${key}.`);
    }
    throw error;
  }
}

/**
 * Inside a transaction: the work's item, found by key, attached, or made,
 * with its source and author row. Throws KeyTaken when another import holds
 * the key, so the caller can roll back and answer with the winner.
 */
export async function writeBook(
  tx: Tx,
  work: OpenLibraryWork,
  attachTo: string | undefined,
): Promise<{ id: string; created: boolean }> {
  const known = await itemForKey(tx, "openlibrary", work.key);
  if (known) return { id: known, created: false };
  const fills: Fills = {
    summary: work.summary,
    releasedOn: work.publishedOn,
    releasedPrecision: work.publishedPrecision,
  };
  let id: string;
  if (attachTo) {
    id = await attach(tx, attachTo, matchRow(work), fills);
  } else {
    const [row] = await tx
      .insert(items)
      .values({ type: "book", form: "novel", title: work.title, ...fills })
      .returning({ id: items.id });
    id = row.id;
  }
  const [source] = await tx
    .insert(itemSources)
    .values({
      item: id,
      source: "openlibrary",
      key: work.key,
      url: openLibraryUrl(work.key),
    })
    .onConflictDoNothing()
    .returning({ item: itemSources.item });
  if (!source) throw new KeyTaken();
  // An attached book keeps the author it holds; the item-edit Deferral is
  // where a wrong one is fixed. A work with no names still needs one.
  await tx
    .insert(itemBooks)
    .values({ item: id, author: work.authors.join(", ") || "Unknown" })
    .onConflictDoNothing();
  return { id, created: !attachTo };
}

async function create(tx: Tx, details: TmdbItem) {
  const [row] = await tx
    .insert(items)
    .values({
      type: details.kind === "movie" ? "film" : "tv",
      title: details.title,
      releasedOn: details.releasedOn,
      releasedPrecision: details.releasedPrecision,
      summary: details.summary,
    })
    .returning({ id: items.id });
  return row.id;
}

/**
 * A provider's source onto a held item, either provider: the same type, no
 * source of that provider yet, and the one `sameWork` rule. Fills a missing
 * summary and the date by Q2; never a title, a form or an author.
 */
export async function attach(
  tx: Tx,
  itemId: string,
  row: MatchRow,
  details: Fills,
) {
  const [item] = await tx
    .select()
    .from(items)
    .where(eq(items.id, itemId))
    .for("update");
  if (!item) throw new NotFoundError(`No item ${itemId}.`);
  if (item.type !== row.type) {
    throw new ConflictError(`That item is a ${item.type}, not a ${row.type}.`);
  }
  const provider = providerName[row.source];
  const [taken] = await tx
    .select({ key: itemSources.key })
    .from(itemSources)
    .where(
      and(eq(itemSources.item, itemId), eq(itemSources.source, row.source)),
    );
  // The same key, attached while this import waited on the lock (two tabs):
  // the caller answers with the winner, as for any key already in (R4).
  if (taken?.key === row.key) throw new KeyTaken();
  if (taken) {
    throw new ConflictError(
      `That item already has ${provider} source ${taken.key}.`,
    );
  }
  const [book] =
    row.type === "book"
      ? await tx
          .select({ author: itemBooks.author })
          .from(itemBooks)
          .where(eq(itemBooks.item, itemId))
      : [];
  // The sheet only offers items that look like the result; the route holds
  // the same line, since an attach can't be undone this chapter (S1).
  if (!sameWork(row, heldWork(item, book?.author ?? null))) {
    const rule = row.type === "book" ? "title and author" : "title and year";
    throw new ConflictError(
      `That item doesn't look like ${row.title}: the ${rule} must match.`,
    );
  }

  const date = mergedDate(item, details);
  await tx
    .update(items)
    .set({
      summary: item.summary ?? details.summary,
      releasedOn: date.releasedOn,
      releasedPrecision: date.releasedPrecision,
    })
    .where(eq(items.id, itemId));
  return itemId;
}

/** An item as the match rule reads it, with its author when it is a book. */
function heldWork(
  item: Pick<typeof items.$inferSelect, "type" | "title" | "releasedOn">,
  author: string | null,
) {
  return {
    type: item.type,
    title: item.title,
    year: item.releasedOn ? Number(item.releasedOn.slice(0, 4)) : null,
    author,
  };
}

/** Q2: the held date stays unless it is missing, or the provider's is finer in the same year. */
export function mergedDate(
  held: Pick<typeof items.$inferSelect, "releasedOn" | "releasedPrecision">,
  details: Fills,
) {
  if (!details.releasedOn || !details.releasedPrecision) return held;
  if (!held.releasedOn || !held.releasedPrecision) {
    return {
      releasedOn: details.releasedOn,
      releasedPrecision: details.releasedPrecision,
    };
  }
  const sameYear =
    held.releasedOn.slice(0, 4) === details.releasedOn.slice(0, 4);
  const finer =
    precisionRank[details.releasedPrecision] >
    precisionRank[held.releasedPrecision];
  return sameYear && finer
    ? {
        releasedOn: details.releasedOn,
        releasedPrecision: details.releasedPrecision,
      }
    : held;
}

// The type's row, created if missing; an existing row keeps what it has.
async function writeChild(tx: Tx, id: string, details: TmdbItem) {
  if (details.kind === "movie") {
    await tx
      .insert(itemFilms)
      .values({
        item: id,
        runtimeMinutes: details.runtimeMinutes,
        originalTitle: details.originalTitle,
      })
      .onConflictDoUpdate({
        target: itemFilms.item,
        set: {
          runtimeMinutes: sql`coalesce(${itemFilms.runtimeMinutes}, excluded.runtime_minutes)`,
          originalTitle: sql`coalesce(${itemFilms.originalTitle}, excluded.original_title)`,
        },
      });
    return;
  }
  await tx
    .insert(itemTv)
    .values({
      item: id,
      seasons: details.seasons,
      episodes: details.episodes,
      originalTitle: details.originalTitle,
      firstAired: details.firstAired,
      lastAired: details.lastAired,
      ended: details.ended ?? false,
    })
    .onConflictDoUpdate({
      target: itemTv.item,
      set: {
        seasons: sql`coalesce(${itemTv.seasons}, excluded.seasons)`,
        episodes: sql`coalesce(${itemTv.episodes}, excluded.episodes)`,
        originalTitle: sql`coalesce(${itemTv.originalTitle}, excluded.original_title)`,
        firstAired: sql`coalesce(${itemTv.firstAired}, excluded.first_aired)`,
        lastAired: sql`coalesce(${itemTv.lastAired}, excluded.last_aired)`,
        ended: sql`${itemTv.ended} or excluded.ended`,
      },
    });
}

// A TMDB collection is a franchise, found again by its source key.
async function addFranchise(
  tx: Tx,
  itemId: string,
  collection: { key: string; name: string },
) {
  const [known] = await tx
    .select({ franchise: franchiseSources.franchise })
    .from(franchiseSources)
    .where(
      and(
        eq(franchiseSources.source, "tmdb"),
        eq(franchiseSources.key, collection.key),
      ),
    );
  let franchise = known?.franchise;
  if (!franchise) {
    const [made] = await tx
      .insert(franchises)
      .values({ name: collection.name })
      .returning({ id: franchises.id });
    // Upsert on the source (A5): an import of the same collection at once
    // waits here, finds the winner's row, and drops the one it made (B2).
    const [claimed] = await tx
      .insert(franchiseSources)
      .values({
        franchise: made.id,
        source: "tmdb",
        key: collection.key,
        url: tmdbUrl(collection.key),
      })
      .onConflictDoNothing()
      .returning({ franchise: franchiseSources.franchise });
    if (claimed) {
      franchise = made.id;
    } else {
      await tx.delete(franchises).where(eq(franchises.id, made.id));
      const [winner] = await tx
        .select({ franchise: franchiseSources.franchise })
        .from(franchiseSources)
        .where(
          and(
            eq(franchiseSources.source, "tmdb"),
            eq(franchiseSources.key, collection.key),
          ),
        );
      franchise = winner.franchise;
    }
  }
  await tx
    .insert(itemFranchises)
    .values({ item: itemId, franchise })
    .onConflictDoNothing();
}

/** The w500 poster into `covers/tmdb/<kind>/<id>.<ext>`. */
async function cachePoster(
  db: Db,
  tmdb: Tmdb,
  covers: CoverStore | null,
  itemId: string,
  details: TmdbItem,
) {
  if (!details.posterPath) return;
  const path = `tmdb/${details.key}${details.posterPath.slice(details.posterPath.lastIndexOf("."))}`;
  await cacheCover(db, covers, {
    itemId,
    url: tmdb.posterUrl(details.posterPath),
    path,
    label: details.key,
  });
}

/** A work's first cover, `-L`, into `covers/openlibrary/<cover id>.jpg`. */
export async function cacheWorkCover(
  db: Db,
  ol: OpenLibrary,
  covers: CoverStore | null,
  itemId: string,
  work: OpenLibraryWork,
) {
  if (work.coverId === null) return;
  await cacheCover(db, covers, {
    itemId,
    url: ol.coverUrl(work.coverId),
    path: `openlibrary/${work.coverId}.jpg`,
    label: work.key,
  });
}

/**
 * A cover's bytes into Storage at `path`: 10 s, an image, 5 MB at most. Throws
 * with a reason that names no URL; the caller logs it and writes the path
 * onto its own row.
 */
export async function storeCover(
  covers: CoverStore | null,
  url: string,
  path: string,
) {
  if (!covers) throw new Error("no cover store (SUPABASE_SECRET_KEY unset)");
  // A CDN that accepts and never answers mustn't hold the request (S2).
  const response = await fetch(url, {
    signal: AbortSignal.timeout(COVER_TIMEOUT_MS),
  });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok) throw new Error(`cover answered ${response.status}`);
  if (!type.startsWith("image/")) throw new Error(`cover is ${type}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > COVER_LIMIT) throw new Error("cover too large");
  await covers.put(path, bytes, type);
}

/**
 * A cover into Storage and onto the item when it has none. Any failure is one
 * log line: a cover never fails an import. A plain fetch, since Open Library's
 * covers redirect to archive.org; the URL is built from a checked id only.
 */
async function cacheCover(
  db: Db,
  covers: CoverStore | null,
  {
    itemId,
    url,
    path,
    label,
  }: { itemId: string; url: string; path: string; label: string },
) {
  try {
    await storeCover(covers, url, path);
    await db
      .update(items)
      .set({ coverPath: path })
      .where(and(eq(items.id, itemId), isNull(items.coverPath)));
  } catch (error) {
    console.warn(
      `import ${label}: cover not cached (${(error as Error).message})`,
    );
  }
}
