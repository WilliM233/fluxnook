import { describe, expect, it, vi } from "vitest";

// Rummage R6. supabase-js signOut() keeps the session when the auth server
// errors (anything but 401/403/404). The route still says 204, so the button's
// "Couldn't sign you out" branch (src/app/nook/sign-out-button.tsx) never runs
// and the person walks away from a shared computer still signed in.
const signOut = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signOut } }),
}));

const { POST } = await import("@/app/api/v1/auth/sign-out/route");

describe("POST /api/v1/auth/sign-out", () => {
  it("is not ok when signOut() reports an error", async () => {
    signOut.mockResolvedValue({
      error: {
        name: "AuthRetryableFetchError",
        message: "fetch failed",
        status: 0,
      },
    });
    const response = await POST();
    expect(response.ok).toBe(false);
  });

  it("is 204 when signOut() succeeds", async () => {
    signOut.mockResolvedValue({ error: null });
    const response = await POST();
    expect(response.status).toBe(204);
  });
});
