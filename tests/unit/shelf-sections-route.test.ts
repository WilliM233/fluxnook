import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";

// POST /api/v1/shelves/<id>/sections and PATCH, DELETE .../sections/<sid>
// without a database: auth and the lib mocked (A4).
const { getUser, createSection, updateSection, deleteSection } = vi.hoisted(
  () => ({
    getUser: vi.fn(),
    createSection: vi.fn(),
    updateSection: vi.fn(),
    deleteSection: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/db/client", () => ({ serverDb: () => ({}) }));
vi.mock("@/lib/shelves/sections", () => ({
  NO_SECTION: "No section by that id on this shelf.",
  createSection,
  updateSection,
  deleteSection,
}));

const { POST } = await import("@/app/api/v1/shelves/[id]/sections/route");
const { PATCH, DELETE } = await import(
  "@/app/api/v1/shelves/[id]/sections/[sid]/route"
);

const user = { id: "af58f162-9de1-4c3f-a84c-be3d0769432f", email: "l@x.dev" };
const shelf = "7a1b2c3d-0000-4000-8000-0000000000a1";
const section = "7a1b2c3d-0000-4000-8000-0000000000b1";

const request = (method: string, sent?: unknown, type = "application/json") =>
  new Request("http://localhost/api/v1/shelves/x/sections", {
    method,
    headers: { "content-type": type },
    body: sent === undefined ? undefined : JSON.stringify(sent),
  });

const post = (sent: unknown, id = shelf, type?: string) =>
  POST(request("POST", sent, type), { params: Promise.resolve({ id }) });
const patch = (sent: unknown, sid = section, id = shelf) =>
  PATCH(request("PATCH", sent), { params: Promise.resolve({ id, sid }) });
const del = (sid = section, id = shelf) =>
  DELETE(request("DELETE"), { params: Promise.resolve({ id, sid }) });

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

describe("the section routes", () => {
  it("are 401 without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await post({ name: "x" })).status).toBe(401);
    expect((await patch({ name: "x" })).status).toBe(401);
    expect((await del()).status).toBe(401);
  });

  it("are 404 on a bad shelf id or a bad section id, each in its own words, without a call", async () => {
    const shelfMessage = async (response: Response) =>
      (await response.json()).error.message;
    expect(await shelfMessage(await post({ name: "x" }, "nope"))).toBe(
      "No shelf by that id.",
    );
    expect(
      await shelfMessage(await patch({ name: "x" }, section, "nope")),
    ).toBe("No shelf by that id.");
    const bad = await del("nope");
    expect(bad.status).toBe(404);
    expect(await shelfMessage(bad)).toBe(
      "No section by that id on this shelf.",
    );
    for (const write of [createSection, updateSection, deleteSection]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("are 415 on a body that isn't JSON, 400 on one the schema refuses", async () => {
    expect((await post({ name: "x" }, shelf, "text/plain")).status).toBe(415);
    const response = await patch({ position: 0 });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual({
      code: "invalid_request",
      message: "That isn't a section.",
      fields: { position: "Positions start at 1." },
    });
  });
});

describe("POST /api/v1/shelves/<id>/sections", () => {
  it("is 201 with the id, the shelf, the caller and the trimmed name passed", async () => {
    createSection.mockResolvedValue({ id: section });
    const response = await post({ name: " Carrie " });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ id: section });
    expect(createSection).toHaveBeenCalledWith(
      {},
      { shelfId: shelf, userId: user.id, name: "Carrie" },
    );
  });

  it("is 409 naming the section when the shelf has one by that name", async () => {
    createSection.mockRejectedValue(
      new ConflictError("The shelf already has a section named Carrie."),
    );
    const response = await post({ name: "Carrie" });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toEqual({
      code: "conflict",
      message: "The shelf already has a section named Carrie.",
    });
  });
});

describe("PATCH and DELETE /api/v1/shelves/<id>/sections/<sid>", () => {
  it("PATCH is 200 with the section, both ids and the caller passed", async () => {
    const row = { id: section, name: "Carrie", position: 1 };
    updateSection.mockResolvedValue(row);
    const response = await patch({ position: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(row);
    expect(updateSection).toHaveBeenCalledWith(
      {},
      { shelfId: shelf, sectionId: section, userId: user.id, position: 1 },
    );
  });

  it("DELETE is 204 with an empty body", async () => {
    deleteSection.mockResolvedValue(undefined);
    const response = await del();
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(deleteSection).toHaveBeenCalledWith(
      {},
      { shelfId: shelf, sectionId: section, userId: user.id },
    );
  });

  it("are 404 when the lib finds no such section on the caller's shelf", async () => {
    const gone = new NotFoundError("No section by that id on this shelf.");
    updateSection.mockRejectedValue(gone);
    deleteSection.mockRejectedValue(gone);
    expect((await patch({ name: "x" })).status).toBe(404);
    expect((await del()).status).toBe(404);
  });

  it("rethrow what they don't know", async () => {
    deleteSection.mockRejectedValue(new RangeError("bug"));
    await expect(del()).rejects.toThrow(RangeError);
  });
});

it("logs nothing on any of these", async () => {
  createSection.mockRejectedValue(new ConflictError("taken"));
  await post({ name: "x" });
  await patch({});
  await del("nope");
  for (const spy of said) expect(spy).not.toHaveBeenCalled();
});
