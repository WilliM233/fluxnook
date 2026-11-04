import { releasedLabel } from "@/lib/catalog/released";
import { conditionLabel, formatLabel } from "./formats";

/**
 * What the collection's rows and headings print, as text (Ch 1.7 A5, A6).
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
