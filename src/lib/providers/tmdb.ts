import { readServerEnv } from "@/lib/env";

/** No TMDB token on this nook: search and import are off, nothing else is. */
export class ProviderNotConfigured extends Error {
  constructor() {
    super("TMDB_API_KEY is not set.");
    this.name = "ProviderNotConfigured";
  }
}

/**
 * TMDB answered with something other than a 2xx. Carries the status only:
 * TMDB's own message never travels further than this module.
 */
export class ProviderError extends Error {
  constructor(readonly status: number) {
    super(`TMDB answered ${status}.`);
    this.name = "ProviderError";
  }
}

export type TmdbOptions = {
  apiKey: string | null;
  baseUrl: string;
  imageBaseUrl: string;
  fetch?: typeof fetch;
};

/**
 * A TMDB client. The token lives in this closure and only ever leaves as the
 * Authorization header. The base URLs come from the server's environment,
 * never from a request, so `TMDB_BASE_URL` is the one seam a stub can use.
 */
export function createTmdb({
  apiKey,
  baseUrl,
  imageBaseUrl,
  fetch: fetcher = fetch,
}: TmdbOptions) {
  async function get<T = unknown>(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    if (!apiKey) throw new ProviderNotConfigured();
    const url = new URL(`${baseUrl.replace(/\/$/, "")}${path}`);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, String(value));
    }
    const response = await fetcher(url, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
      },
    });
    if (!response.ok) throw new ProviderError(response.status);
    return (await response.json()) as T;
  }

  return { get, imageBaseUrl };
}

export type Tmdb = ReturnType<typeof createTmdb>;

/** The client a route uses: settings from the server's environment. */
export function tmdbFromEnv(): Tmdb {
  const env = readServerEnv();
  return createTmdb({
    apiKey: env.tmdbApiKey,
    baseUrl: env.tmdbBaseUrl,
    imageBaseUrl: env.tmdbImageBaseUrl,
  });
}
