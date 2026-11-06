import { and, eq, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { shelfSections } from "@/db/schema";
import { ConflictError, NotFoundError, type Tx } from "@/lib/catalog/import";
import {
  compactSections,
  foldSection,
  moveSection,
  type Renumber,
} from "./order";
import {
  readShelf,
  type ShelfKey,
  withShelf,
  writePlaced,
  writeSections,
} from "./write";

export const NO_SECTION = "No section by that id on this shelf.";

type SectionKey = ShelfKey & { sectionId: string };

/** The section, when it is on this shelf; a section of any other shelf is none. */
export async function sectionOn(tx: Tx, shelfId: string, sectionId: string) {
  const [section] = await tx
    .select({ id: shelfSections.id })
    .from(shelfSections)
    .where(
      and(eq(shelfSections.id, sectionId), eq(shelfSections.shelf, shelfId)),
    );
  if (!section) throw new NotFoundError(NO_SECTION);
}

/**
 * A 409 naming the section as the shelf holds it, checked under the shelf's
 * lock so two at once can't both pass. "carrie" is the shelf's "Carrie" to a
 * person typing (Rummage R5); the exact unique key is the backstop.
 */
async function nameFree(
  tx: Tx,
  shelfId: string,
  name: string,
  except?: string,
) {
  const [taken] = await tx
    .select({ name: shelfSections.name })
    .from(shelfSections)
    .where(
      and(
        eq(shelfSections.shelf, shelfId),
        sql`lower(${shelfSections.name}) = lower(${name})`,
        except ? ne(shelfSections.id, except) : undefined,
      ),
    );
  if (taken) {
    throw new ConflictError(
      `The shelf already has a section named ${taken.name}.`,
    );
  }
}

/** A new section, last on the shelf (A4). */
export async function createSection(
  db: Db,
  { name, ...key }: ShelfKey & { name: string },
): Promise<{ id: string }> {
  // Trimmed here as at the edge, so " Carrie" can't stand beside "Carrie".
  const clean = name.trim();
  return withShelf(db, key, async (tx) => {
    await nameFree(tx, key.shelfId, clean);
    const [section] = await tx
      .insert(shelfSections)
      .values({
        shelf: key.shelfId,
        name: clean,
        position: sql`(select coalesce(max(position), 0) + 1 from shelf_sections where shelf = ${key.shelfId})`,
      })
      .returning({ id: shelfSections.id });
    return section;
  });
}

/**
 * A section renamed, or moved to a 1-based position: the sections renumber,
 * then the entries follow them, as withShelf's renumber does (A4).
 */
export async function updateSection(
  db: Db,
  {
    sectionId,
    name,
    position,
    ...key
  }: SectionKey & { name?: string; position?: number },
) {
  return withShelf(db, key, async (tx) => {
    await sectionOn(tx, key.shelfId, sectionId);
    if (name !== undefined) {
      const clean = name.trim();
      await nameFree(tx, key.shelfId, clean, sectionId);
      await tx
        .update(shelfSections)
        .set({ name: clean })
        .where(eq(shelfSections.id, sectionId));
    }
    if (position !== undefined) {
      const { sections } = await readShelf(tx, key.shelfId);
      // In the rows' own case, which the order rule's lookups need (R4).
      const id = sectionId.toLowerCase();
      await writeSections(
        tx,
        sections,
        moveSection(sections, { id, position }),
      );
    }
    const [section] = await tx
      .select({
        id: shelfSections.id,
        name: shelfSections.name,
        position: shelfSections.position,
      })
      .from(shelfSections)
      .where(eq(shelfSections.id, sectionId));
    return section;
  });
}

/**
 * A section gone and none of its works: they move above the first section,
 * after the unsectioned ones, before the row goes, so the schema's cascade
 * finds nothing to take (2026-10-30 call). A failure anywhere after the move
 * rolls the move back with it; `renumber` is how a test makes one.
 */
export async function deleteSection(
  db: Db,
  { sectionId, ...key }: SectionKey,
  { renumber }: { renumber?: Renumber } = {},
) {
  await withShelf(
    db,
    key,
    async (tx) => {
      await sectionOn(tx, key.shelfId, sectionId);
      // In the rows' own case, which the order rule's lookups need (R4).
      const id = sectionId.toLowerCase();
      const { sections, entries } = await readShelf(tx, key.shelfId);
      await writePlaced(tx, entries, foldSection(sections, entries, id));
      await tx.delete(shelfSections).where(eq(shelfSections.id, id));
      const rest = sections.filter((s) => s.id !== id);
      await writeSections(tx, rest, compactSections(rest));
    },
    renumber,
  );
}
