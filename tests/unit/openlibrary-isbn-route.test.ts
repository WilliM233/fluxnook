import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type OpenLibraryEdition,
  type OpenLibraryWork,
  ProviderError,
} from "@/lib/providers/openlibrary";

// GET /api/v1/providers/openlibrary/isbn/<isbn> without a database or Open
// Library: auth, the client, the matcher and the edition lookup are mocked.
const {
  getUser,
  editionByIsbn,
  work,
  openLibraryFromEnv,
  catalogStatuses,
  editionFor,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  editionByIsbn: vi.fn(),
  work: vi.fn(),
  openLibraryFromEnv: vi.fn(),
  catalogStatuses: vi.fn(),
  editionFor: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/db/client", () => ({ serverDb: () => ({}) }));
vi.mock("@/lib/catalog/match", () => ({ catalogStatuses }));
vi.mock("@/lib/catalog/editions", async (actual) => ({
  ...(await actual<typeof import("@/lib/catalog/editions")>()),
  editionFor,
}));
vi.mock("@/lib/providers/openlibrary", async (actual) => ({
  ...(await actual<typeof import("@/lib/providers/openlibrary")>()),
  openLibraryFromEnv,
}));

const { GET } = await import(
  "@/app/api/v1/providers/openlibrary/isbn/[isbn]/route"
);

const user = { id: "af58f162-9de1-4c3f-a84c-be3d0769432f", email: "l@x.dev" };
const call = (isbn: string) =>
  GET(
    new Request(`http://localhost/api/v1/providers/openlibrary/isbn/${isbn}`),
    {
      params: Promise.resolve({ isbn }),
    },
  );

const edition = {
  key: "books/OL32864645M",
  workKey: "works/OL81626W",
  isbn13: ["9780307743664"],
  isbn10: ["0307743667"],
} as OpenLibraryEdition;
const book = { key: "works/OL81626W", title: "Carrie" } as OpenLibraryWork;

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user } });
  openLibraryFromEnv.mockReturnValue({ editionByIsbn, work });
});

describe("GET /api/v1/providers/openlibrary/isbn/<isbn>", () => {
  it("is 401 without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call("9780307743664")).status).toBe(401);
    expect(editionByIsbn).not.toHaveBeenCalled();
  });

  it("is 400 for a bad check digit, and never asks Open Library", async () => {
    const response = await call("978-0-307-74366-5");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "invalid_request", message: "That isn't a valid ISBN." },
    });
    expect(editionByIsbn).not.toHaveBeenCalled();
  });

  it("is 404 not_found when Open Library has no edition", async () => {
    editionByIsbn.mockRejectedValue(new ProviderError(404, "Open Library"));
    const response = await call("9799999999990");
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });

  it("answers the edition, the work with its status and the edition's, never cached", async () => {
    editionByIsbn.mockResolvedValue(edition);
    work.mockResolvedValue(book);
    catalogStatuses.mockResolvedValue([{ status: "new" }]);
    editionFor.mockResolvedValue(null);
    const response = await call("978-0-307-74366-4");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(editionByIsbn).toHaveBeenCalledWith("9780307743664");
    expect(await response.json()).toEqual({
      edition,
      work: { ...book, catalog: { status: "new" } },
      editionCatalog: { status: "new" },
    });
  });
});
