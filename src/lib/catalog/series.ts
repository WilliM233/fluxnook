import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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
import {
  ConflictError,
  KeyTaken,
  mergedDate,
  NotFoundError,
  storeCover,
  type Tx,
} from "./import";
import { sameSeries } from "./match";
import { collectedStem, seriesVolume } from "./normalize";

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
 * with one edition of `format`). With `attachTo`, an issue whose number a
 * held comic of that group carries attaches to it instead, and the rest are
 * created beside them. Idempotent by the volume's key: a volume in already
 * answers with its series and writes nothing. Covers after the commit; a
 * cover never fails an import.
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

  // The group is settled before Comic Vine is asked, so a bad pick is a 409
  // that costs no call against the hour's 200.
  const group = request.attachTo ? await heldGroup(db, request.attachTo) : null;
  const volume = await comicVineVolume(cv, parsed.id);
  const issues = await cv.issues(parsed.id);
  // A stem is held to the one rule the search showed (Q1 a); a series group
  // is the person's pick for runs no fold reaches, so it isn't (2b).
  if (
    group?.kind === "collected" &&
    !sameSeries(volume, {
      group: "collected",
      label: group.label,
      earliest: null,
      contains: group.contains,
    })
  ) {
    throw new ConflictError(
      `Those editions don't look like ${volume.name}: its name must hold their title and the run they collect.`,
    );
  }
  const run = { volume, issues, request, group };

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
  group: HeldGroup | null;
};

/**
 * A run the person entered by hand, as `attachTo` names it: the comics of a
 * series text, numbered by `item_comics.number`, or the collected editions
 * of a title stem, numbered by their title's trailing number.
 */
type HeldGroup = {
  kind: "series" | "collected";
  label: string;
  members: { itemId: string; number: number | null }[];
  contains: string[];
};

/**
 * `attachTo` to its group, or a 409: no such group, or one whose items
 * already carry a Comic Vine source (it went with another volume).
 */
async function heldGroup(
  db: Db,
  attachTo: NonNullable<SeriesImportRequest["attachTo"]>,
): Promise<HeldGroup> {
  if ("series" in attachTo) {
    const rows = await db.execute<{
      id: string;
      number: number | null;
      attached: boolean;
    }>(sql`
      select i.id, c.number, exists (
        select 1 from item_sources s where s.item = i.id and s.source = 'comicvine'
      ) as attached
      from items i join item_comics c on c.item = i.id
      where i.type = 'comic' and c.series = ${attachTo.series}
      order by c.number nulls last, i.released_on nulls last, i.id`);
    if (rows.length === 0) {
      throw new ConflictError(
        `No run called ${attachTo.series} was added by hand.`,
      );
    }
    if (rows.some((row) => row.attached)) {
      throw new ConflictError(
        "That run is already attached to another Comic Vine volume.",
      );
    }
    return {
      kind: "series",
      label: attachTo.series,
      members: rows.map((row) => ({ itemId: row.id, number: row.number })),
      contains: [],
    };
  }

  const stem = collectedStem(attachTo.collected);
  const rows =
    stem === ""
      ? []
      : (
          await db.execute<{
            id: string;
            title: string;
            attached: boolean;
            contains: string[];
          }>(sql`
            select i.id, i.title, exists (
              select 1 from item_sources s where s.item = i.id and s.source = 'comicvine'
            ) as attached,
            coalesce(array_agg(distinct cc.series) filter (where cc.series is not null), '{}') as contains
            from items i
            left join editions e on e.item = i.id
            left join edition_contents ec on ec.edition = e.id
            left join item_comics cc on cc.item = ec.item
            where i.type = 'comic' and i.form = 'collected'
            group by i.id, i.title`)
        ).filter((row) => collectedStem(row.title) === stem);
  if (rows.length === 0) {
    throw new ConflictError(
      `No collected editions called ${attachTo.collected} were added by hand.`,
    );
  }
  if (rows.some((row) => row.attached)) {
    throw new ConflictError(
      "Those editions are already attached to another Comic Vine volume.",
    );
  }
  const members = rows
    .map((row) => ({
      itemId: row.id,
      title: row.title,
      number: integerNumber(row.title.match(/([0-9]+)\s*$/)?.[1] ?? null),
    }))
    .sort(
      (a, b) =>
        (a.number ?? INTEGER_MAX) - (b.number ?? INTEGER_MAX) ||
        a.itemId.localeCompare(b.itemId),
    );
  return {
    kind: "collected",
    // The stem as the person typed it into the catalog, as the search
    // labels the group: "Ultimate Collection".
    label: members[0].title.replace(/\s*[0-9]+\s*$/, "").trim(),
    members: members.map(({ itemId, number }) => ({ itemId, number })),
    contains: [...new Set(rows.flatMap((row) => row.contains))],
  };
}

/** What the transaction wrote, for the covers after it. */
type Written = {
  seriesId: string;
  created: number;
  attached: number;
  comics: { itemId: string; issue: ComicVineIssue }[];
};

