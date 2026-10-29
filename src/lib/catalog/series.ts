import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  editionSources,
  editions,
  itemComics,
  itemSources,
  items,
  series,
  seriesSources,
} from "@/db/schema";
import type { CoverStore } from "@/lib/covers";
import {
  type ComicVine,
  type ComicVineIssue,
  type ComicVineSeries,
  ProviderError,
  parseComicVineKey,
} from "@/lib/providers/comicvine";
import { KeyTaken, NotFoundError, storeCover, type Tx } from "./import";

/** The formats a collected run comes in, narrowed at the API (A5). */
export type CollectedFormat = "tpb" | "hardcover" | "omnibus";

export type SeriesImportRequest = {
  key: string;
  form: "issue" | "collected";
  format?: CollectedFormat;
  attachTo?: { series: string } | { collected: string };
};

/**
 * What an import did: the series, how many comics it made and how many held
 * ones it attached to, and `known` when the volume was in already and
 * nothing was written.
 */
export type SeriesImport = {
  id: string;
  created: number;
  attached: number;
  known: boolean;
};

// Four cover fetches in flight at once (A5): a 62-issue run takes a few
// seconds without opening 62 sockets at Comic Vine's image host.
const COVERS_AT_ONCE = 4;
const INTEGER_MAX = 2_147_483_647;

export async function seriesForKey(db: Db | Tx, key: string) {
  const [row] = await db
    .select({ series: seriesSources.series })
    .from(seriesSources)
    .where(
      and(eq(seriesSources.source, "comicvine"), eq(seriesSources.key, key)),
    );
  return row?.series ?? null;
}

/**
 * A Comic Vine volume and every issue it lists into the catalog (A5), in one
 * transaction (C13): a `series` row with its source, then each issue as a
 * new comic of the form the person chose (an `issue`, or a `collected` item
 * with one edition of `format`). Idempotent by the volume's key: a volume in
 * already answers with its series and writes nothing. Covers after the
 * commit; a cover never fails an import.
 */
export async function importSeriesFromComicVine(
  db: Db,
  cv: ComicVine,
  covers: CoverStore | null,
  request: SeriesImportRequest,
): Promise<SeriesImport> {
  const parsed = parseComicVineKey(request.key);
  if (parsed?.kind !== "volume") {
    throw new NotFoundError(`Not a Comic Vine volume key: ${request.key}`);
  }
  const key = `volume/${parsed.id}`;
  const held = await seriesForKey(db, key);
  if (held) return { id: held, created: 0, attached: 0, known: true };

  const volume = await comicVineVolume(cv, parsed.id);
  const issues = await cv.issues(parsed.id);
  const run = { volume, issues, request };

  let written: Written;
  try {
    written = await db.transaction((tx) => writeRun(tx, key, run));
  } catch (error) {
    if (!(error instanceof KeyTaken)) throw error;
    // Another import of this volume won while this one fetched: one series.
    const winner = await seriesForKey(db, key);
    if (!winner) throw error;
    return { id: winner, created: 0, attached: 0, known: true };
  }

  await cacheRunCovers(db, covers, parsed.id, volume, written);
  return {
    id: written.seriesId,
    created: written.created,
    attached: written.attached,
    known: false,
  };
}

/** A volume's details, with Comic Vine's 404 as the catalog's. */
async function comicVineVolume(cv: ComicVine, id: number) {
  try {
    return await cv.volume(id);
  } catch (error) {
    if (error instanceof ProviderError && error.status === 404) {
      throw new NotFoundError(`Comic Vine has no volume/${id}.`);
    }
    throw error;
  }
}

type Run = {
  volume: ComicVineSeries;
  issues: ComicVineIssue[];
  request: SeriesImportRequest;
};

/** What the transaction wrote, for the covers after it. */
type Written = {
  seriesId: string;
  created: number;
  attached: number;
  comics: { itemId: string; issue: ComicVineIssue }[];
};

async function writeRun(tx: Tx, key: string, run: Run): Promise<Written> {
  const { volume, issues } = run;
  const [row] = await tx
    .insert(series)
    .values({
      name: volume.name,
      volume: null,
      yearBegan: volume.year,
      yearEnded: yearEnded(volume, issues),
      publisher: volume.publisher,
      kind: null,
      summary: volume.summary,
    })
    .returning({ id: series.id });
  // The claim comes before any issue, so a second import of the same volume
  // waits here on the first one's key and rolls back whole (1.2 B2).
  const [claimed] = await tx
    .insert(seriesSources)
    .values({ series: row.id, source: "comicvine", key, url: volume.url })
    .onConflictDoNothing()
    .returning({ series: seriesSources.series });
  if (!claimed) throw new KeyTaken();

  const written: Written = {
    seriesId: row.id,
    created: 0,
    attached: 0,
    comics: [],
  };
  for (const issue of issues) {
    const itemId = await createComic(tx, row.id, run, issue);
    written.created += 1;
    written.comics.push({ itemId, issue });
  }
  return written;
}

/** A new comic for one issue: its item, its source, its comic row, and for a collected run its edition. */
async function createComic(
  tx: Tx,
  seriesId: string,
  { volume, issues, request }: Run,
  issue: ComicVineIssue,
) {
  const collected = request.form === "collected";
  const released = coverMonth(issue.coverDate);
  const [item] = await tx
    .insert(items)
    .values({
      type: "comic",
      form: collected
        ? "collected"
        : issues.length === 1
          ? "one-shot"
          : "issue",
      title: collected
        ? collectedTitle(volume.name, issue)
        : issueTitle(volume.name, issue),
      summary: issue.summary,
      ...released,
    })
    .returning({ id: items.id });
  await claimItemSource(tx, item.id, issue);
  await tx.insert(itemComics).values({
    item: item.id,
    series: volume.name,
    seriesId,
    number: integerNumber(issue.number),
  });
  if (collected) {
    await addEdition(tx, item.id, issue, volume, request.format ?? "hardcover");
  }
  return item.id;
}

