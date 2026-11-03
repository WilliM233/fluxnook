import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { occurrenceStatuses } from "@/db/vocabulary";
import { ConflictError, NotFoundError, type Tx } from "@/lib/catalog/import";
import {
  checkAnchorKind,
  insertEntry,
  type NewEntry,
  type WorkKind,
} from "./entries";
import {
  FINISHED_BEFORE,
  isOpenTwice,
  NO_READ,
  RuleError,
  STILL_GOING,
} from "./errors";

export { NO_READ } from "./errors";
export const OPEN_ALREADY =
  "You're already reading this. Finish or abandon that read first.";
export const NO_WORK = "No work by that id.";

type Status = (typeof occurrenceStatuses)[number];

/** A read as the routes answer it: dates as `YYYY-MM-DD`, stars a number. */
export type Read = {
  id: string;
  item: string;
  status: Status;
  startedOn: string | null;
  finishedOn: string | null;
  stars: number | null;
};

type ReadFields = Pick<Read, "status" | "startedOn" | "finishedOn">;

const READ_COLUMNS = sql`id, item, status, started_on::text as "startedOn",
  finished_on::text as "finishedOn", stars::float8 as stars`;

/** A3's rules on a read as it will stand; the schemas say the same first. */
export function checkRules({ status, startedOn, finishedOn }: ReadFields) {
  if (startedOn && finishedOn && finishedOn < startedOn) {
    throw new RuleError("finishedOn", FINISHED_BEFORE);
  }
  if (status === "in_progress" && finishedOn) {
    throw new RuleError("finishedOn", STILL_GOING);
  }
}

/** The index's refusal and the select-first's are one answer (A3). */
const asConflict = (error: unknown) =>
  isOpenTwice(error) ? new ConflictError(OPEN_ALREADY) : error;

/** The select-first: another open read of the work is a 409 before the write. */
async function noOtherOpen(
  tx: Tx,
  { userId, item, except }: { userId: string; item: string; except?: string },
) {
  const open = await tx.execute(sql`
    select 1 from occurrences
    where owner = ${userId} and item = ${item} and status = 'in_progress'
      ${except ? sql`and id <> ${except}` : sql``}`);
  if (open.length > 0) throw new ConflictError(OPEN_ALREADY);
}

async function workOf(tx: Tx, item: string): Promise<WorkKind> {
  const [work] = await tx.execute<WorkKind>(
    sql`select type, form from items where id = ${item}`,
  );
  if (!work) throw new NotFoundError(NO_WORK);
  return work;
}

export type NewRead = {
  userId: string;
  item: string;
  status: Status;
  startedOn?: string;
  finishedOn?: string;
  stars?: number | null;
  entry?: NewEntry;
};

/**
 * A read and its first entry in one transaction (A3): owner the caller,
 * private by the column's default. A second open read of the work is a
 * `ConflictError`, from the select-first or, under a race, from the index.
 */
export async function createRead(
  db: Db,
  { userId, item, entry, ...fields }: NewRead,
): Promise<{ id: string; entryId?: string }> {
  try {
    return await db.transaction(async (tx) => {
      const work = await workOf(tx, item);
      const read = {
        status: fields.status,
        startedOn: fields.startedOn ?? null,
        finishedOn: fields.finishedOn ?? null,
      };
      checkRules(read);
      // Under the body's own key, before anything is written.
      if (entry) {
        checkAnchorKind(work, entry.anchorKind ?? null, "entry.anchorKind");
      }
      if (read.status === "in_progress") {
        await noOtherOpen(tx, { userId, item });
      }
      const [{ id }] = await tx.execute<{ id: string }>(sql`
        insert into occurrences (owner, item, status, started_on, finished_on, stars)
        values (${userId}, ${item}, ${read.status}, ${read.startedOn}::date,
          ${read.finishedOn}::date, ${fields.stars ?? null}::numeric)
        returning id`);
      if (!entry) return { id };
      const { id: entryId } = await insertEntry(tx, {
        readId: id,
        work,
        entry,
      });
      return { id, entryId };
    });
  } catch (error) {
    throw asConflict(error);
  }
}

export type ReadChange = {
  userId: string;
  readId: string;
  status?: Status;
  startedOn?: string | null;
  finishedOn?: string | null;
  stars?: number | null;
};

/**
 * A change to the caller's read, judged on the read as it will stand: the
 * body over the row, `undefined` keeping a column and `null` clearing it.
 */
export async function updateRead(
  db: Db,
  { userId, readId, ...change }: ReadChange,
): Promise<Read> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.execute<Read>(sql`
        select ${READ_COLUMNS} from occurrences
        where id = ${readId} and owner = ${userId} for update`);
      if (!row) throw new NotFoundError(NO_READ);
      const next = {
        status: change.status ?? row.status,
        startedOn:
          change.startedOn === undefined ? row.startedOn : change.startedOn,
        finishedOn:
          change.finishedOn === undefined ? row.finishedOn : change.finishedOn,
        stars: change.stars === undefined ? row.stars : change.stars,
      };
      checkRules(next);
      if (next.status === "in_progress" && row.status !== "in_progress") {
        await noOtherOpen(tx, { userId, item: row.item, except: readId });
      }
      const [read] = await tx.execute<Read>(sql`
        update occurrences set status = ${next.status},
          started_on = ${next.startedOn}::date,
          finished_on = ${next.finishedOn}::date,
          stars = ${next.stars}::numeric
        where id = ${readId}
        returning ${READ_COLUMNS}`);
      return read;
    });
  } catch (error) {
    throw asConflict(error);
  }
}

/** The caller's read gone, its entries with it (the schema's cascade). */
export async function deleteRead(
  db: Db,
  { userId, readId }: { userId: string; readId: string },
) {
  const gone = await db.execute(sql`
    delete from occurrences where id = ${readId} and owner = ${userId}
    returning id`);
  if (gone.length === 0) throw new NotFoundError(NO_READ);
}
