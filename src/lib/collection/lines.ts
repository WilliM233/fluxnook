import { releasedLabel } from "@/lib/catalog/released";
import { plural, type WorkFacts, workLine } from "@/lib/catalog/work-line";
import { conditionLabel, formatLabel } from "./formats";

/**
 * What the collection's rows and headings print, as text (Ch 1.7 A5, A6, A10, A11).
 * Free of the database, so a client can print it and the tests can read it.
 */

/** Under a comic's facts: "Owned via Ultimate Collection 1 (Hardcover)". */
export function ownedViaText(title: string, format: string): string {
  return `Owned via ${title} (${formatLabel(format)})`;
}

/** In a backup's section: "Yours via All is Revealed (Hardcover)". */
export function yoursViaText(host: string, format: string): string {
  return `Yours via ${host} (${formatLabel(format)})`;
}

/** A tile's box (A8): "Owned", "Owned · Floppy", "Owned · 2 floppies". */
export function tickLabel(floppies: number): string {
  if (floppies === 0) return "Owned";
  return floppies === 1 ? "Owned · Floppy" : `Owned · ${floppies} floppies`;
}

/** Under a tile's box: "also" reads off the tick above it (A8). */
export function tileVia(title: string, ticked: boolean): string {
  return `${ticked ? "also via" : "via"} ${title}`;
}

/**
 * The series heading's holding (A8): h counts the issues held or via, once
 * each, and v the via ones; nothing at no holding, no clause at no via.
 */
export function seriesHolding(
  issues: { held: boolean; via: string | null }[],
): string | null {
  const via = issues.filter((issue) => issue.via !== null).length;
  const holding = issues.filter(
    (issue) => issue.held || issue.via !== null,
  ).length;
  if (holding === 0) return null;
  return via === 0
    ? `· you hold ${holding}`
    : `· you hold ${holding}, ${via} of them via a collection`;
}

/** A shelf row's mark (A12): "owned", "via <title>", both, or nothing. */
export function shelfMark(held: boolean, via: string | null): string | null {
  const parts = [held && "owned", via && `via ${via}`].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Why an untick asks (A8): what goes with the floppy. */
export function untickSentence({ note }: { note: string }): string {
  return note === "" ? "Its condition goes with it." : "Its note goes with it.";
}

/** A copy's line after "Your copy": "Good · since 12 March 2019"; "" at neither. */
export function copyLine({
  condition,
  acquiredOn,
}: {
  condition: string | null;
  acquiredOn: string | null;
}): string {
  const since = releasedLabel(acquiredOn, "day");
  return [condition && conditionLabel(condition), since && `since ${since}`]
    .filter(Boolean)
    .join(" · ");
}

const KEEPS = "The printing stays in the catalog.";
const QUOTED = 80;

/**
 * What Remove says, the note's first line quoted when there is one (A6), cut at
 * 80 characters so a long note doesn't become a long confirm (1.7.1 N3). Counted
 * by code point, so the cut never splits an emoji.
 */
export function removeSentence(note: string): string {
  const first = note.split(/\r?\n/)[0].trim();
  if (!first) return KEEPS;
  const characters = Array.from(first);
  const quoted =
    characters.length > QUOTED
      ? `${characters.slice(0, QUOTED).join("").trimEnd()}…`
      : first;
  return `"${quoted}" goes with it. ${KEEPS}`;
}

/** The Editions heading's dim line; none at no printing, "None in the catalog yet." says it. */
export function editionsHeading(
  printings: number,
  copies: number,
): string | null {
  if (printings === 0) return null;
  return `${printings} in the catalog · ${
    copies > 0 ? `you hold ${copies}` : "none yours"
  }`;
}

/**
 * Collection's lede (A10): n copies of m works, then k more through what they
 * collect ("they" at any k: the copies do the collecting); no copies says how
 * to get one.
 */
export function collectionLede({
  copies,
  works,
  via,
}: {
  copies: number;
  works: number;
  via: number;
}): string {
  if (copies === 0)
    return "Nothing held yet. Own a copy from a work's page, or tick a run on its series page.";
  const held = `${copies === 1 ? "1 copy" : `${copies} copies`} of ${plural(works, "work")}, newest first.`;
  if (via === 0) return held;
  const more = via === 1 ? "1 more work is" : `${via} more works are`;
  return `${held} ${more} yours through what they collect.`;
}

/**
 * A Collection row's line (A10, census): the format, what the printing covers,
 * then the printing's publisher and year, or the work's own line when the
 * printing has no publisher.
 */
export function copyRowLine({
  format,
  contents,
  publisher,
  released_on,
  work,
}: {
  format: string;
  contents: number;
  publisher: string | null;
  released_on: string | null;
  work: WorkFacts;
}): string {
  return [
    formatLabel(format),
    contents > 0 && `covers ${plural(contents, "issue")}`,
    ...(publisher ? [publisher, released_on?.slice(0, 4)] : [workLine(work)]),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A Collection row's third line (A10): condition, since, note; null at none. */
export function copyThirdLine(copy: {
  condition: string | null;
  acquiredOn: string | null;
  note: string;
}): string | null {
  const line = [copyLine(copy), copy.note].filter(Boolean).join(" · ");
  return line === "" ? null : line;
}

/** Collection's button (A10): "Shopping · 314 to find". */
export function shoppingLabel(toFind: number): string {
  return `Shopping · ${toFind} to find`;
}

/** Shopping's lede (A11), and what it says when there is nothing to list. */
export function shoppingLede({
  total,
  shelves,
}: {
  total: number;
  shelves: number;
}): string {
  if (shelves === 0) return "No shelves yet, so nothing to find.";
  if (total === 0)
    return "Nothing to find. Every work on your shelves is yours.";
  return `${plural(total, "work")} on your shelves you don't hold a copy of, by shelf. A work on two shelves is listed once, under the first.`;
}

/** A shelf's heading on Shopping (A11): "242 of 326 to find". */
export function toFindLine(toFind: number, works: number): string {
  return `${toFind} of ${works} to find`;
}

/** Under a shelf's rows (A11); null with no backups. */
export function backupsLine(backups: number): string | null {
  if (backups === 0) return null;
  return backups === 1
    ? "1 backup left out: you'd buy what it's printed in."
    : `${backups} backups left out: you'd buy what they're printed in.`;
}
