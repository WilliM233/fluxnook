import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  franchiseSources,
  franchises,
  itemFilms,
  itemFranchises,
  itemSources,
  items,
  itemTv,
} from "@/db/schema";
import type { CoverStore } from "@/lib/covers";
import {
  ProviderError,
  parseTmdbKey,
  type Tmdb,
  type TmdbItem,
} from "@/lib/providers/tmdb";
import { normalizeTitle } from "./normalize";

/** No such item here, or no such key at TMDB. */
export class NotFoundError extends Error {}

/** The attach target can't take this key: it has a TMDB source, or another type. */
export class ConflictError extends Error {}

// Thrown inside the transaction when another import won the key first.
class KeyTaken extends Error {}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const precisionRank = { year: 0, month: 1, day: 2 } as const;
const POSTER_LIMIT = 5 * 1024 * 1024;
const POSTER_TIMEOUT_MS = 10_000;

const tmdbUrl = (key: string) => `https://www.themoviedb.org/${key}`;

async function itemForKey(db: Db | Tx, key: string) {
  const [row] = await db
    .select({ item: itemSources.item })
    .from(itemSources)
    .where(and(eq(itemSources.source, "tmdb"), eq(itemSources.key, key)));
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
  const existing = await itemForKey(db, key);
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
        ? await attach(tx, attachTo, details)
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
    const winner = await itemForKey(db, key);
    if (!winner) throw error;
    return { id: winner, created: false };
  }

  await cachePoster(db, tmdb, covers, result.id, details);
  return result;
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

async function attach(tx: Tx, itemId: string, details: TmdbItem) {
  const [item] = await tx
    .select()
    .from(items)
    .where(eq(items.id, itemId))
    .for("update");
  if (!item) throw new NotFoundError(`No item ${itemId}.`);
  const type = details.kind === "movie" ? "film" : "tv";
  if (item.type !== type) {
    throw new ConflictError(`That item is a ${item.type}, not a ${type}.`);
  }
  const [taken] = await tx
    .select({ key: itemSources.key })
    .from(itemSources)
    .where(and(eq(itemSources.item, itemId), eq(itemSources.source, "tmdb")));
  if (taken) {
    throw new ConflictError(`That item already has TMDB source ${taken.key}.`);
  }
  // The sheet only offers items that look like the result; the route holds
  // the same line, since an attach can't be undone this chapter (S1).
  if (!looksAlike(item, details)) {
    throw new ConflictError(
      `That item doesn't look like ${details.title}: the title and year must match.`,
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

/** The match rule (A4): the same title once folded, and a year within 1 when both have one. */
function looksAlike(
  item: Pick<typeof items.$inferSelect, "title" | "releasedOn">,
  details: TmdbItem,
) {
  const folded = normalizeTitle(item.title);
  if (folded === "" || folded !== normalizeTitle(details.title)) return false;
  const held = item.releasedOn ? Number(item.releasedOn.slice(0, 4)) : null;
  return (
    held === null || details.year === null || Math.abs(held - details.year) <= 1
  );
}

/** Q2: the held date stays unless it is missing, or TMDB's is finer in the same year. */
function mergedDate(
  held: Pick<typeof items.$inferSelect, "releasedOn" | "releasedPrecision">,
  details: TmdbItem,
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

/** The w500 poster into `covers/tmdb/<kind>/<id>.<ext>`; any failure is one log line. */
async function cachePoster(
  db: Db,
  tmdb: Tmdb,
  covers: CoverStore | null,
  itemId: string,
  details: TmdbItem,
) {
  if (!details.posterPath) return;
  const path = `tmdb/${details.key}${details.posterPath.slice(details.posterPath.lastIndexOf("."))}`;
  try {
    if (!covers) throw new Error("no cover store (SUPABASE_SECRET_KEY unset)");
    // A CDN that accepts and never answers mustn't hold the request (S2).
    const response = await fetch(tmdb.posterUrl(details.posterPath), {
      signal: AbortSignal.timeout(POSTER_TIMEOUT_MS),
    });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok) throw new Error(`poster answered ${response.status}`);
    if (!type.startsWith("image/")) throw new Error(`poster is ${type}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > POSTER_LIMIT) throw new Error("poster too large");
    await covers.put(path, bytes, type);
    await db
      .update(items)
      .set({ coverPath: path })
      .where(and(eq(items.id, itemId), isNull(items.coverPath)));
  } catch (error) {
    console.warn(
      `import ${details.key}: poster not cached (${(error as Error).message})`,
    );
  }
}
