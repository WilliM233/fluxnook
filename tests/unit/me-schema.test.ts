import { describe, expect, it } from "vitest";
import { meResponseSchema } from "@/app/api/v1/me/schema";

const id = "6f1c2a5e-8b1d-4c3e-9f2a-1b2c3d4e5f60";

describe("meResponseSchema", () => {
  it("accepts an id and an email", () => {
    expect(meResponseSchema.parse({ id, email: "reader@example.com" })).toEqual(
      { id, email: "reader@example.com" },
    );
  });

  it("rejects an id that is not a uuid", () => {
    expect(() =>
      meResponseSchema.parse({ id: "42", email: "reader@example.com" }),
    ).toThrow();
  });

  it("rejects a missing email", () => {
    expect(() => meResponseSchema.parse({ id })).toThrow();
  });

  it("drops extra keys so the response can't leak user fields", () => {
    const parsed = meResponseSchema.parse({
      id,
      email: "reader@example.com",
      user_metadata: { full_name: "Reader" },
    });
    expect(parsed).not.toHaveProperty("user_metadata");
  });
});
