import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ComicVineSeries,
  ProviderBusy,
  ProviderError,
  ProviderNotConfigured,
} from "@/lib/providers/comicvine";

// GET /api/v1/providers/comicvine/search without a database or Comic Vine:
// auth, the client and the matcher are mocked, so this is the route's own
// logic, its three 503s and its silence in the log.
const { getUser, search, comicVineFromEnv, seriesStatuses } = vi.hoisted(
  () => ({
    getUser: vi.fn(),
    search: vi.fn(),
    comicVineFromEnv: vi.fn(),
    seriesStatuses: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/db/client", () => ({ serverDb: () => ({}) }));
vi.mock("@/lib/catalog/match", () => ({ seriesStatuses }));
vi.mock("@/lib/providers/comicvine", async (actual) => ({
  ...(await actual<typeof import("@/lib/providers/comicvine")>()),
  comicVineFromEnv,
}));

const { GET } = await import("@/app/api/v1/providers/comicvine/search/route");

const user = { id: "af58f162-9de1-4c3f-a84c-be3d0769432f", email: "l@x.dev" };
const call = (query: string) =>
  GET(
    new Request(`http://localhost/api/v1/providers/comicvine/search?${query}`),
  );

const volume = {
  key: "volume/20281",
  name: "Teenage Mutant Ninja Turtles",
  year: 1984,
} as ComicVineSeries;

let error: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user } });
  comicVineFromEnv.mockReturnValue({ search });
  error = vi.spyOn(console, "error").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const unavailable = (message: string) => ({
  error: { code: "provider_unavailable", message },
});

describe("GET /api/v1/providers/comicvine/search", () => {
  it("is 401 without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call("q=turtles")).status).toBe(401);
    expect(search).not.toHaveBeenCalled();
  });

  it("is 400 naming q for a query under two characters", async () => {
    const response = await call("q=t");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.fields.q).toBe("Search for at least two characters.");
    expect(search).not.toHaveBeenCalled();
  });

  it("is 400 with no q at all", async () => {
    expect((await call("")).status).toBe(400);
  });

  it("puts a catalog status on every row and is never cached", async () => {
    search.mockResolvedValue([volume]);
    seriesStatuses.mockResolvedValue([{ status: "new" }]);
    const response = await call("q=teenage%20mutant%20ninja%20turtles");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      results: [{ ...volume, catalog: { status: "new" } }],
    });
    expect(search).toHaveBeenCalledWith("teenage mutant ninja turtles");
    expect(seriesStatuses).toHaveBeenCalledWith(
      {},
      { userId: user.id, rows: [volume] },
    );
  });

  it.each([
    [
      new ProviderNotConfigured("COMICVINE_API_KEY"),
      "Comic search isn't set up on this nook yet.",
    ],
    [new ProviderBusy(107), "Comic Vine is busy. Try again in a few minutes."],
    [
      new ProviderError(500, "Comic Vine"),
      "Comic Vine didn't answer. Try again in a moment.",
    ],
  ])(
    "%s is a 503 with its own sentence, and nothing is logged",
    async (thrown, message) => {
      search.mockRejectedValue(thrown);
      const response = await call("q=turtles");
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual(unavailable(message));
      expect(error).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    },
  );

  it("rethrows anything else", async () => {
    search.mockRejectedValue(new RangeError("a bug"));
    await expect(call("q=turtles")).rejects.toBeInstanceOf(RangeError);
  });
});
