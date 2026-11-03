import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/lib/catalog/import";
import { RuleError } from "@/lib/journal/errors";

// POST /api/v1/occurrences/<id>/entries and PATCH, DELETE .../entries/<eid>
// without a database: auth and the lib mocked (Ch 1.6 A4).
const { getUser, createEntry, updateEntry, deleteEntry } = vi.hoisted(() => ({
  getUser: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/db/client", () => ({ serverDb: () => ({}) }));
vi.mock("@/lib/journal/entries", () => ({
  NO_ENTRY: "No entry by that id on this read.",
  createEntry,
  updateEntry,
  deleteEntry,
}));

const { POST } = await import("@/app/api/v1/occurrences/[id]/entries/route");
const { PATCH, DELETE } = await import(
  "@/app/api/v1/occurrences/[id]/entries/[eid]/route"
);

const user = { id: "af58f162-9de1-4c3f-a84c-be3d0769432f", email: "l@x.dev" };
const read = "7a1b2c3d-0000-4000-8000-0000000000d1";
const entry = "7a1b2c3d-0000-4000-8000-0000000000e1";

const request = (method: string, sent?: unknown, type = "application/json") =>
  new Request("http://localhost/api/v1/occurrences/x/entries", {
    method,
    headers: { "content-type": type },
    body: sent === undefined ? undefined : JSON.stringify(sent),
  });

const post = (sent: unknown, id = read, type?: string) =>
  POST(request("POST", sent, type), { params: Promise.resolve({ id }) });
const patch = (sent: unknown, eid = entry, id = read) =>
  PATCH(request("PATCH", sent), { params: Promise.resolve({ id, eid }) });
const del = (eid = entry, id = read) =>
  DELETE(request("DELETE"), { params: Promise.resolve({ id, eid }) });

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

describe("the entry routes", () => {
  it("are 401 without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await post({ body: "x" })).status).toBe(401);
    expect((await patch({ body: "x" })).status).toBe(401);
    expect((await del()).status).toBe(401);
  });

  it("are 404 on a bad read id or a bad entry id, without a call", async () => {
    const badRead = await post({ body: "x" }, "nope");
    expect(badRead.status).toBe(404);
    expect((await badRead.json()).error.message).toBe("No read by that id.");
    const badEntry = await patch({ body: "x" }, "nope");
    expect(badEntry.status).toBe(404);
    expect((await badEntry.json()).error.message).toBe(
      "No entry by that id on this read.",
    );
    expect((await del(entry, "nope")).status).toBe(404);
    expect(createEntry).not.toHaveBeenCalled();
    expect(updateEntry).not.toHaveBeenCalled();
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it("are 415 off JSON", async () => {
    expect((await post({ body: "x" }, read, "text/plain")).status).toBe(415);
  });

  it("are 400 with the field on a bad body", async () => {
    const answer = await post({ body: "  " });
    expect(answer.status).toBe(400);
    expect((await answer.json()).error).toEqual({
      code: "invalid_request",
      message: "That isn't an entry.",
      fields: { body: "Write something." },
    });
    expect((await patch({})).status).toBe(400);
    expect(createEntry).not.toHaveBeenCalled();
  });
});

describe("POST .../entries", () => {
  it("is 201 with the id, the caller's and the read's", async () => {
    createEntry.mockResolvedValue({ id: entry });
    const answer = await post({
      body: "p. 112",
      anchorKind: "page",
      anchorValue: "112",
    });
    expect(answer.status).toBe(201);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(await answer.json()).toEqual({ id: entry });
    expect(createEntry).toHaveBeenCalledWith(
      {},
      {
        userId: user.id,
        readId: read,
        body: "p. 112",
        anchorKind: "page",
        anchorValue: "112",
      },
    );
  });

  it("is 404 on another person's read", async () => {
    createEntry.mockRejectedValue(new NotFoundError("No read by that id."));
    const answer = await post({ body: "mine" });
    expect(answer.status).toBe(404);
    expect((await answer.json()).error.code).toBe("not_found");
  });

  it("is 400 at anchorKind naming the kinds the work takes", async () => {
    createEntry.mockRejectedValue(
      new RuleError("anchorKind", "A book takes page or chapter."),
    );
    const answer = await post({
      body: "x",
      anchorKind: "episode",
      anchorValue: "S02E03",
    });
    expect(answer.status).toBe(400);
    expect((await answer.json()).error.fields).toEqual({
      anchorKind: "A book takes page or chapter.",
    });
  });

  it("rethrows what it doesn't know", async () => {
    createEntry.mockRejectedValue(new RangeError("boom"));
    await expect(post({ body: "x" })).rejects.toThrow(RangeError);
  });
});

describe("PATCH and DELETE .../entries/<eid>", () => {
  it("PATCH is 200 with the entry, called with both ids", async () => {
    const row = {
      id: entry,
      occurrence: read,
      writtenAt: "2026-11-02T21:14:03.512345Z",
      body: "Again.",
      anchorKind: null,
      anchorValue: null,
    };
    updateEntry.mockResolvedValue(row);
    const answer = await patch({ body: "Again." });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual(row);
    expect(updateEntry).toHaveBeenCalledWith(
      {},
      { userId: user.id, readId: read, entryId: entry, body: "Again." },
    );
  });

  it("PATCH is 404 on an entry not on the caller's read", async () => {
    updateEntry.mockRejectedValue(
      new NotFoundError("No entry by that id on this read."),
    );
    expect((await patch({ body: "x" })).status).toBe(404);
  });

  it("DELETE is 204 with no body, and 404 when not the caller's", async () => {
    deleteEntry.mockResolvedValueOnce(undefined);
    const answer = await del();
    expect(answer.status).toBe(204);
    expect(await answer.text()).toBe("");
    expect(deleteEntry).toHaveBeenCalledWith(
      {},
      { userId: user.id, readId: read, entryId: entry },
    );
    deleteEntry.mockRejectedValueOnce(
      new NotFoundError("No entry by that id on this read."),
    );
    expect((await del()).status).toBe(404);
  });
});
