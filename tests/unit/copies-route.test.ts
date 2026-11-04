import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import { RuleError } from "@/lib/journal/errors";

// GET, POST /api/v1/copies and PATCH, DELETE /api/v1/copies/<id> without a
// database: auth and the lib mocked (Ch 1.7 A3, A4).
const { getUser, createCopy, updateCopy, deleteCopy, loadOwnership } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    createCopy: vi.fn(),
    updateCopy: vi.fn(),
    deleteCopy: vi.fn(),
    loadOwnership: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/db/client", () => ({ serverDb: () => ({}) }));
vi.mock("@/lib/collection/copies", () => ({
  NO_COPY: "No copy by that id.",
  createCopy,
  updateCopy,
  deleteCopy,
}));
vi.mock("@/lib/collection/owned", () => ({ loadOwnership }));

const { GET, POST } = await import("@/app/api/v1/copies/route");
const { PATCH, DELETE } = await import("@/app/api/v1/copies/[id]/route");

const user = { id: "af58f162-9de1-4c3f-a84c-be3d0769432f", email: "l@x.dev" };
const item = "7A1B2C3D-0000-4000-8000-000000000001";
const edition = "7a1b2c3d-0000-4000-8000-0000000000a1";
const copy = "7a1b2c3d-0000-4000-8000-0000000000c1";
const URL_BASE = "http://localhost/api/v1/copies";

const request = (method: string, sent?: unknown, type = "application/json") =>
  new Request(URL_BASE, {
    method,
    headers: { "content-type": type },
    body: sent === undefined ? undefined : JSON.stringify(sent),
  });

const get = (query: string) => GET(new Request(`${URL_BASE}${query}`));
const post = (sent: unknown, type?: string) =>
  POST(request("POST", sent, type));
const patch = (sent: unknown, id = copy, type?: string) =>
  PATCH(request("PATCH", sent, type), { params: Promise.resolve({ id }) });
const del = (id = copy) =>
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

describe("the copy routes", () => {
  it("are 401 without a session, in the collection's words", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    for (const answer of [
      await get(`?item=${item}`),
      await post({ edition }),
      await patch({ note: "x" }),
      await del(),
    ]) {
      expect(answer.status).toBe(401);
      expect((await answer.json()).error.message).toBe(
        "Sign in to see your collection.",
      );
    }
  });

  it("are 404 on an id that isn't a uuid, without a call", async () => {
    const bad = await patch({ note: "x" }, "not-a-uuid");
    expect(bad.status).toBe(404);
    expect((await bad.json()).error).toEqual({
      code: "not_found",
      message: "No copy by that id.",
    });
    expect((await del("not-a-uuid")).status).toBe(404);
    expect(updateCopy).not.toHaveBeenCalled();
    expect(deleteCopy).not.toHaveBeenCalled();
  });

  it("are 415 off JSON", async () => {
    expect((await post({ edition }, "text/plain")).status).toBe(415);
    expect((await patch({ note: "x" }, copy, "text/plain")).status).toBe(415);
  });

  it("are 400 with the field on a bad body, without a call", async () => {
    const answer = await post({ edition, condition: "mint" });
    expect(answer.status).toBe(400);
    expect((await answer.json()).error).toEqual({
      code: "invalid_request",
      message: "That isn't a copy.",
      fields: { condition: "A condition is new, fine, good, fair or poor." },
    });
    const empty = await patch({});
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.fields).toEqual({
      form: "Nothing to change.",
    });
    expect(createCopy).not.toHaveBeenCalled();
    expect(updateCopy).not.toHaveBeenCalled();
  });
});

describe("POST", () => {
  it("is 201 with both ids, no-store, for the caller", async () => {
    createCopy.mockResolvedValue({ id: copy, editionId: edition });
    const answer = await post({ item, format: "hardcover", note: " Mine. " });
    expect(answer.status).toBe(201);
    expect(answer.headers.get("cache-control")).toContain("no-store");
    expect(await answer.json()).toEqual({ id: copy, editionId: edition });
    expect(createCopy).toHaveBeenCalledWith(
      {},
      {
        userId: user.id,
        item: item.toLowerCase(),
        format: "hardcover",
        note: "Mine.",
      },
    );
  });

  it("is 404 on NotFoundError", async () => {
    createCopy.mockRejectedValue(new NotFoundError("No printing by that id."));
    const answer = await post({ edition });
    expect(answer.status).toBe(404);
    expect((await answer.json()).error.message).toBe("No printing by that id.");
  });

  it("is 409 on ConflictError, in its words", async () => {
    createCopy.mockRejectedValue(new ConflictError("Pick one on its page."));
    const answer = await post({ item, format: "hardcover" });
    expect(answer.status).toBe(409);
    expect((await answer.json()).error).toEqual({
      code: "conflict",
      message: "Pick one on its page.",
    });
  });

  it("is 400 at the field on RuleError", async () => {
    createCopy.mockRejectedValue(new RuleError("format", "A book comes as…"));
    const answer = await post({ item, format: "dvd" });
    expect(answer.status).toBe(400);
    expect((await answer.json()).error).toEqual({
      code: "invalid_request",
      message: "That isn't a copy.",
      fields: { format: "A book comes as…" },
    });
  });

  it("rethrows anything else", async () => {
    createCopy.mockRejectedValue(new RangeError("boom"));
    await expect(post({ edition })).rejects.toThrow("boom");
  });
});

describe("PATCH and DELETE", () => {
  const row = {
    id: copy,
    editionId: edition,
    condition: "fair",
    acquiredOn: null,
    note: "",
    updatedAt: "2026-11-04T12:00:00.000000Z",
  };

  it("PATCH is 200 with the row, no-store, for the caller", async () => {
    updateCopy.mockResolvedValue(row);
    const answer = await patch({ condition: "fair" });
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toContain("no-store");
    expect(await answer.json()).toEqual(row);
    expect(updateCopy).toHaveBeenCalledWith(
      {},
      { userId: user.id, copyId: copy, condition: "fair" },
    );
  });

  it("PATCH is 404 on NotFoundError", async () => {
    updateCopy.mockRejectedValue(new NotFoundError("No copy by that id."));
    expect((await patch({ note: "x" })).status).toBe(404);
  });

  it("DELETE is 204 with an empty body", async () => {
    deleteCopy.mockResolvedValue(undefined);
    const answer = await del();
    expect(answer.status).toBe(204);
    expect(await answer.text()).toBe("");
    expect(deleteCopy).toHaveBeenCalledWith(
      {},
      { userId: user.id, copyId: copy },
    );
  });

  it("DELETE is 404 on NotFoundError", async () => {
    deleteCopy.mockRejectedValue(new NotFoundError("No copy by that id."));
    expect((await del()).status).toBe(404);
  });
});

describe("GET", () => {
  it("is 400 off a uuid and with no item", async () => {
    expect((await get("?item=nope")).status).toBe(400);
    expect((await get("")).status).toBe(400);
    expect(loadOwnership).not.toHaveBeenCalled();
  });

  it("is 200 the two lists, no-store, and no host", async () => {
    const held = [
      {
        id: copy,
        editionId: edition,
        format: "hardcover",
        condition: null,
        acquiredOn: null,
        note: "",
      },
    ];
    loadOwnership.mockResolvedValue({
      held,
      via: [],
      host: { id: "h", title: "A host" },
    });
    const answer = await get(`?item=${item}`);
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toContain("no-store");
    expect(await answer.json()).toEqual({ held, via: [] });
    expect(loadOwnership).toHaveBeenCalledWith(
      {},
      { itemId: item.toLowerCase(), userId: user.id },
    );
  });
});
