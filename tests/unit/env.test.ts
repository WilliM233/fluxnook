import { describe, expect, it } from "vitest";
import { readEnv } from "@/lib/env";

const url = "http://127.0.0.1:54321";
const key = "sb_publishable_test";

describe("readEnv", () => {
  it("names NEXT_PUBLIC_SUPABASE_URL when it is unset", () => {
    expect(() =>
      readEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }),
    ).toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("names NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY when it is empty", () => {
    expect(() =>
      readEnv({
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toThrow("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("returns both when they are set", () => {
    expect(
      readEnv({
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      }),
    ).toEqual({ supabaseUrl: url, supabasePublishableKey: key });
  });
});
