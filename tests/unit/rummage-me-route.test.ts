import { beforeEach, describe, expect, it, vi } from "vitest";

// Rummage R2. The auth server, not Zod, decides what a valid address is.
// GoTrue 2.x (supabase CLI 2.121.0) stored both of these from a plain
// POST /auth/v1/otp with the publishable key; z.email() rejects both.
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

const { GET } = await import("@/app/api/v1/me/route");

const id = "af58f162-9de1-4c3f-a84c-be3d0769432f";

describe("GET /api/v1/me for a signed-in user", () => {
  beforeEach(() => getUser.mockReset());

  it.each(["odd!reader@example.com", "reader@example"])(
    "returns { id, email } for %s",
    async (email) => {
      getUser.mockResolvedValue({ data: { user: { id, email } }, error: null });
      const response = await GET();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ id, email });
    },
  );
});
