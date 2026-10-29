/**
 * No key for a provider on this nook: its search and import are off, nothing
 * else is. Names the variable to set; TMDB's is the default.
 */
export class ProviderNotConfigured extends Error {
  constructor(readonly variable = "TMDB_API_KEY") {
    super(`${variable} is not set.`);
    this.name = "ProviderNotConfigured";
  }
}

/**
 * A provider answered with something other than a 2xx, or not at all. Carries
 * the status, and a provider's own numeric code when it has one (Comic Vine's
 * `status_code`), never its message, body or URL. One class for every
 * provider, so a route has one `instanceof`.
 */
export class ProviderError extends Error {
  constructor(
    readonly status: number,
    readonly provider = "TMDB",
    readonly code: number | null = null,
  ) {
    super(`${provider} answered ${status}.`);
    this.name = "ProviderError";
  }
}

/**
 * Comic Vine said slow down (its velocity limit, 200 calls per resource an
 * hour). A `ProviderError`, so every existing catch still holds; the comics
 * route checks it first for its own sentence. No retry anywhere.
 */
export class ProviderBusy extends ProviderError {
  constructor(code: number | null = null) {
    super(429, "Comic Vine", code);
    this.name = "ProviderBusy";
  }
}
