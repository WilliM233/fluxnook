import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProviderError,
  ProviderNotConfigured,
  type TmdbItem,
} from "@/lib/providers/tmdb";

// GET /api/v1/providers/tmdb/search without a database or TMDB: auth, the
// client and the matcher are mocked, so this is the route's own logic.
const { getUser, search, details, tmdbFromEnv, catalogStatuses } = vi.hoisted(
  () => ({
    getUser: vi.fn(),
    search: vi.fn(),
    details: vi.fn(),
    tmdbFromEnv: vi.fn(),
    catalogStatuses: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/db/client", () => ({ serverDb: () => ({}) }));
vi.mock("@/lib/catalog/match", () => ({ catalogStatuses }));
vi.mock("@/lib/providers/tmdb", async (actual) => ({
  ...(await actual<typeof import("@/lib/providers/tmdb")>()),
  tmdbFromEnv,
}));

const { GET } = await import("@/app/api/v1/providers/tmdb/search/route");

const user = { id: "af58f162-9de1-4c3f-a84c-be3d0769432f", email: "l@x.dev" };
const call = (query: string) =>
  GET(new Request(`http://localhost/api/v1/providers/tmdb/search?${query}`));

const film = {
  kind: "movie",
  key: "movie/1",
  title: "Carrie",
  year: 2013,
} as TmdbItem;

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user } });
  tmdbFromEnv.mockReturnValue({ search, details });
});

describe("GET /api/v1/providers/tmdb/search", () => {
  it("is 401 without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await call("q=carrie");
    expect(response.status).toBe(401);
    expect(search).not.toHaveBeenCalled();
  });

  it("is 400 invalid_request for a query under two characters", async () => {
    const response = await call("q=c");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_request" },
    });
  });

  // Rummage R6 (Raccoon N8): a bad page is a bad page, not a short query.
  it("is 400 naming page, not the query, for page=abc", async () => {
    const response = await call("q=carrie&page=abc");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).not.toContain("two characters");
    expect(body.error.fields).toHaveProperty("page");
  });

  it("is 503 provider_unavailable with no token, and says nothing of TMDB's", async () => {
    search.mockRejectedValue(new ProviderNotConfigured());
    const response = await call("q=carrie");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "provider_unavailable",
        message: "Search isn't set up on this nook yet.",
      },
    });
  });

  it("is 503 when TMDB refuses, such as a 429", async () => {
    search.mockRejectedValue(new ProviderError(429));
    const response = await call("q=carrie");
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("provider_unavailable");
    expect(body).not.toContain("429");
  });

  it("puts a catalog status on every row and is never cached", async () => {
    search.mockResolvedValue({ page: 1, totalPages: 1, results: [film] });
    catalogStatuses.mockResolvedValue([{ status: "new" }]);
    const response = await call("q=carrie&type=film");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      page: 1,
      totalPages: 1,
      results: [{ ...film, catalog: { status: "new" } }],
    });
    expect(catalogStatuses).toHaveBeenCalledWith(
      {},
      { userId: user.id, rows: [film] },
    );
  });
});