async function writeRun(tx: Tx, key: string, run: Run): Promise<Written> {
  const { volume, issues, group } = run;
  const [row] = await tx
    .insert(series)
    .values({
      name: volume.name,
      volume: group?.kind === "series" ? seriesVolume(group.label) : null,
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
  // Each held comic takes one issue, the first with its number.
  const free = new Map<number, string>();
  for (const member of [...(group?.members ?? [])].reverse()) {
    if (member.number !== null) free.set(member.number, member.itemId);
  }
  for (const issue of issues) {
    const number = integerNumber(issue.number);
    const held = number === null ? undefined : free.get(number);
    if (held && number !== null) {
      free.delete(number);
      await attachComic(tx, row.id, run, held, issue, number);
      written.attached += 1;
      written.comics.push({ itemId: held, issue });
    } else {
      const itemId = await createComic(tx, row.id, run, issue);
      written.created += 1;
      written.comics.push({ itemId, issue });
    }
  }
  return written;
}

/**
 * An issue onto the held comic its number names: the source, the series,
 * a missing number, summary and finer date. Never the title, the form, the
 * series text or the kind; for a collected run, the edition by C7.
 */
async function attachComic(
  tx: Tx,
  seriesId: string,
  { request, volume }: Run,
  itemId: string,
  issue: ComicVineIssue,
  number: number,
) {
  const [item] = await tx
    .select()
    .from(items)
    .where(eq(items.id, itemId))
    .for("update");
  if (!item) throw new NotFoundError(`No item ${itemId}.`);
  const [taken] = await tx
    .select({ key: itemSources.key })
    .from(itemSources)
    .where(
      and(eq(itemSources.item, itemId), eq(itemSources.source, "comicvine")),
    );
  // Another volume's import attached this run while this one waited on the
  // lock: the group was free when it was read, and isn't now.
  if (taken?.key === issue.key) throw new KeyTaken();
  if (taken) {
    throw new ConflictError(
      "That run is already attached to another Comic Vine volume.",
    );
  }
  await claimItemSource(tx, itemId, issue);
  const released = coverMonth(issue.coverDate);
  const date = mergedDate(item, { summary: issue.summary, ...released });
  await tx
    .update(items)
    .set({
      summary: item.summary ?? issue.summary,
      releasedOn: date.releasedOn,
      releasedPrecision: date.releasedPrecision,
    })
    .where(eq(items.id, itemId));
  await tx
    .insert(itemComics)
    .values({ item: itemId, seriesId, number })
    .onConflictDoUpdate({
      target: itemComics.item,
      set: {
        seriesId,
        number: sql`coalesce(${itemComics.number}, excluded.number)`,
      },
    });
  if (request.form === "collected") {
    await attachEdition(
      tx,
      itemId,
      issue,
      volume,
      request.format ?? "hardcover",
    );
  }
}

/**
 * A collected issue's edition on a held item: the held edition of that
 * format takes the source and, where it has none, the cover month and the
 * publisher (C7); with none of that format, a new one.
 */
async function attachEdition(
  tx: Tx,
  itemId: string,
  issue: ComicVineIssue,
  volume: ComicVineSeries,
  format: CollectedFormat,
) {
  const [held] = await tx
    .select({
      id: editions.id,
      releasedOn: editions.releasedOn,
      publisher: editions.publisher,
    })
    .from(editions)
    .where(and(eq(editions.item, itemId), eq(editions.format, format)))
    .orderBy(editions.createdAt, editions.id)
    .limit(1);
  if (!held) {
    await addEdition(tx, itemId, issue, volume, format);
    return;
  }
  await claimEditionSource(tx, held.id, issue);
  await tx
    .update(editions)
    .set({
      ...(held.releasedOn ? {} : coverMonth(issue.coverDate)),
      publisher: held.publisher ?? volume.publisher,
    })
    .where(eq(editions.id, held.id));
}

/** A new comic for one issue: its item, its source, its comic row, and for a collected run its edition. */
async function createComic(
  tx: Tx,
  seriesId: string,
  { volume, issues, request, group }: Run,
  issue: ComicVineIssue,
) {
  const collected = request.form === "collected";
  const released = coverMonth(issue.coverDate);
  // Beside a held stem a new one reads as its neighbours do: "Ultimate
  // Collection 6" (Q2 c).
  const title =
    group?.kind === "collected" && issue.number
      ? `${group.label} ${issue.number}`
      : collected
        ? collectedTitle(volume.name, issue)
        : issueTitle(volume.name, issue);
  const [item] = await tx
    .insert(items)
    .values({
      type: "comic",
      form: collected
        ? "collected"
        : issues.length === 1
          ? "one-shot"
          : "issue",
      title,
      summary: issue.summary,
      ...released,
    })
    .returning({ id: items.id });
  await claimItemSource(tx, item.id, issue);
  await tx.insert(itemComics).values({
    item: item.id,
    // A run picked by hand keeps its label on what joins it, so the picker
    // groups the new issue with the held ones.
    series: group?.kind === "series" ? group.label : volume.name,
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
