import { beforeEach, describe, expect, it, vi } from "vitest";

// Rummage R1 (Ch 1.3). Next hands a route its dynamic segment already
// decoded, and the ISBN route decodes it again (`decodeURIComponent` in
// isbn/[isbn]/route.ts). A segment holding a bare `%` (the URL `/isbn/978%25`)
// makes that second decode throw a URIError, and a request that A5 says is a
// 400 "That isn't a valid ISBN." is a 500 instead. Nothing a person types
// should reach the error page by way of the search box's own route.

const { getUser, editionByIsbn, openLibraryFromEnv } = vi.hoisted(() => ({
  getUser: vi.fn(),
  editionByIsbn: vi.fn(),
  openLibraryFromEnv: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/db/client", () => ({ serverDb: () => ({}) }));
vi.mock("@/lib/providers/openlibrary", async (actual) => ({
  ...(await actual<typeof import("@/lib/providers/openlibrary")>()),
  openLibraryFromEnv,
}));

const { GET } = await import(
  "@/app/api/v1/providers/openlibrary/isbn/[isbn]/route"
);

const user = { id: "af58f162-9de1-4c3f-a84c-be3d0769432f", email: "l@x.dev" };

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user } });
  openLibraryFromEnv.mockReturnValue({ editionByIsbn });
});

describe("GET /api/v1/providers/openlibrary/isbn/<segment>", () => {
  it.each(["978%", "97%ZZ743664", "%E0%A4%A"])(
    "a segment that isn't an ISBN is 400, never a thrown URIError: %s",
    async (decoded) => {
      // What Next passes for the URL `/isbn/<encodeURIComponent(decoded)>`.
      const response = await GET(
        new Request(
          `http://localhost/api/v1/providers/openlibrary/isbn/${encodeURIComponent(decoded)}`,
        ),
        { params: Promise.resolve({ isbn: decoded }) },
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_request");
      expect(editionByIsbn).not.toHaveBeenCalled();
    },
  );
});
