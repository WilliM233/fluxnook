import { describe, expect, it } from "vitest";
import { magicLinkRequestSchema } from "@/app/api/v1/auth/magic-link/schema";

describe("magicLinkRequestSchema", () => {
  it("accepts an email address", () => {
    expect(
      magicLinkRequestSchema.parse({ email: "reader@example.com" }),
    ).toEqual({ email: "reader@example.com" });
  });

  it.each([
    ["an empty string", { email: "" }],
    ["something that isn't an address", { email: "not-an-email" }],
    ["a missing field", {}],
  ])("rejects %s", (_label, body) => {
    expect(() => magicLinkRequestSchema.parse(body)).toThrow();
  });
});
