import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import {
  createCopy,
  deleteCopy,
  NO_COPY,
  NO_PRINTING,
  NO_WORK,
  updateCopy,
} from "@/lib/collection/copies";
import { BACKUP_ONLY } from "@/lib/collection/formats";
import { RuleError } from "@/lib/journal/errors";
import { required, signUp } from "./harness";

// A3's lib on rows of its own, never the fixture's, so no other file's counts
// move: the two doors, the printing found or made in one transaction, the
// 409, and what a person's copy is allowed to do to the catalog.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const tag = `copies ${crypto.randomUUID()}`;
let userId: string;

const work = async (over: { type?: string; form?: string | null } = {}) => {
  const [row] = await sql`
    insert into items (type, title, form, source_note)
    values (${over.type ?? "book"}, ${tag}, ${over.form === undefined ? "novel" : over.form}, ${tag})
    returning id`;
  return row.id as string;
};
const printing = async (item: string, format = "paperback") => {
  const [row] = await sql`
    insert into editions (item, format) values (${item}, ${format}) returning id`;
  return row.id as string;
};
const printingsOf = (item: string) =>
  sql`select id, format, title, publisher, pages, released_on from editions
    where item = ${item} order by created_at, id`;
const copiesOf = (edition: string) =>
  sql`select id, owner, condition, acquired_on::text as acquired_on, note, visibility
    from copies where edition = ${edition} order by created_at, id`;

beforeAll(async () => {
  ({ id: userId } = await signUp(sql));
});

afterAll(async () => {
  await sql`delete from copies where owner = ${userId}`;
  await sql`delete from items where source_note = ${tag}`;
  await sql`delete from auth.users where id = ${userId}`;
  await close();
  await sql.end();
});

describe("createCopy, the edition door", () => {
  it("writes a private copy and reads back", async () => {
    const edition = await printing(await work());
    const { id, editionId } = await createCopy(db, {
      userId,
      edition,
      condition: "good",
      acquiredOn: "2019-03-12",
      note: "The one with the cover.",
    });
    expect(editionId).toBe(edition);
    expect([...(await copiesOf(edition))]).toEqual([
      {
        id,
        owner: userId,
        condition: "good",
        acquired_on: "2019-03-12",
        note: "The one with the cover.",
        visibility: "private",
      },
    ]);
  });

  it("two posts on one printing are two rows", async () => {
    const edition = await printing(await work());
    await createCopy(db, { userId, edition });
    await createCopy(db, { userId, edition });
    expect(await copiesOf(edition)).toHaveLength(2);
  });

  it("an unknown printing is NotFoundError", async () => {
    await expect(
      createCopy(db, { userId, edition: crypto.randomUUID() }),
    ).rejects.toThrow(new NotFoundError(NO_PRINTING));
  });

  it("a backup's printing is RuleError at edition", async () => {
    const backup = await work({ type: "comic", form: "backup" });
    const edition = await printing(backup, "floppy");
    const refused = await createCopy(db, { userId, edition }).catch((e) => e);
    expect(refused).toBeInstanceOf(RuleError);
    expect(refused).toMatchObject({ field: "edition", message: BACKUP_ONLY });
    expect(await copiesOf(edition)).toHaveLength(0);
  });
});

