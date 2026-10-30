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
async function sectionOn(tx: Tx, shelfId: string, sectionId: string) {
  const [section] = await tx
    .select({ id: shelfSections.id })
    .from(shelfSections)
    .where(
      and(eq(shelfSections.id, sectionId), eq(shelfSections.shelf, shelfId)),
    );
  if (!section) throw new NotFoundError(NO_SECTION);
}

/**
 * A 409 naming the section, checked under the shelf's lock so two at once
 * can't both pass; the unique key is the backstop, not the message (A4).
 */
async function nameFree(
  tx: Tx,
  shelfId: string,
  name: string,
  except?: string,
) {
  const [taken] = await tx
    .select({ id: shelfSections.id })
    .from(shelfSections)
    .where(
      and(
        eq(shelfSections.shelf, shelfId),
        eq(shelfSections.name, name),
        except ? ne(shelfSections.id, except) : undefined,
      ),
    );
  if (taken) {
    throw new ConflictError(`The shelf already has a section named ${name}.`);
  }
}

/** A new section, last on the shelf (A4). */
export async function createSection(
  db: Db,
  { name, ...key }: ShelfKey & { name: string },
): Promise<{ id: string }> {
  return withShelf(db, key, async (tx) => {
    await nameFree(tx, key.shelfId, name);
    const [section] = await tx
      .insert(shelfSections)
      .values({
        shelf: key.shelfId,
        name,
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
      await nameFree(tx, key.shelfId, name, sectionId);
      await tx
        .update(shelfSections)
        .set({ name })
        .where(eq(shelfSections.id, sectionId));
    }
    if (position !== undefined) {
      const { sections } = await readShelf(tx, key.shelfId);
      await writeSections(
        tx,
        sections,
        moveSection(sections, { id: sectionId, position }),
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
      const { sections, entries } = await readShelf(tx, key.shelfId);
      await writePlaced(tx, entries, foldSection(sections, entries, sectionId));
      await tx.delete(shelfSections).where(eq(shelfSections.id, sectionId));
      const rest = sections.filter((s) => s.id !== sectionId);
      await writeSections(tx, rest, compactSections(rest));
    },
    renumber,
  );
}
