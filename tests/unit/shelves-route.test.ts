import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/lib/catalog/import";

// POST /api/v1/shelves and PATCH, DELETE /api/v1/shelves/<id> without a
// database: auth and the lib are mocked, so this is the routes' own logic,
// their errors and their silence in the log (A3).
const { getUser, createShelf, updateShelf, deleteShelf } = vi.hoisted(() => ({
  getUser: vi.fn(),
  createShelf: vi.fn(),
  updateShelf: vi.fn(),
  deleteShelf: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/db/client", () => ({ serverDb: () => ({}) }));
vi.mock("@/lib/shelves/shelves", () => ({
  createShelf,
  updateShelf,
  deleteShelf,
}));

const { POST } = await import("@/app/api/v1/shelves/route");
const { PATCH, DELETE } = await import("@/app/api/v1/shelves/[id]/route");

const user = { id: "af58f162-9de1-4c3f-a84c-be3d0769432f", email: "l@x.dev" };
const shelf = "7a1b2c3d-0000-4000-8000-0000000000a1";

const request = (method: string, sent?: unknown, type = "application/json") =>
  new Request("http://localhost/api/v1/shelves", {
    method,
    headers: { "content-type": type },
    body: sent === undefined ? undefined : JSON.stringify(sent),
  });
const params = (id = shelf) => ({ params: Promise.resolve({ id }) });

const post = (sent: unknown, type?: string) =>
  POST(request("POST", sent, type));
const patch = (sent: unknown, id?: string, type?: string) =>
  PATCH(request("PATCH", sent, type), params(id));
const del = (id?: string) => DELETE(request("DELETE"), params(id));

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

describe("the shelf routes", () => {
  it("are 401 without a session, and never write", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await post({ name: "x" })).status).toBe(401);
    expect((await patch({ name: "x" })).status).toBe(401);
    expect((await del()).status).toBe(401);
    for (const write of [createShelf, updateShelf, deleteShelf]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("are 404 for a segment that isn't a uuid, without a call", async () => {
    for (const response of [
      await patch({ name: "x" }, "nope"),
      await del("nope"),
    ]) {
      expect(response.status).toBe(404);
      expect((await response.json()).error).toEqual({
        code: "not_found",
        message: "No shelf by that id.",
      });
    }
    expect(updateShelf).not.toHaveBeenCalled();
    expect(deleteShelf).not.toHaveBeenCalled();
  });

  it("are 415 for a body that isn't JSON", async () => {
    expect((await post({ name: "x" }, "text/plain")).status).toBe(415);
    expect((await patch({ name: "x" }, shelf, "text/plain")).status).toBe(415);
  });

  it("are 400 with the field's sentence", async () => {
    const response = await post({ name: " " });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual({
      code: "invalid_request",
      message: "That isn't a shelf.",
      fields: { name: "Give the shelf a name." },
    });
    expect((await patch({})).status).toBe(400);
    expect(createShelf).not.toHaveBeenCalled();
    expect(updateShelf).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/shelves", () => {
  it("is 201 with the id, no-store, the caller and the trimmed name passed", async () => {
    createShelf.mockResolvedValue({ id: shelf });
    const response = await post({ name: "  Stephen King, in order " });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ id: shelf });
    expect(createShelf).toHaveBeenCalledWith(
      {},
      { userId: user.id, name: "Stephen King, in order", description: "" },
    );
  });
});

describe("PATCH /api/v1/shelves/<id>", () => {
  it("is 200 with the shelf as it now stands", async () => {
    const row = { id: shelf, name: "New", description: "" };
    updateShelf.mockResolvedValue(row);
    const response = await patch({ name: "New" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(row);
    expect(updateShelf).toHaveBeenCalledWith(
      {},
      { shelfId: shelf, userId: user.id, name: "New" },
    );
  });

  it("is 404 when the shelf isn't the caller's", async () => {
    updateShelf.mockRejectedValue(new NotFoundError("No shelf by that id."));
    const response = await patch({ name: "New" });
    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe("No shelf by that id.");
  });
});

describe("DELETE /api/v1/shelves/<id>", () => {
  it("is 204 with an empty body", async () => {
    deleteShelf.mockResolvedValue(undefined);
    const response = await del();
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(deleteShelf).toHaveBeenCalledWith(
      {},
      { shelfId: shelf, userId: user.id },
    );
  });

  it("is 404 when the shelf isn't the caller's, never 403", async () => {
    deleteShelf.mockRejectedValue(new NotFoundError("No shelf by that id."));
    expect((await del()).status).toBe(404);
  });

  it("rethrows what it doesn't know, for Next to answer 500", async () => {
    deleteShelf.mockRejectedValue(new RangeError("bug"));
    await expect(del()).rejects.toThrow(RangeError);
  });
});

it("logs nothing on any of these", async () => {
  updateShelf.mockRejectedValue(new NotFoundError("No shelf by that id."));
  await post({ name: "" });
  await patch({ name: "x" });
  await del("nope");
  for (const spy of said) expect(spy).not.toHaveBeenCalled();
});
