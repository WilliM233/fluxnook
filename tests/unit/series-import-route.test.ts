import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import {
  ProviderBusy,
  ProviderError,
  ProviderNotConfigured,
} from "@/lib/providers/comicvine";

// POST /api/v1/series/import without a database or Comic Vine: auth, the
// client, the cover store and the catalog function are mocked, so this is
// the route's own logic, its errors and its silence in the log.
const { getUser, importSeriesFromComicVine } = vi.hoisted(() => ({
  getUser: vi.fn(),
  importSeriesFromComicVine: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/db/client", () => ({ serverDb: () => ({}) }));
vi.mock("@/lib/covers", () => ({ coverStoreOrNull: () => null }));
vi.mock("@/lib/catalog/series", () => ({ importSeriesFromComicVine }));
vi.mock("@/lib/providers/comicvine", async (actual) => ({
  ...(await actual<typeof import("@/lib/providers/comicvine")>()),
  comicVineFromEnv: () => ({}),
}));

const { POST } = await import("@/app/api/v1/series/import/route");

const user = { id: "af58f162-9de1-4c3f-a84c-be3d0769432f", email: "l@x.dev" };
const id = "7a1b2c3d-0000-4000-8000-000000000001";
const body = {
  source: "comicvine",
  key: "volume/20281",
  form: "issue",
  attachTo: { series: "Teenage Mutant Ninja Turtles (Mirage) Vol. 1" },
};
const post = (sent: unknown, type = "application/json") =>
  POST(
    new Request("http://localhost/api/v1/series/import", {
      method: "POST",
      headers: { "content-type": type },
      body: JSON.stringify(sent),
    }),
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

const unavailable = (message: string) => ({
  error: { code: "provider_unavailable", message },
});

describe("POST /api/v1/series/import", () => {
  it("is 401 without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await post(body)).status).toBe(401);
    expect(importSeriesFromComicVine).not.toHaveBeenCalled();
  });

  it("is 415 for a body that isn't JSON", async () => {
    expect((await post(body, "text/plain")).status).toBe(415);
  });

  it("is 400 on a prefixed key, naming the field", async () => {
    const response = await post({ ...body, key: "volume/4050-20281" });
    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.fields.key).toMatch(/no 4050- in front/);
    expect(importSeriesFromComicVine).not.toHaveBeenCalled();
  });

  it("is 400 on a collected run with no format, naming format", async () => {
    const response = await post({
      source: "comicvine",
      key: "volume/50804",
      form: "collected",
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields.format).toMatch(
      /needs a format/,
    );
  });

  it("is 201 with what was created and attached, never cached, and hands attachTo on as sent", async () => {
    importSeriesFromComicVine.mockResolvedValue({
      id,
      created: 62,
      attached: 0,
      known: false,
    });
    const response = await post(body);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ id, created: 62, attached: 0 });
    expect(importSeriesFromComicVine.mock.calls[0][3]).toEqual(body);
  });

  it("is 200 with the series alone when the volume was in already", async () => {
    importSeriesFromComicVine.mockResolvedValue({
      id,
      created: 0,
      attached: 0,
      known: true,
    });
    const response = await post(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id });
  });

  it("is 404 for a volume nobody has", async () => {
    importSeriesFromComicVine.mockRejectedValue(new NotFoundError("x"));
    const response = await post(body);
    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe(
      "Nothing by that key, here or at Comic Vine.",
    );
  });

  it("is 409 with the conflict's own sentence", async () => {
    importSeriesFromComicVine.mockRejectedValue(
      new ConflictError(
        "That run is already attached to another Comic Vine volume.",
      ),
    );
    const response = await post(body);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "conflict",
        message: "That run is already attached to another Comic Vine volume.",
      },
    });
  });

  it.each([
    [
      new ProviderNotConfigured("COMICVINE_API_KEY"),
      "Comic search isn't set up on this nook yet.",
    ],
    [new ProviderBusy(), "Comic Vine is busy. Try again in a few minutes."],
    [
      new ProviderError(502, "Comic Vine"),
      "Comic Vine isn't reachable from this nook right now.",
    ],
  ])(
    "is 503 for %s, saying so plainly and logging nothing",
    async (thrown, message) => {
      importSeriesFromComicVine.mockRejectedValue(thrown);
      const response = await post(body);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual(unavailable(message));
      for (const spy of said) expect(spy).not.toHaveBeenCalled();
    },
  );

  it("lets anything else through", async () => {
    importSeriesFromComicVine.mockRejectedValue(new RangeError("bug"));
    await expect(post(body)).rejects.toBeInstanceOf(RangeError);
  });
});