async function claimItemSource(tx: Tx, itemId: string, issue: ComicVineIssue) {
  const [claimed] = await tx
    .insert(itemSources)
    .values({
      item: itemId,
      source: "comicvine",
      key: issue.key,
      url: issue.url,
    })
    .onConflictDoNothing()
    .returning({ item: itemSources.item });
  if (!claimed) throw new KeyTaken();
}

/** One edition of the run's format, dated to the cover month, with its source. */
async function addEdition(
  tx: Tx,
  itemId: string,
  issue: ComicVineIssue,
  volume: ComicVineSeries,
  format: CollectedFormat,
) {
  const [edition] = await tx
    .insert(editions)
    .values({
      item: itemId,
      format,
      publisher: volume.publisher,
      ...coverMonth(issue.coverDate),
    })
    .returning({ id: editions.id });
  await claimEditionSource(tx, edition.id, issue);
}

async function claimEditionSource(
  tx: Tx,
  editionId: string,
  issue: ComicVineIssue,
) {
  const [claimed] = await tx
    .insert(editionSources)
    .values({
      edition: editionId,
      source: "comicvine",
      key: issue.key,
      url: issue.url,
    })
    .onConflictDoNothing()
    .returning({ edition: editionSources.edition });
  if (!claimed) throw new KeyTaken();
}

/** Comic Vine's name, else "<series> #<n>", else the series alone (A5). */
export function issueTitle(seriesName: string, issue: ComicVineIssue) {
  if (issue.name) return issue.name;
  return issue.number ? `${seriesName} #${issue.number}` : seriesName;
}

/**
 * A collected issue's title when no held stem names it (Q2 c's else arm):
 * "<volume name> <name>", so the Ultimate Collection's "Vol. 6" reads as
 * which collection it is.
 */
export function collectedTitle(volumeName: string, issue: ComicVineIssue) {
  if (issue.name) return `${volumeName} ${issue.name}`;
  return issue.number ? `${volumeName} #${issue.number}` : volumeName;
}

/** A number the catalog can hold as an integer, or null ("1.5", "1A", ""). */
export function integerNumber(number: string | null) {
  if (!number || !/^[0-9]{1,10}$/.test(number)) return null;
  const value = Number(number);
  return value <= INTEGER_MAX ? value : null;
}

/** The cover date at month precision: the day is noise (A5). */
export function coverMonth(date: string | null) {
  return date
    ? {
        releasedOn: `${date.slice(0, 7)}-01`,
        releasedPrecision: "month" as const,
      }
    : { releasedOn: null, releasedPrecision: null };
}

/**
 * The year a run ended: the last cover date's, but only when Comic Vine's
 * count matches the issues fetched and that year is past, since a run still
 * coming out has no end yet.
 */
export function yearEnded(
  volume: Pick<ComicVineSeries, "issueCount">,
  issues: Pick<ComicVineIssue, "coverDate">[],
  thisYear = new Date().getUTCFullYear(),
) {
  if (volume.issueCount === null || volume.issueCount !== issues.length) {
    return null;
  }
  const last = issues
    .map((issue) => issue.coverDate)
    .filter((date): date is string => date !== null)
    .sort()
    .at(-1);
  const year = last ? Number(last.slice(0, 4)) : null;
  return year !== null && year < thisYear ? year : null;
}

/**
 * The volume's cover onto the series and each issue's onto its item, both
 * only where none is held, four at a time. A failure is one line naming the
 * key, never the URL.
 */
async function cacheRunCovers(
  db: Db,
  covers: CoverStore | null,
  volumeId: number,
  volume: ComicVineSeries,
  written: Written,
) {
  const jobs: { label: string; run: () => Promise<void> }[] = [];
  if (volume.coverUrl) {
    const url = volume.coverUrl;
    jobs.push({
      label: `volume/${volumeId}`,
      run: async () => {
        const path = `comicvine/volume-${volumeId}.jpg`;
        await storeCover(covers, url, path);
        await db
          .update(series)
          .set({ coverPath: path })
          .where(
            and(eq(series.id, written.seriesId), isNull(series.coverPath)),
          );
      },
    });
  }
  const ids = written.comics.map((comic) => comic.itemId);
  const bare = new Set(
    ids.length
      ? (
          await db
            .select({ id: items.id })
            .from(items)
            .where(and(inArray(items.id, ids), isNull(items.coverPath)))
        ).map((row) => row.id)
      : [],
  );
  for (const { itemId, issue } of written.comics) {
    if (!issue.coverUrl || !bare.has(itemId)) continue;
    const url = issue.coverUrl;
    jobs.push({
      label: issue.key,
      run: async () => {
        const path = `comicvine/${issue.key.replace("/", "-")}.jpg`;
        await storeCover(covers, url, path);
        await db
          .update(items)
          .set({ coverPath: path })
          .where(and(eq(items.id, itemId), isNull(items.coverPath)));
      },
    });
  }
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(COVERS_AT_ONCE, jobs.length) }, async () => {
      while (next < jobs.length) {
        const { label, run } = jobs[next++];
        try {
          await run();
        } catch (error) {
          console.warn(
            `import ${label}: cover not cached (${(error as Error).message})`,
          );
        }
      }
    }),
  );
}