describe("createCopy, the item door", () => {
  it("with a format the catalog lacks makes the printing with its other columns null", async () => {
    const item = await work();
    const { editionId } = await createCopy(db, {
      userId,
      item,
      format: "hardcover",
    });
    expect([...(await printingsOf(item))]).toEqual([
      {
        id: editionId,
        format: "hardcover",
        title: null,
        publisher: null,
        pages: null,
        released_on: null,
      },
    ]);
    expect(await copiesOf(editionId)).toHaveLength(1);
    const sources =
      await sql`select 1 from edition_sources where edition = ${editionId}`;
    expect(sources).toHaveLength(0);
  });

  it("uses the work's one printing of that format", async () => {
    const item = await work();
    const edition = await printing(item, "hardcover");
    const { editionId } = await createCopy(db, {
      userId,
      item,
      format: "hardcover",
    });
    expect(editionId).toBe(edition);
    expect(await printingsOf(item)).toHaveLength(1);
  });

  it("two printings of a format are ConflictError, the sentence names 2, and no copy is written", async () => {
    const item = await work();
    const first = await printing(item, "hardcover");
    const second = await printing(item, "hardcover");
    const refused = await createCopy(db, {
      userId,
      item,
      format: "hardcover",
    }).catch((e) => e);
    expect(refused).toBeInstanceOf(ConflictError);
    expect(refused.message).toBe(
      "This work has 2 hardcover printings in the catalog. Pick one on its page.",
    );
    expect(await copiesOf(first)).toHaveLength(0);
    expect(await copiesOf(second)).toHaveLength(0);
  });

  it("a copy made to fail leaves no printing", async () => {
    const item = await work();
    // Through the lib, which Zod never sees and `copies_condition` refuses.
    await expect(
      createCopy(db, { userId, item, format: "ebook", condition: "mint" }),
    ).rejects.toThrow();
    expect(await printingsOf(item)).toHaveLength(0);
  });

  it("two posts at once make one printing and two copies", async () => {
    const item = await work();
    const [a, b] = await Promise.all([
      createCopy(db, { userId, item, format: "audiobook" }),
      createCopy(db, { userId, item, format: "audiobook" }),
    ]);
    expect(a.editionId).toBe(b.editionId);
    expect(await printingsOf(item)).toHaveLength(1);
    expect(await copiesOf(a.editionId)).toHaveLength(2);
  });

  it("a format the type doesn't allow is RuleError at format naming them", async () => {
    const item = await work();
    const refused = await createCopy(db, {
      userId,
      item,
      format: "dvd",
    }).catch((e) => e);
    expect(refused).toBeInstanceOf(RuleError);
    expect(refused).toMatchObject({
      field: "format",
      message: "A book comes as paperback, hardcover, ebook or audiobook.",
    });
    expect(await printingsOf(item)).toHaveLength(0);
  });

  it("a backup is RuleError at item", async () => {
    const backup = await work({ type: "comic", form: "backup" });
    const refused = await createCopy(db, {
      userId,
      item: backup,
      format: "floppy",
    }).catch((e) => e);
    expect(refused).toBeInstanceOf(RuleError);
    expect(refused).toMatchObject({ field: "item", message: BACKUP_ONLY });
    expect(await printingsOf(backup)).toHaveLength(0);
  });

  it("an unknown work is RuleError at item", async () => {
    const refused = await createCopy(db, {
      userId,
      item: crypto.randomUUID(),
      format: "paperback",
    }).catch((e) => e);
    expect(refused).toBeInstanceOf(RuleError);
    expect(refused).toMatchObject({ field: "item", message: NO_WORK });
  });
});

describe("updateCopy", () => {
  it("changes one field, clears with null and answers updatedAt", async () => {
    const edition = await printing(await work());
    const { id } = await createCopy(db, {
      userId,
      edition,
      condition: "good",
      acquiredOn: "2019-03-12",
      note: "Keep.",
    });
    const changed = await updateCopy(db, {
      userId,
      copyId: id,
      condition: "fair",
    });
    expect(changed).toMatchObject({
      id,
      editionId: edition,
      condition: "fair",
      acquiredOn: "2019-03-12",
      note: "Keep.",
    });
    expect(changed.updatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/,
    );
    const cleared = await updateCopy(db, {
      userId,
      copyId: id,
      condition: null,
      acquiredOn: null,
      note: "",
    });
    expect(cleared).toMatchObject({
      condition: null,
      acquiredOn: null,
      note: "",
    });
  });

  it("an unknown copy is NotFoundError", async () => {
    await expect(
      updateCopy(db, { userId, copyId: crypto.randomUUID(), note: "x" }),
    ).rejects.toThrow(new NotFoundError(NO_COPY));
  });
});

describe("deleteCopy", () => {
  it("leaves the printing", async () => {
    const item = await work();
    const edition = await printing(item);
    const { id } = await createCopy(db, { userId, edition });
    await deleteCopy(db, { userId, copyId: id });
    expect(await copiesOf(edition)).toHaveLength(0);
    expect(await printingsOf(item)).toHaveLength(1);
  });

  it("an unknown copy is NotFoundError", async () => {
    await expect(
      deleteCopy(db, { userId, copyId: crypto.randomUUID() }),
    ).rejects.toThrow(new NotFoundError(NO_COPY));
  });
});

describe("the restrict", () => {
  it("deleting a held printing fails at the database", async () => {
    const edition = await printing(await work());
    await createCopy(db, { userId, edition });
    await expect(
      sql`delete from editions where id = ${edition}`,
    ).rejects.toThrow(/copies_edition_editions_id_fk/);
    expect(await copiesOf(edition)).toHaveLength(1);
  });
});
