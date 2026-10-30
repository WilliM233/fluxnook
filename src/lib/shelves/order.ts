/**
 * A shelf's order (A2): integers 1..n across the whole shelf, in display
 * order. Unsectioned entries come first by position, then each section by its
 * position, its entries by theirs. Every position a write stores is computed
 * here and nowhere else; each function is pure and returns new rows.
 */

export type SectionRow = { id: string; position: number };
export type EntryRow = { id: string; section: string | null; position: number };
export type Placed = { id: string; section: string | null; position: number };

/** What every shelf write ends with: the shelf's rows, numbered 1..n. */
export type Renumber = (
  sections: SectionRow[],
  entries: EntryRow[],
) => Placed[];

const byPosition = (a: SectionRow | EntryRow, b: SectionRow | EntryRow) =>
  a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The groups in display order: the unsectioned part (key null), then each section. */
function groups(sections: SectionRow[], entries: EntryRow[]) {
  const keys = [null, ...[...sections].sort(byPosition).map((s) => s.id)];
  const held = new Map<string | null, EntryRow[]>(keys.map((k) => [k, []]));
  for (const entry of entries) {
    const group = held.get(entry.section);
    if (!group) {
      throw new RangeError(`Entry ${entry.id} is in no section of this shelf.`);
    }
    group.push(entry);
  }
  for (const group of held.values()) group.sort(byPosition);
  return held;
}

function flatten(held: Map<string | null, EntryRow[]>): Placed[] {
  const placed: Placed[] = [];
  for (const [section, group] of held) {
    for (const entry of group) {
      placed.push({ id: entry.id, section, position: placed.length + 1 });
    }
  }
  return placed;
}

/** The entries in the order the shelf shows them. */
export function displayOrder(sections: SectionRow[], entries: EntryRow[]) {
  return [...groups(sections, entries).values()].flat();
}

/** Every entry at its place in display order, numbered 1..n. */
export const renumber: Renumber = (sections, entries) =>
  flatten(groups(sections, entries));

/**
 * One entry into a section (null: above the first section) at a 0-based
 * index within it; past the end means last. The whole shelf renumbered.
 */
export function moveEntry(
  sections: SectionRow[],
  entries: EntryRow[],
  move: { id: string; section: string | null; index: number },
): Placed[] {
  const held = groups(sections, entries);
  const destination = held.get(move.section);
  if (!destination) {
    throw new RangeError(`No section ${move.section} on this shelf.`);
  }
  const moving = entries.find((e) => e.id === move.id);
  if (!moving) throw new RangeError(`No entry ${move.id} on this shelf.`);
  // groups() placed every entry, so its own group holds it.
  const from = held.get(moving.section) ?? [];
  const [entry] = from.splice(
    from.findIndex((e) => e.id === move.id),
    1,
  );
  destination.splice(
    Math.min(Math.max(move.index, 0), destination.length),
    0,
    entry,
  );
  return flatten(held);
}

/**
 * A section's entries moved above the first section, after the unsectioned
 * ones and in their own order; the section itself gone. The whole shelf
 * renumbered (2026-10-30: a section delete never drops a work).
 */
export function foldSection(
  sections: SectionRow[],
  entries: EntryRow[],
  sectionId: string,
): Placed[] {
  const held = groups(sections, entries);
  const folded = held.get(sectionId);
  if (!folded) throw new RangeError(`No section ${sectionId} on this shelf.`);
  held.get(null)?.push(...folded);
  held.delete(sectionId);
  return flatten(held);
}

/** One section to a 1-based position (past the end means last); the sections renumbered 1..m. */
export function moveSection(
  sections: SectionRow[],
  move: { id: string; position: number },
): SectionRow[] {
  const ordered = [...sections].sort(byPosition);
  const at = ordered.findIndex((s) => s.id === move.id);
  if (at < 0) throw new RangeError(`No section ${move.id} on this shelf.`);
  const [section] = ordered.splice(at, 1);
  const to = Math.min(Math.max(move.position - 1, 0), ordered.length);
  ordered.splice(to, 0, section);
  return ordered.map((s, i) => ({ id: s.id, position: i + 1 }));
}

/** The invariant every write keeps: positions exactly 1..n, none repeated. */
export function isNumbered(entries: { position: number }[]) {
  const positions = entries.map((e) => e.position).sort((a, b) => a - b);
  return positions.every((p, i) => p === i + 1);
}
