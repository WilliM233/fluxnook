import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import { RuleError } from "@/lib/journal/errors";

// POST /api/v1/occurrences and PATCH, DELETE /api/v1/occurrences/<id>
// without a database: auth and the lib mocked (Ch 1.6 A3).
const { getUser, createRead, updateRead, deleteRead } = vi.hoisted(() => ({
  getUser: vi.fn(),
  createRead: vi.fn(),
  updateRead: vi.fn(),
  deleteRead: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/db/client", () => ({ serverDb: () => ({}) }));
vi.mock("@/lib/journal/reads", () => ({
  NO_READ: "No read by that id.",
  createRead,
  updateRead,
  deleteRead,
}));

const { POST } = await import("@/app/api/v1/occurrences/route");
const { PATCH, DELETE } = await import("@/app/api/v1/occurrences/[id]/route");

const user = { id: "af58f162-9de1-4c3f-a84c-be3d0769432f", email: "l@x.dev" };
const item = "7A1B2C3D-0000-4000-8000-000000000001";
const read = "7a1b2c3d-0000-4000-8000-0000000000d1";
const entry = "7a1b2c3d-0000-4000-8000-0000000000e1";
const OPEN = "You're already reading this. Finish or abandon that read first.";

const request = (method: string, sent?: unknown, type = "application/json") =>
  new Request("http://localhost/api/v1/occurrences", {
    method,
    headers: { "content-type": type },
    body: sent === undefined ? undefined : JSON.stringify(sent),
  });

const post = (sent: unknown, type?: string) =>
  POST(request("POST", sent, type));
const patch = (sent: unknown, id = read, type?: string) =>
  PATCH(request("PATCH", sent, type), { params: Promise.resolve({ id }) });
const del = (id = read) =>
  DELETE(request("DELETE"), { params: Promise.resolve({ id }) });

let said: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user } });
  said = (["error", "warn", "log"] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation(() => {}),
  );
});

afterEach(() => {
  for (const spy of said) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("the read routes", () => {
  it("are 401 without a session, in the journal's words", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    for (const answer of [
      await post({ item, status: "done" }),
      await patch({ stars: 4 }),
      await del(),
    ]) {
      expect(answer.status).toBe(401);
      expect((await answer.json()).error.message).toBe(
        "Sign in to see your journal.",
      );
    }
  });

  it("are 404 on an id that isn't a uuid, without a call", async () => {
    const bad = await patch({ stars: 4 }, "not-a-uuid");
    expect(bad.status).toBe(404);
    expect((await bad.json()).error).toEqual({
      code: "not_found",
      message: "No read by that id.",
    });
    expect((await del("not-a-uuid")).status).toBe(404);
    expect(updateRead).not.toHaveBeenCalled();
    expect(deleteRead).not.toHaveBeenCalled();
  });

  it("are 415 off JSON", async () => {
    expect((await post({ item, status: "done" }, "text/plain")).status).toBe(
      415,
    );
    expect((await patch({ stars: 4 }, read, "text/plain")).status).toBe(415);
  });

  it("are 400 with the field on a bad body, without a call", async () => {
    const answer = await post({ item, status: "done", stars: 4.3 });
    expect(answer.status).toBe(400);
    expect((await answer.json()).error).toEqual({
      code: "invalid_request",
      message: "That isn't a read.",
      fields: { stars: "Stars go in half steps from 0.5 to 5." },
    });
    expect((await patch({})).status).toBe(400);
    expect(createRead).not.toHaveBeenCalled();
    expect(updateRead).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/occurrences", () => {
  it("is 201 with both ids, the caller's and the lowercased item", async () => {
    createRead.mockResolvedValue({ id: read, entryId: entry });
    const answer = await post({
      item,
      status: "done",
      entry: { body: "Finished." },
    });
    expect(answer.status).toBe(201);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(await answer.json()).toEqual({ id: read, entryId: entry });
    expect(createRead).toHaveBeenCalledWith(
      {},
      {
        userId: user.id,
        item: item.toLowerCase(),
        status: "done",
        entry: { body: "Finished." },
      },
    );
  });

  it("is 201 with the id alone when there is no entry", async () => {
    createRead.mockResolvedValue({ id: read });
    expect(await (await post({ item, status: "done" })).json()).toEqual({
      id: read,
    });
  });

  it("is 404 for a work the catalog doesn't hold", async () => {
    createRead.mockRejectedValue(new NotFoundError("No work by that id."));
    const answer = await post({ item, status: "done" });
    expect(answer.status).toBe(404);
    expect((await answer.json()).error.message).toBe("No work by that id.");
  });

  it("is 409 for a second open read, in its sentence", async () => {
    createRead.mockRejectedValue(new ConflictError(OPEN));
    const answer = await post({ item, status: "in_progress" });
    expect(answer.status).toBe(409);
    expect((await answer.json()).error).toEqual({
      code: "conflict",
      message: OPEN,
    });
  });

  it("is 400 at the field a lib rule names", async () => {
    createRead.mockRejectedValue(
      new RuleError("entry.anchorKind", "A book takes page or chapter."),
    );
    const answer = await post({ item, status: "done" });
    expect(answer.status).toBe(400);
    expect((await answer.json()).error.fields).toEqual({
      "entry.anchorKind": "A book takes page or chapter.",
    });
  });

  it("rethrows what it doesn't know", async () => {
    createRead.mockRejectedValue(new RangeError("boom"));
    await expect(post({ item, status: "done" })).rejects.toThrow(RangeError);
  });
});

describe("PATCH and DELETE /api/v1/occurrences/<id>", () => {
  it("PATCH is 200 with the read as it stands", async () => {
    const row = {
      id: read,
      item: item.toLowerCase(),
      status: "done",
      startedOn: null,
      finishedOn: null,
      stars: 4,
    };
    updateRead.mockResolvedValue(row);
    const answer = await patch({ stars: 4 });
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(await answer.json()).toEqual(row);
    expect(updateRead).toHaveBeenCalledWith(
      {},
      { userId: user.id, readId: read, stars: 4 },
    );
  });

  it("PATCH is 404 on another person's read and 409 on a second open one", async () => {
    updateRead.mockRejectedValueOnce(new NotFoundError("No read by that id."));
    expect((await patch({ stars: 4 })).status).toBe(404);
    updateRead.mockRejectedValueOnce(new ConflictError(OPEN));
    expect((await patch({ status: "in_progress" })).status).toBe(409);
  });

  it("PATCH is 400 at finishedOn on the lib's date rule", async () => {
    updateRead.mockRejectedValue(
      new RuleError("finishedOn", "Still going, so no Finished date yet."),
    );
    const answer = await patch({ status: "in_progress" });
    expect(answer.status).toBe(400);
    expect((await answer.json()).error.fields).toEqual({
      finishedOn: "Still going, so no Finished date yet.",
    });
  });

  it("DELETE is 204 with no body", async () => {
    deleteRead.mockResolvedValue(undefined);
    const answer = await del();
    expect(answer.status).toBe(204);
    expect(await answer.text()).toBe("");
    expect(deleteRead).toHaveBeenCalledWith(
      {},
      { userId: user.id, readId: read },
    );
  });

  it("DELETE is 404 on another person's read", async () => {
    deleteRead.mockRejectedValue(new NotFoundError("No read by that id."));
    expect((await del()).status).toBe(404);
  });
});
