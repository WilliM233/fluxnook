import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/lib/catalog/import";

// POST /api/v1/shelves/<id>/entries and PATCH, DELETE .../entries/<eid>
// without a database: auth and the lib mocked (A5).
const {
  getUser,
  addEntries,
  setEntryStatus,
  moveEntry,
  removeEntry,
  BadItems,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  addEntries: vi.fn(),
  setEntryStatus: vi.fn(),
  moveEntry: vi.fn(),
  removeEntry: vi.fn(),
  BadItems: class BadItems extends Error {},
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/db/client", () => ({ serverDb: () => ({}) }));
vi.mock("@/lib/shelves/entries", () => ({
  NO_ENTRY: "No entry by that id on this shelf.",
  BadItems,
  addEntries,
  setEntryStatus,
  moveEntry,
  removeEntry,
}));

const { POST } = await import("@/app/api/v1/shelves/[id]/entries/route");
const { PATCH, DELETE } = await import(
  "@/app/api/v1/shelves/[id]/entries/[eid]/route"
);

const user = { id: "af58f162-9de1-4c3f-a84c-be3d0769432f", email: "l@x.dev" };
const shelf = "7a1b2c3d-0000-4000-8000-0000000000a1";
const entry = "7a1b2c3d-0000-4000-8000-0000000000c1";
const section = "7a1b2c3d-0000-4000-8000-0000000000b1";
const a = "7a1b2c3d-0000-4000-8000-000000000001";

const request = (method: string, sent?: unknown, type = "application/json") =>
  new Request("http://localhost/api/v1/shelves/x/entries", {
    method,
    headers: { "content-type": type },
    body: sent === undefined ? undefined : JSON.stringify(sent),
  });

const post = (sent: unknown, id = shelf, type?: string) =>
  POST(request("POST", sent, type), { params: Promise.resolve({ id }) });
const patch = (sent: unknown, eid = entry, type?: string) =>
  PATCH(request("PATCH", sent, type), {
    params: Promise.resolve({ id: shelf, eid }),
  });
const del = (eid = entry) =>
  DELETE(request("DELETE"), { params: Promise.resolve({ id: shelf, eid }) });

let said: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user } });
  said = (["error", "warn", "log"] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation(() => {}),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the entry routes", () => {
  it("are 401 without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await post({ items: [a] })).status).toBe(401);
    expect((await patch({ status: "done" })).status).toBe(401);
    expect((await del()).status).toBe(401);
  });

  it("are 404 on a bad shelf id or a bad entry id, without a call", async () => {
    expect((await post({ items: [a] }, "nope")).status).toBe(404);
    const bad = await patch({ status: "done" }, "nope");
    expect(bad.status).toBe(404);
    expect((await bad.json()).error.message).toBe(
      "No entry by that id on this shelf.",
    );
    expect((await del("nope")).status).toBe(404);
    for (const write of [addEntries, setEntryStatus, moveEntry, removeEntry]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("are 415 on a body that isn't JSON", async () => {
    expect((await post({ items: [a] }, shelf, "text/plain")).status).toBe(415);
    expect((await patch({ status: "done" }, entry, "text/plain")).status).toBe(
      415,
    );
  });
});

describe("POST /api/v1/shelves/<id>/entries", () => {
  it("is 201 with added and skipped, the works passed in order", async () => {
    addEntries.mockResolvedValue({ added: 1, skipped: 1 });
    const response = await post({ items: [a, entry], section });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ added: 1, skipped: 1 });
    expect(addEntries).toHaveBeenCalledWith(
      {},
      { shelfId: shelf, userId: user.id, items: [a, entry], section },
    );
  });

  it("is 400 at items when a work isn't in the catalog", async () => {
    addEntries.mockRejectedValue(
      new BadItems("Every work must be in the catalog."),
    );
    const response = await post({ items: [a] });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual({
      code: "invalid_request",
      message: "That isn't a list of works.",
      fields: { items: "Every work must be in the catalog." },
    });
  });

  it("is 400 for an empty list, without a call", async () => {
    expect((await post({ items: [] })).status).toBe(400);
    expect(addEntries).not.toHaveBeenCalled();
  });

  it("is 404 for a section not on the shelf", async () => {
    addEntries.mockRejectedValue(
      new NotFoundError("No section by that id on this shelf."),
    );
    expect((await post({ items: [a], section })).status).toBe(404);
  });
});

describe("PATCH /api/v1/shelves/<id>/entries/<eid>", () => {
  it("a status is 200 with the entry, and moves nothing", async () => {
    const row = {
      id: entry,
      item: a,
      section: null,
      position: 1,
      status: "done",
    };
    setEntryStatus.mockResolvedValue(row);
    const response = await patch({ status: "done" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(row);
    expect(setEntryStatus).toHaveBeenCalledWith(
      {},
      { shelfId: shelf, entryId: entry, userId: user.id, status: "done" },
    );
    expect(moveEntry).not.toHaveBeenCalled();
  });

  it("a move is 200 with every position on the shelf", async () => {
    const positions = [{ id: entry, position: 1 }];
    moveEntry.mockResolvedValue({ positions });
    const response = await patch({ section, index: 0 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ positions });
    expect(moveEntry).toHaveBeenCalledWith(
      {},
      { shelfId: shelf, entryId: entry, userId: user.id, section, index: 0 },
    );
    expect(setEntryStatus).not.toHaveBeenCalled();
  });

  it("both bodies at once is 400 in one sentence, without a call", async () => {
    const response = await patch({ status: "done", section, index: 0 });
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({
      form: "One change at a time: a status, or a section and an index.",
    });
    expect(setEntryStatus).not.toHaveBeenCalled();
    expect(moveEntry).not.toHaveBeenCalled();
  });

  it("is 404 for an entry not on the caller's shelf", async () => {
    setEntryStatus.mockRejectedValue(
      new NotFoundError("No entry by that id on this shelf."),
    );
    expect((await patch({ status: "done" })).status).toBe(404);
  });
});

describe("DELETE /api/v1/shelves/<id>/entries/<eid>", () => {
  it("is 204 with an empty body", async () => {
    removeEntry.mockResolvedValue(undefined);
    const response = await del();
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(removeEntry).toHaveBeenCalledWith(
      {},
      { shelfId: shelf, entryId: entry, userId: user.id },
    );
  });

  it("rethrows what it doesn't know", async () => {
    removeEntry.mockRejectedValue(new RangeError("bug"));
    await expect(del()).rejects.toThrow(RangeError);
  });
});

it("logs nothing on any of these", async () => {
  addEntries.mockRejectedValue(new BadItems("x"));
  await post({ items: [a] });
  await patch({});
  await del("nope");
  for (const spy of said) expect(spy).not.toHaveBeenCalled();
});
