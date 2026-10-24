/**
 * Loads the Volume 0 fixtures into the tables for one user (Ch 1.1).
 *
 * The catalog upserts on its source keys, so it is the same after any number
 * of runs. All of it is one transaction: a file that fails the shape, a
 * missing user, or any error writes nothing.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import type { Db } from "@/db/client";
import {
  copies,
  editionContents,
  editionSources,
  editions,
  itemBooks,
  itemComics,
  itemRelations,
  itemSources,
  items,
  occurrences,
  profiles,
  shelfEntries,
  shelfSections,
  shelves,
} from "@/db/schema";
import { type Fixture, fixture } from "./shape";

/** A refusal the CLI prints as one line and exits 1 on. */
export class LoadError extends Error {}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type FixtureItem = Fixture["items"][number];

export interface LoadOptions {
  email: string;
  replace?: boolean;
  dir?: string;
  log?: (line: string) => void;
}

interface Named {
  name: string;
  data: Fixture;
}

function readFixtures(dir: string): Named[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const parsed = fixture.safeParse(
        JSON.parse(readFileSync(path.join(dir, name), "utf8")),
      );
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        throw new LoadError(
          `${name} does not fit the fixture shape: ${issues}`,
        );
      }
      return { name, data: parsed.data };
    });
}

// `<source>:<key>`; keys may hold colons of their own, sources may not.
function splitId(id: string) {
  const at = id.indexOf(":");
  return { source: id.slice(0, at), key: id.slice(at + 1) };
}

function released(year: number | null, month?: number) {
  if (year === null) return { releasedOn: null, releasedPrecision: null };
  if (month === undefined) {
    return { releasedOn: `${year}-01-01`, releasedPrecision: "year" as const };
  }
  const mm = String(month).padStart(2, "0");
  return {
    releasedOn: `${year}-${mm}-01`,
    releasedPrecision: "month" as const,
  };
}

// A comic's sheet date has no column of its own, so it rides in the note.
function sourceNote(item: FixtureItem) {
  const parts =
    item.type === "comic"
      ? [item.source_note, item.source_date]
      : [item.source_note];
  return parts.filter(Boolean).join("\n") || null;
}

// A fixture id the files point at but never define is a refusal that names
// it, not a foreign-key error from deep in the transaction (Ch 1.1 S1).
function resolve(ids: Map<string, string>, id: string, what: string) {
  const found = ids.get(id);
  if (!found) throw new LoadError(`${id} is not ${what} in any fixture`);
  return found;
}

async function findUser(tx: Tx, email: string) {
  // Auth stores addresses lowercased; the login form takes any case (S3).
  const [user] = await tx
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(sql`lower(${authUsers.email}) = lower(${email})`);
  if (!user) throw new LoadError(`no auth user with email ${email}`);
  // The row lock claims the user: a second load at once waits here, then
  // finds the content the first one wrote and refuses (Ch 1.1 B2).
  const [profile] = await tx
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .for("update");
  if (!profile) throw new LoadError(`${email} has no profiles row`);
  return user.id;
}

async function upsertItem(tx: Tx, item: FixtureItem) {
  const { source, key } = splitId(item.id);
  const row = {
    type: item.type,
    title: item.title,
    form: item.type === "film" ? null : item.form,
    ...released(item.year, item.type === "comic" ? item.month : undefined),
    sourceNote: sourceNote(item),
  };
  const [found] = await tx
    .select({ id: itemSources.item })
    .from(itemSources)
    .where(and(eq(itemSources.source, source), eq(itemSources.key, key)));

  let id: string;
  if (found) {
    id = found.id;
    await tx.update(items).set(row).where(eq(items.id, id));
  } else {
    [{ id }] = await tx.insert(items).values(row).returning({ id: items.id });
    await tx.insert(itemSources).values({
      item: id,
      source,
      key,
      url: (item.providers as Record<string, string>)[source] ?? null,
    });
  }

  if (item.type === "book") {
    await tx
      .insert(itemBooks)
      .values({ item: id, author: item.author })
      .onConflictDoUpdate({
        target: itemBooks.item,
        set: { author: item.author },
      });
  }
  if (item.type === "comic") {
    const comic = {
      series: item.series,
      seriesKind: item.series_kind,
      number: item.number,
    };
    await tx
      .insert(itemComics)
      .values({ item: id, ...comic })
      .onConflictDoUpdate({ target: itemComics.item, set: comic });
  }
  return { id, created: !found };
}

