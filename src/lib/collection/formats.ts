import type { conditions, editionFormats } from "@/db/vocabulary";

/**
 * The format vocabulary narrowed per type and form at the API, never in the
 * schema (Ch 1.1 call, Ch 1.7 A2), and every word this chapter prints for a
 * format or a condition. No database import, so a client can print it.
 */

export type Format = (typeof editionFormats)[number];
export type Condition = (typeof conditions)[number];
export type ItemType = "film" | "tv" | "book" | "comic";

/** A3's sentence: a backup has no format of its own. */
export const BACKUP_ONLY =
  "A backup story is owned through the comic it's printed in.";

const BOOK: readonly Format[] = [
  "paperback",
  "hardcover",
  "ebook",
  "audiobook",
];
const SINGLE: readonly Format[] = ["floppy", "digital"];
const COLLECTED: readonly Format[] = ["tpb", "hardcover", "omnibus", "digital"];
const SCREEN: readonly Format[] = ["dvd", "blu-ray", "4k", "digital"];

/** The formats a work of this type and form comes in; a backup comes in none. */
export function formatsFor(
  type: ItemType,
  form: string | null,
): readonly Format[] {
  switch (type) {
    case "book":
      return BOOK;
    case "film":
    case "tv":
      return SCREEN;
    case "comic":
      if (form === "backup") return [];
      return form === "collected" ? COLLECTED : SINGLE;
  }
}

const LABELS: Record<Format, string> = {
  floppy: "Floppy",
  tpb: "Trade paperback",
  hardcover: "Hardcover",
  omnibus: "Omnibus",
  paperback: "Paperback",
  ebook: "Ebook",
  audiobook: "Audiobook",
  dvd: "DVD",
  "blu-ray": "Blu-ray",
  "4k": "4K",
  digital: "Digital",
};

/** A format as a person says it: Hardcover, Trade paperback, 4K. */
export function formatLabel(format: string): string {
  return LABELS[format as Format] ?? format;
}

/** The word inside a sentence: lowered, but DVD and 4K stay as they're said. */
export function formatWord(format: string): string {
  return format === "dvd" || format === "4k"
    ? formatLabel(format)
    : formatLabel(format).toLowerCase();
}

/** The 400 at `format`: names what this work comes as. */
export function formatsSentence(type: ItemType, form: string | null): string {
  if (type === "comic" && form === "backup") return BACKUP_ONLY;
  const words = formatsFor(type, form).map((format) =>
    format === "blu-ray" ? formatLabel(format) : formatWord(format),
  );
  const list = `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
  const subject =
    type === "book"
      ? "A book"
      : type === "film"
        ? "A film"
        : type === "tv"
          ? "A show"
          : form === "collected"
            ? "A collected comic"
            : "A comic";
  return `${subject} comes as ${list}.`;
}

/** A condition as it prints: New, Fine, Good, Fair, Poor. */
export function conditionLabel(condition: string): string {
  return condition.charAt(0).toUpperCase() + condition.slice(1);
}
