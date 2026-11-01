/**
 * Where a dragged work lands (A8). The drag sees the shelf as one sequence:
 * the works above the first section, then each section's heading followed
 * by its works. A work belongs to the nearest heading above it, so one
 * place up or down across a heading moves it into that section, and an
 * empty section is reached through its heading. Pure, like `order.ts`.
 */

const HEADING = "heading:";

/** A section heading's id in the sequence. */
export const headingId = (sectionId: string) => `${HEADING}${sectionId}`;

/** The section a heading id names; null for a work's id. */
export const headingSection = (id: string) =>
  id.startsWith(HEADING) ? id.slice(HEADING.length) : null;

/** The shelf as the drag sees it, from its sections and its rows in display order. */
export function dragSequence(
  sections: { id: string }[],
  rows: { id: string; section: string | null }[],
): string[] {
  const held = (section: string | null) =>
    rows.filter((row) => row.section === section).map((row) => row.id);
  return [
    ...held(null),
    ...sections.flatMap((s) => [headingId(s.id), ...held(s.id)]),
  ];
}

/** The sequence with one id taken from its place and put where `overId` is. */
export function moveInSequence(
  sequence: string[],
  activeId: string,
  overId: string,
): string[] {
  const from = sequence.indexOf(activeId);
  const to = sequence.indexOf(overId);
  if (from < 0 || to < 0) return sequence;
  const next = [...sequence];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/**
 * A work's place in a sequence, as the move route takes it: its section
 * (null above the first) and its 0-based index among that section's works.
 */
export function placeIn(
  sequence: string[],
  id: string,
): { section: string | null; index: number } {
  let section: string | null = null;
  let index = 0;
  for (const entry of sequence) {
    if (entry === id) return { section, index };
    const heading = headingSection(entry);
    if (heading) {
      section = heading;
      index = 0;
    } else {
      index += 1;
    }
  }
  throw new RangeError(`No ${id} in the sequence.`);
}
