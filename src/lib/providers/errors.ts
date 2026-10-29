/** No TMDB token on this nook: search and import are off, nothing else is. */
export class ProviderNotConfigured extends Error {
  constructor() {
    super("TMDB_API_KEY is not set.");
    this.name = "ProviderNotConfigured";
  }
}

/**
 * A provider answered with something other than a 2xx, or not at all. Carries
 * the status only: the provider's own message never travels further than its
 * client. One class for every provider, so a route has one `instanceof`.
 */
export class ProviderError extends Error {
  constructor(
    readonly status: number,
    readonly provider = "TMDB",
  ) {
    super(`${provider} answered ${status}.`);
    this.name = "ProviderError";
  }
}
