import { describe, expect, it } from "vitest";
import {
  ProviderBusy,
  ProviderError,
  ProviderNotConfigured,
} from "@/lib/providers/errors";

describe("ProviderNotConfigured", () => {
  it("still names TMDB's token by default", () => {
    expect(new ProviderNotConfigured().message).toBe(
      "TMDB_API_KEY is not set.",
    );
  });

  it("names the variable it is given", () => {
    const error = new ProviderNotConfigured("COMICVINE_API_KEY");
    expect(error.message).toBe("COMICVINE_API_KEY is not set.");
    expect(error.variable).toBe("COMICVINE_API_KEY");
  });
});

describe("ProviderError and ProviderBusy", () => {
  it("carries a provider's own code beside the status", () => {
    const error = new ProviderError(502, "Comic Vine", 107);
    expect(error.status).toBe(502);
    expect(error.code).toBe(107);
    expect(new ProviderError(500).code).toBeNull();
  });

  it("a busy Comic Vine is a ProviderError with status 429", () => {
    const error = new ProviderBusy(107);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.status).toBe(429);
    expect(error.provider).toBe("Comic Vine");
    expect(error.name).toBe("ProviderBusy");
  });

  it("no message holds a URL or a key", () => {
    for (const error of [
      new ProviderError(502, "Comic Vine", 107),
      new ProviderBusy(107),
    ]) {
      expect(error.message).not.toMatch(/http|api_key/i);
    }
  });
});