async function upsertEdition(
  tx: Tx,
  edition: Fixture["editions"][number],
  itemId: string,
) {
  const key = edition.id.slice("edition:".length);
  const [found] = await tx
    .select({ id: editionSources.edition })
    .from(editionSources)
    .where(
      and(eq(editionSources.source, "manual"), eq(editionSources.key, key)),
    );
  if (found) {
    await tx
      .update(editions)
      .set({ item: itemId, format: edition.format })
      .where(eq(editions.id, found.id));
    return found.id;
  }
  const [{ id }] = await tx
    .insert(editions)
    .values({ item: itemId, format: edition.format })
    .returning({ id: editions.id });
  await tx
    .insert(editionSources)
    .values({ edition: id, source: "manual", key });
  return id;
}

async function loadCatalog(
  tx: Tx,
  fixtures: Named[],
  log: (l: string) => void,
) {
  const itemIds = new Map<string, string>();
  const editionIds = new Map<string, string>();
  const itemUuid = (id: string) => resolve(itemIds, id, "an item");

  // Every file's items before any relation: relations cross files.
  let created = 0;
  for (const { data } of fixtures) {
    for (const item of data.items) {
      const result = await upsertItem(tx, item);
      itemIds.set(item.id, result.id);
      if (result.created) created++;
    }
  }

  let relations = 0;
  let contents = 0;
  for (const { data } of fixtures) {
    for (const relation of data.relations) {
      await tx
        .insert(itemRelations)
        .values({
          fromItem: itemUuid(relation.from),
          toItem: itemUuid(relation.to),
          kind: relation.type,
        })
        .onConflictDoNothing();
      relations++;
    }
    for (const edition of data.editions) {
      const id = await upsertEdition(tx, edition, itemUuid(edition.item));
      editionIds.set(edition.id, id);
      for (const [index, content] of edition.contents.entries()) {
        await tx
          .insert(editionContents)
          .values({ edition: id, item: itemUuid(content), position: index + 1 })
          .onConflictDoUpdate({
            target: [editionContents.edition, editionContents.item],
            set: { position: index + 1 },
          });
        contents++;
      }
    }
  }

  log(
    `catalog: ${itemIds.size} items (${created} new), ${itemIds.size} sources, ${relations} relations, ${editionIds.size} editions, ${contents} contents`,
  );
  return { itemIds, editionIds };
}

export async function loadFixtures(db: Db, options: LoadOptions) {
  const log = options.log ?? console.log;
  const dir = options.dir ?? path.resolve("supabase/seed/fixtures");
  const fixtures = readFixtures(dir);

  await db.transaction(async (tx) => {
    const userId = await findUser(tx, options.email);
    log(`fixtures:load: ${options.email} (${userId})`);

    for (const { name, data } of fixtures) {
      const shelfCount = data.shelves.length;
      log(
        `${name}: ${data.items.length} items, ${data.relations.length} relations, ${data.editions.length} editions, ${shelfCount} shelves, ${data.copies.length} copies, ${data.occurrences.length} occurrences, ${data.gaps.length} gaps`,
      );
      for (const gap of data.gaps) log(`  gap ${gap.item}: ${gap.reason}`);
    }

    // Before any write, so a refusal leaves the catalog as it was too.
    const replaced = await clearContent(tx, userId, options);

    // Loads for different people share the catalog: one at a time from here,
    // or two inserting the same new item collide on its source key (Ch 1.2
    // D2). Taken after the user's row lock, so the order is always the same.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('fixtures:load'))`,
    );
    const ids = await loadCatalog(tx, fixtures, log);
    const written = await loadContent(tx, userId, fixtures, ids);
    log(
      `content ${replaced ? "replaced " : ""}for ${options.email}: ${written.shelves} shelves, ${written.sections} sections, ${written.entries} entries, ${written.occurrences} occurrences, ${written.copies} copies`,
    );
  });
}

