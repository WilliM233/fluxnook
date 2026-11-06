import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import { timestampText } from "@/lib/journal/entries";
import { RuleError } from "@/lib/journal/errors";
import {
  BACKUP_ONLY,
  type Format,
  formatsFor,
  formatsSentence,
  formatWord,
  type ItemType,
} from "./formats";

export const NO_COPY = "No copy by that id.";
export const NO_PRINTING = "No printing by that id.";
export const NO_WORK = "No work by that id.";

/** A copy as `PATCH` answers it (A3); `updatedAt` is its version (2026-11-03). */
export type Copy = {
  id: string;
  editionId: string;
  condition: string | null;
  acquiredOn: string | null;
  note: string;
  updatedAt: string;
};

type Fields = {
  condition?: string | null;
  acquiredOn?: string | null;
  note?: string;
};

/** The two doors of `POST /api/v1/copies`: the printing, or the work and a format. */
export type NewCopy = { userId: string } & Fields &
  ({ edition: string } | { item: string; format: Format });

const COPY_COLUMNS = sql`id, edition as "editionId", condition,
  acquired_on::text as "acquiredOn", note,
  ${timestampText(sql`updated_at`)} as "updatedAt"`;

/**
 * A copy of a known printing, or of the work's one printing of a format (A3).
 * The work's row is locked so two posts at once make one printing and two
 * copies. `for no key update` serializes those two and leaves a shelf write's
 * foreign key check alone. Two printings of the format is a 409 before any
 * write: the person picks one on the page.
 */
export async function createCopy(
  db: Db,
  input: NewCopy,
): Promise<{ id: string; editionId: string }> {
  return db.transaction(async (tx) => {
    let editionId: string;
    if ("edition" in input) {
      const [printing] = await tx.execute<{ form: string | null }>(sql`
        select i.form from editions e join items i on i.id = e.item
        where e.id = ${input.edition}`);
      if (!printing) throw new NotFoundError(NO_PRINTING);
      if (printing.form === "backup") {
        throw new RuleError("edition", BACKUP_ONLY);
      }
      editionId = input.edition;
    } else {
      const [work] = await tx.execute<{ type: ItemType; form: string | null }>(
        sql`select type, form from items where id = ${input.item}
          for no key update`,
      );
      if (!work) throw new RuleError("item", NO_WORK);
      if (work.form === "backup") throw new RuleError("item", BACKUP_ONLY);
      if (!formatsFor(work.type, work.form).includes(input.format)) {
        throw new RuleError("format", formatsSentence(work.type, work.form));
      }
      const printings = await tx.execute<{ id: string }>(sql`
        select id from editions
        where item = ${input.item} and format = ${input.format}`);
      if (printings.length > 1) {
        throw new ConflictError(
          `This work has ${printings.length} ${formatWord(input.format)} printings in the catalog. Pick one on its page.`,
        );
      }
      if (printings.length === 1) {
        editionId = printings[0].id;
      } else {
        const [made] = await tx.execute<{ id: string }>(sql`
          insert into editions (item, format)
          values (${input.item}, ${input.format})
          returning id`);
        editionId = made.id;
      }
    }
    const [copy] = await tx.execute<{ id: string }>(sql`
      insert into copies (owner, edition, condition, acquired_on, note)
      values (${input.userId}, ${editionId}, ${input.condition ?? null},
        ${input.acquiredOn ?? null}::date, ${input.note ?? ""})
      returning id`);
    return { id: copy.id, editionId };
  });
}

/**
 * A change to the caller's copy: `undefined` keeps a column, `null` clears
 * it, and a copy's printing never changes (A3). Another person's copy is no
 * copy.
 */
export async function updateCopy(
  db: Db,
  { userId, copyId, ...change }: { userId: string; copyId: string } & Fields,
): Promise<Copy> {
  const [copy] = await db.execute<Copy>(sql`
    update copies set
      condition = ${change.condition === undefined ? sql`condition` : change.condition},
      acquired_on = ${change.acquiredOn === undefined ? sql`acquired_on` : sql`${change.acquiredOn}::date`},
      note = ${change.note === undefined ? sql`note` : change.note}
    where id = ${copyId} and owner = ${userId}
    returning ${COPY_COLUMNS}`);
  if (!copy) throw new NotFoundError(NO_COPY);
  return copy;
}

/** The caller's copy gone; the printing stays in the catalog (A3). */
export async function deleteCopy(
  db: Db,
  { userId, copyId }: { userId: string; copyId: string },
) {
  const gone = await db.execute(sql`
    delete from copies where id = ${copyId} and owner = ${userId}
    returning id`);
  if (gone.length === 0) throw new NotFoundError(NO_COPY);
}
