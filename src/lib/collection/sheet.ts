import { type Format, formatLabel, formatsFor, type ItemType } from "./formats";

/**
 * Own a copy as data (Ch 1.7 A7): the one select's options and the two bodies
 * it posts. Pure and free of the database, so the sheet and the tests share it.
 */

/** A printing as the select lists it. */
export type Printing = {
  id: string;
  format: string;
  title: string | null;
  publisher: string | null;
  released_on: string | null;
};

/** One option; the value carries the door: `edition:<id>` or `format:<word>`. */
export type Option = { value: string; label: string };

/** "Paperback · Anchor Books, 2011"; a part left out when null. */
function printingLabel(printing: Printing): string {
  const where = [
    printing.title ?? printing.publisher,
    printing.released_on?.slice(0, 4),
  ]
    .filter(Boolean)
    .join(", ");
  return [formatLabel(printing.format), where].filter(Boolean).join(" · ");
}

/**
 * The select's two lists: first each printing the catalog has, then the
 * formats A2 allows that the catalog lacks, bare.
 */
export function printingOptions(
  printings: Printing[],
  type: ItemType,
  form: string | null,
): { printed: Option[]; lacking: Option[] } {
  const held = new Set(printings.map((p) => p.format));
  return {
    printed: printings.map((p) => ({
      value: `edition:${p.id}`,
      label: printingLabel(p),
    })),
    lacking: formatsFor(type, form)
      .filter((format) => !held.has(format))
      .map((format) => ({
        value: `format:${format}`,
        label: formatLabel(format),
      })),
  };
}

/** What a person fills in; a blank select or date is "". */
export type CopyFields = {
  condition: string;
  acquiredOn: string;
  note: string;
};

const asBody = ({ condition, acquiredOn, note }: CopyFields) => ({
  condition: condition || null,
  acquiredOn: acquiredOn || null,
  note,
});

/** `POST /api/v1/copies`'s body for the option picked: one select, two shapes. */
export function copyPost(item: string, choice: string, fields: CopyFields) {
  const [door, value] = [
    choice.slice(0, choice.indexOf(":")),
    choice.slice(choice.indexOf(":") + 1),
  ];
  return door === "edition"
    ? { edition: value, ...asBody(fields) }
    : { item, format: value as Format, ...asBody(fields) };
}

/**
 * `PATCH /api/v1/copies/<id>`'s body: what changed from the copy the sheet
 * opened with, a blank field clearing. A field left alone isn't sent, so a Save
 * can't undo what another tab saved while the sheet was open (1.7.1 Rummage R2).
 */
export function copyChange(opened: CopyFields, fields: CopyFields) {
  const now = asBody(fields);
  const was = asBody(opened);
  return {
    ...(now.condition !== was.condition && { condition: now.condition }),
    ...(now.acquiredOn !== was.acquiredOn && { acquiredOn: now.acquiredOn }),
    ...(now.note !== was.note && { note: now.note }),
  };
}