// Content has no natural key to upsert on, so it loads only into a user who
// has none; --replace empties the user first. The cascades take sections,
// entries and journal entries with their parents.
async function clearContent(tx: Tx, userId: string, options: LoadOptions) {
  const [held] = await tx
    .select({
      shelves: sql<number>`(select count(*)::int from ${shelves} where ${shelves.owner} = ${userId})`,
      occurrences: sql<number>`(select count(*)::int from ${occurrences} where ${occurrences.owner} = ${userId})`,
      copies: sql<number>`(select count(*)::int from ${copies} where ${copies.owner} = ${userId})`,
    })
    .from(profiles)
    .where(eq(profiles.id, userId));
  if (held.shelves + held.occurrences + held.copies === 0) return false;
  if (!options.replace) {
    throw new LoadError(
      `${options.email} already has ${held.shelves} shelves, ${held.occurrences} occurrences, ${held.copies} copies; pass --replace to clear them first`,
    );
  }
  await tx.delete(shelves).where(eq(shelves.owner, userId));
  await tx.delete(occurrences).where(eq(occurrences.owner, userId));
  await tx.delete(copies).where(eq(copies.owner, userId));
  return true;
}

async function loadContent(
  tx: Tx,
  owner: string,
  fixtures: Named[],
  ids: Awaited<ReturnType<typeof loadCatalog>>,
) {
  const itemUuid = (id: string) => resolve(ids.itemIds, id, "an item");
  const written = {
    shelves: 0,
    sections: 0,
    entries: 0,
    occurrences: 0,
    copies: 0,
  };

  for (const { data } of fixtures) {
    for (const shelf of data.shelves) {
      const [{ id: shelfId }] = await tx
        .insert(shelves)
        .values({
          owner,
          name: shelf.name,
          description: shelf.description,
          sourceUrl: shelf.url ?? null,
          // A fixture shelf's date is when the list was made (Ch 1.1 call).
          createdAt: new Date(`${shelf.date}T00:00:00Z`),
        })
        .returning({ id: shelves.id });
      written.shelves++;

      // A flat shelf is one unnamed group whose entries carry no section.
      const groups: {
        name: string | null;
        entries: { item: string; position: number }[];
      }[] = shelf.sections ?? [{ name: null, entries: shelf.entries ?? [] }];
      for (const [index, section] of groups.entries()) {
        let sectionId: string | null = null;
        if (section.name !== null) {
          [{ id: sectionId }] = await tx
            .insert(shelfSections)
            .values({ shelf: shelfId, name: section.name, position: index + 1 })
            .returning({ id: shelfSections.id });
          written.sections++;
        }
        if (section.entries.length === 0) continue;
        await tx.insert(shelfEntries).values(
          section.entries.map((entry) => ({
            shelf: shelfId,
            section: sectionId,
            item: itemUuid(entry.item),
            position: entry.position,
          })),
        );
        written.entries += section.entries.length;
      }
    }

    if (data.copies.length > 0) {
      await tx.insert(copies).values(
        data.copies.map((copy) => ({
          owner,
          edition: resolve(ids.editionIds, copy.edition, "an edition"),
          note: copy.note,
        })),
      );
      written.copies += data.copies.length;
    }
    if (data.occurrences.length > 0) {
      await tx.insert(occurrences).values(
        data.occurrences.map((occurrence) => ({
          owner,
          item: itemUuid(occurrence.item),
          status: occurrence.status,
        })),
      );
      written.occurrences += data.occurrences.length;
    }
  }
  return written;
}
