import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type OpenLibraryWork,
  ProviderError,
} from "@/lib/providers/openlibrary";

// GET /api/v1/providers/openlibrary/search without a database or Open
// Library: auth, the client and the matcher are mocked, so this is the
// route's own logic.
const { getUser, search, openLibraryFromEnv, catalogStatuses } = vi.hoisted(
  () => ({
    getUser: vi.fn(),
    search: vi.fn(),
    openLibraryFromEnv: vi.fn(),
    catalogStatuses: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/db/client", () => ({ serverDb: () => ({}) }));
vi.mock("@/lib/catalog/match", () => ({ catalogStatuses }));
vi.mock("@/lib/providers/openlibrary", async (actual) => ({
  ...(await actual<typeof import("@/lib/providers/openlibrary")>()),
  openLibraryFromEnv,
}));

const { GET } = await import("@/app/api/v1/providers/openlibrary/search/route");

const user = { id: "af58f162-9de1-4c3f-a84c-be3d0769432f", email: "l@x.dev" };
const call = (query: string) =>
  GET(
    new Request(
      `http://localhost/api/v1/providers/openlibrary/search?${query}`,
    ),
  );

const book = {
  key: "works/OL81626W",
  title: "Carrie",
  authors: ["Stephen King"],
  year: 1974,
} as OpenLibraryWork;

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user } });
  openLibraryFromEnv.mockReturnValue({ search });
});

describe("GET /api/v1/providers/openlibrary/search", () => {
  it("is 401 without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await call("q=carrie");
    expect(response.status).toBe(401);
    expect(search).not.toHaveBeenCalled();
  });

  it("is 400 invalid_request naming q for a query under two characters", async () => {
    const response = await call("q=c");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.fields).toHaveProperty("q");
    expect(search).not.toHaveBeenCalled();
  });

  it("is 503 when Open Library fails, and says nothing of its own", async () => {
    search.mockRejectedValue(new ProviderError(503, "Open Library"));
    const response = await call("q=carrie");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "provider_unavailable",
        message: "Open Library didn't answer. Try again in a moment.",
      },
    });
  });

  it("puts a catalog status on every row and is never cached", async () => {
    search.mockResolvedValue({ page: 1, totalPages: 1, results: [book] });
    catalogStatuses.mockResolvedValue([{ status: "new" }]);
    const response = await call("q=carrie");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      page: 1,
      totalPages: 1,
      results: [{ ...book, catalog: { status: "new" } }],
    });
    expect(catalogStatuses).toHaveBeenCalledWith(
      {},
      { userId: user.id, rows: [book] },
    );
  });
});
