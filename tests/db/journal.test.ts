import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import { RuleError } from "@/lib/journal/errors";
import {
  createRead,
  deleteRead,
  FINISHED_BEFORE,
  OPEN_ALREADY,
  STILL_GOING,
  updateRead,
} from "@/lib/journal/reads";
import { itemFor, required, signUpWithFixtures } from "./harness";

// The journal's writes on one account holding the fixtures (Ch 1.6.1): a
// read and its first entry as one transaction, one open read per work under
// a race, the cascade. Every write is on Carrie, Carrie (1976) or Salem's
// Lot, which the fixtures leave unread, so the 26 Mirage reads stand.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();

let userId: string;
let carrie: string;
let carrieFilm: string;
let salemsLot: string;

const readsOf = (item: string) => sql`
  select id, status, started_on::text as started_on, finished_on::text as finished_on,
    stars, visibility from occurrences
  where owner = ${userId} and item = ${item} order by created_at`;

const entriesOf = (read: string) => sql`
  select id, body, anchor_kind, anchor_value from journal_entries
  where occurrence = ${read} order by written_at`;

const refused = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a refusal");
};

beforeAll(async () => {
  ({ id: userId } = await signUpWithFixtures(sql));
  carrie = await itemFor(sql, "manual", "carrie-1974");
  carrieFilm = await itemFor(sql, "letterboxd", "20ZQ");
  salemsLot = await itemFor(sql, "manual", "salems-lot-1975");
}, 60_000);

beforeEach(async () => {
  await sql`delete from occurrences where owner = ${userId}
    and item in (${carrie}, ${carrieFilm}, ${salemsLot})`;
});

afterAll(async () => {
  await close();
  await sql.end();
});

describe("createRead", () => {
  it("writes a private done read with its dates and stars and reads back", async () => {
    const { id, entryId } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
      startedOn: "2026-10-28",
      finishedOn: "2026-11-02",
      stars: 4.5,
    });
    expect(entryId).toBeUndefined();
    const [read] = await readsOf(carrie);
    expect(read).toEqual({
      id,
      status: "done",
      started_on: "2026-10-28",
      finished_on: "2026-11-02",
      stars: "4.5",
      visibility: "private",
    });
  });

  it("with a first entry writes both, the entry on the read, in one transaction", async () => {
    const { id, entryId } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
      entry: {
        body: "Finished in a weekend.",
        anchorKind: "page",
        anchorValue: "112",
      },
    });
    expect(await entriesOf(id)).toEqual([
      {
        id: entryId,
        body: "Finished in a weekend.",
        anchor_kind: "page",
        anchor_value: "112",
      },
    ]);
  });

  it("an entry made to fail leaves no read", async () => {
    // Past the Zod, which would refuse a kind with no value first.
    const error = await refused(
      createRead(db, {
        userId,
        item: carrie,
        status: "done",
        entry: { body: "x", anchorKind: "page", anchorValue: null },
      }),
    );
    expect(String((error as Error).cause ?? error)).toMatch(
      /journal_entries_anchor/,
    );
    expect(await readsOf(carrie)).toHaveLength(0);
  });

  it("a second Reading of the same work is ConflictError and one open read stands", async () => {
    await createRead(db, { userId, item: carrie, status: "in_progress" });
    const error = await refused(
      createRead(db, { userId, item: carrie, status: "in_progress" }),
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(OPEN_ALREADY);
    expect(await readsOf(carrie)).toHaveLength(1);
  });

  it("two Readings at once end with one open read", async () => {
    const results = await Promise.allSettled([
      createRead(db, { userId, item: carrieFilm, status: "in_progress" }),
      createRead(db, { userId, item: carrieFilm, status: "in_progress" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const lost = results.find((r) => r.status === "rejected");
    expect(lost?.reason).toBeInstanceOf(ConflictError);
    expect(lost?.reason.message).toBe(OPEN_ALREADY);
    const open = await sql`select 1 from occurrences
      where owner = ${userId} and item = ${carrieFilm} and status = 'in_progress'`;
    expect(open).toHaveLength(1);
  });

  it("Finished before Started is RuleError at finishedOn, and nothing is written", async () => {
    const error = await refused(
      createRead(db, {
        userId,
        item: carrie,
        status: "done",
        startedOn: "2026-11-02",
        finishedOn: "2026-10-28",
      }),
    );
    expect(error).toBeInstanceOf(RuleError);
    expect(error).toMatchObject({
      field: "finishedOn",
      message: FINISHED_BEFORE,
    });
    expect(await readsOf(carrie)).toHaveLength(0);
  });

  it("a uuid that isn't a work is NotFoundError", async () => {
    await expect(
      createRead(db, { userId, item: crypto.randomUUID(), status: "done" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("updateRead", () => {
  it("to Reading beside an open read is ConflictError", async () => {
    await createRead(db, { userId, item: carrie, status: "in_progress" });
    const { id } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
    });
    const error = await refused(
      updateRead(db, { userId, readId: id, status: "in_progress" }),
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((await readsOf(carrie)).map((r) => r.status).sort()).toEqual([
      "done",
      "in_progress",
    ]);
  });

  it("merges: stars alone keeps the dates, null clears, Reading over a finished read is RuleError", async () => {
    const { id } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
      startedOn: "2026-10-28",
      finishedOn: "2026-11-02",
    });
    expect(await updateRead(db, { userId, readId: id, stars: 4 })).toEqual({
      id,
      item: carrie,
      status: "done",
      startedOn: "2026-10-28",
      finishedOn: "2026-11-02",
      stars: 4,
    });
    expect(
      await updateRead(db, {
        userId,
        readId: id,
        finishedOn: null,
        stars: null,
      }),
    ).toMatchObject({ startedOn: "2026-10-28", finishedOn: null, stars: null });

    await updateRead(db, { userId, readId: id, finishedOn: "2026-11-02" });
    const error = await refused(
      updateRead(db, { userId, readId: id, status: "in_progress" }),
    );
    expect(error).toMatchObject({ field: "finishedOn", message: STILL_GOING });
    expect(
      await updateRead(db, {
        userId,
        readId: id,
        status: "in_progress",
        finishedOn: null,
      }),
    ).toMatchObject({ status: "in_progress", finishedOn: null });
  });

  it("Finished before Started is RuleError and the read is unchanged", async () => {
    const { id } = await createRead(db, {
      userId,
      item: carrie,
      status: "done",
      startedOn: "2026-10-28",
    });
    const error = await refused(
      updateRead(db, { userId, readId: id, finishedOn: "2026-10-01" }),
    );
    expect(error).toMatchObject({
      field: "finishedOn",
      message: FINISHED_BEFORE,
    });
    const [read] = await readsOf(carrie);
    expect(read.finished_on).toBeNull();
  });

  it("a random id is NotFoundError", async () => {
    await expect(
      updateRead(db, { userId, readId: crypto.randomUUID(), stars: 3 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("deleteRead", () => {
  it("takes its two entries", async () => {
    const { id } = await createRead(db, {
      userId,
      item: salemsLot,
      status: "done",
      stars: 5,
      entry: {
        body: "Ben Mears comes home.",
        anchorKind: "chapter",
        anchorValue: "1",
      },
    });
    await sql`insert into journal_entries (occurrence, body) values (${id}, 'Again.')`;
    expect(await entriesOf(id)).toHaveLength(2);

    await deleteRead(db, { userId, readId: id });
    expect(await readsOf(salemsLot)).toHaveLength(0);
    expect(await entriesOf(id)).toHaveLength(0);
  });

  it("a random id is NotFoundError", async () => {
    await expect(
      deleteRead(db, { userId, readId: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
