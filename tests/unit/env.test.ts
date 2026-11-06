import { describe, expect, it } from "vitest";
import { readEnv, readServerEnv } from "@/lib/env";

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

describe("readServerEnv", () => {
  it("reads an empty key as null, so the feature it unlocks is off", () => {
    expect(
      readServerEnv({ TMDB_API_KEY: "", SUPABASE_SECRET_KEY: "" }),
    ).toMatchObject({ tmdbApiKey: null, supabaseSecretKey: null });
  });

  it("fills TMDB's own URLs when none are set", () => {
    expect(readServerEnv({ TMDB_BASE_URL: "" })).toEqual({
      tmdbApiKey: null,
      tmdbBaseUrl: "https://api.themoviedb.org/3",
      tmdbImageBaseUrl: "https://image.tmdb.org/t/p",
      supabaseSecretKey: null,
      openLibraryBaseUrl: "https://openlibrary.org",
      openLibraryCoversBaseUrl: "https://covers.openlibrary.org",
      openLibraryContact: null,
      comicVineApiKey: null,
      comicVineBaseUrl: "https://comicvine.gamespot.com/api",
      comicVineContact: null,
    });
  });

  it("reads an empty Comic Vine key and contact as null", () => {
    expect(
      readServerEnv({ COMICVINE_API_KEY: "", COMICVINE_CONTACT: "" }),
    ).toMatchObject({ comicVineApiKey: null, comicVineContact: null });
  });

  it("returns a set Comic Vine key, base URL and contact", () => {
    expect(
      readServerEnv({
        COMICVINE_API_KEY: "key",
        COMICVINE_BASE_URL: "http://127.0.0.1:4012/api",
        COMICVINE_CONTACT: "nook@example.com",
      }),
    ).toMatchObject({
      comicVineApiKey: "key",
      comicVineBaseUrl: "http://127.0.0.1:4012/api",
      comicVineContact: "nook@example.com",
    });
  });

  it("reads an empty Open Library contact as null", () => {
    expect(readServerEnv({ OPENLIBRARY_CONTACT: "" })).toMatchObject({
      openLibraryContact: null,
    });
  });

  it("returns a set Open Library contact and base URLs", () => {
    expect(
      readServerEnv({
        OPENLIBRARY_BASE_URL: "http://127.0.0.1:4011",
        OPENLIBRARY_COVERS_BASE_URL: "http://127.0.0.1:4011",
        OPENLIBRARY_CONTACT: "nook@example.com",
      }),
    ).toMatchObject({
      openLibraryBaseUrl: "http://127.0.0.1:4011",
      openLibraryCoversBaseUrl: "http://127.0.0.1:4011",
      openLibraryContact: "nook@example.com",
    });
  });

  it("returns a set base URL and key, so tests can point at a stub", () => {
    expect(
      readServerEnv({
        TMDB_API_KEY: "token",
        TMDB_BASE_URL: "http://127.0.0.1:4010/3",
        TMDB_IMAGE_BASE_URL: "http://127.0.0.1:4010/t/p",
      }),
    ).toMatchObject({
      tmdbApiKey: "token",
      tmdbBaseUrl: "http://127.0.0.1:4010/3",
      tmdbImageBaseUrl: "http://127.0.0.1:4010/t/p",
    });
  });
});
