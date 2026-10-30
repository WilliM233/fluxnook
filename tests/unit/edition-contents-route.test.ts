import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";

// PUT /api/v1/editions/<id>/contents without a database: auth and the write
// are mocked, so this is the route's own logic, its errors and its silence
// in the log (Ch 1.4.3, A6).
const { getUser, replaceEditionContents, BadContents } = vi.hoisted(() => ({
  getUser: vi.fn(),
  replaceEditionContents: vi.fn(),
  BadContents: class BadContents extends Error {},
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/db/client", () => ({ serverDb: () => ({}) }));
vi.mock("@/lib/catalog/contents", () => ({
  replaceEditionContents,
  BadContents,
}));

const { PUT } = await import("@/app/api/v1/editions/[id]/contents/route");

const user = { id: "af58f162-9de1-4c3f-a84c-be3d0769432f", email: "l@x.dev" };
const edition = "7a1b2c3d-0000-4000-8000-0000000000e1";
const a = "7a1b2c3d-0000-4000-8000-000000000001";
const b = "7a1b2c3d-0000-4000-8000-000000000002";

const put = (sent: unknown, id = edition, type = "application/json") =>
  PUT(
    new Request(`http://localhost/api/v1/editions/${id}/contents`, {
      method: "PUT",
      headers: { "content-type": type },
      body: JSON.stringify(sent),
    }),
    { params: Promise.resolve({ id }) },
  );

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

describe("PUT /api/v1/editions/<id>/contents", () => {
  it("is 401 without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await put({ items: [a] })).status).toBe(401);
    expect(replaceEditionContents).not.toHaveBeenCalled();
  });

  it("is 404 for a segment that isn't a uuid, and never writes", async () => {
    const response = await put({ items: [a] }, "not-a-uuid");
    expect(response.status).toBe(404);
    expect(replaceEditionContents).not.toHaveBeenCalled();
  });

  it("is 415 for a body that isn't JSON", async () => {
    expect((await put({ items: [a] }, edition, "text/plain")).status).toBe(415);
  });

  it("is 400 on a comic named twice, at items", async () => {
    const response = await put({ items: [a, a] });
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({
      items: "Each comic once.",
    });
    expect(replaceEditionContents).not.toHaveBeenCalled();
  });

  it("is 200 with the count, no-store, the list passed in order", async () => {
    replaceEditionContents.mockResolvedValue({ count: 2 });
    const response = await put({ items: [b, a] });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ count: 2 });
    expect(replaceEditionContents).toHaveBeenCalledWith(
      {},
      { editionId: edition, itemIds: [b, a] },
    );
  });

  it("is 404 when the edition isn't in the catalog", async () => {
    replaceEditionContents.mockRejectedValue(new NotFoundError());
    const response = await put({ items: [a] });
    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe(
      "No edition by that id.",
    );
  });

  it("is 400 at items when a pick can't be held", async () => {
    replaceEditionContents.mockRejectedValue(new BadContents("Not a comic."));
    const response = await put({ items: [a] });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual({
      code: "invalid_request",
      message: "That isn't a list of comics.",
      fields: { items: "Not a comic." },
    });
  });

  it("is 409 for an edition that isn't a comic's", async () => {
    replaceEditionContents.mockRejectedValue(
      new ConflictError("Only a comic's edition has contents."),
    );
    const response = await put({ items: [a] });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("conflict");
  });

  it("logs nothing on any of these", async () => {
    replaceEditionContents.mockRejectedValue(new BadContents("x"));
    await put({ items: [a] });
    await put({ items: [a, a] });
    for (const spy of said) expect(spy).not.toHaveBeenCalled();
  });

  it("rethrows anything else", async () => {
    replaceEditionContents.mockRejectedValue(new RangeError("boom"));
    await expect(put({ items: [a] })).rejects.toThrow(RangeError);
  });
});
