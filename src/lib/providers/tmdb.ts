import { readServerEnv } from "@/lib/env";
import { ProviderError, ProviderNotConfigured } from "./errors";

export { ProviderError, ProviderNotConfigured };

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

  async function search(query: string, page = 1): Promise<TmdbPage> {
    const body = await get<RawPage>("/search/multi", { query, page });
    return {
      page: body.page,
      totalPages: body.total_pages,
      results: body.results.flatMap((row) =>
        row.media_type === "movie" || row.media_type === "tv"
          ? [mapRow(row.media_type, row)]
          : [],
      ),
    };
  }

  async function movie(id: number): Promise<TmdbItem> {
    const body = await get<RawMovie>(`/movie/${id}`);
    const belongs = body.belongs_to_collection;
    return {
      ...mapRow("movie", body),
      runtimeMinutes: body.runtime || null,
      collection: belongs
        ? { key: `collection/${belongs.id}`, name: belongs.name }
        : null,
    };
  }

  async function tv(id: number): Promise<TmdbItem> {
    const body = await get<RawTv>(`/tv/${id}`);
    return {
      ...mapRow("tv", body),
      seasons: body.number_of_seasons ?? null,
      episodes: body.number_of_episodes ?? null,
      firstAired: fullDate(body.first_air_date),
      lastAired: fullDate(body.last_air_date),
      ended: body.status === "Ended" || body.status === "Canceled",
    };
  }

  /** Details by source key (`movie/133805`, `tv/46157`). */
  async function details(key: string): Promise<TmdbItem> {
    const parsed = parseTmdbKey(key);
    if (!parsed) throw new RangeError(`Not a TMDB key: ${key}`);
    return parsed.kind === "movie" ? movie(parsed.id) : tv(parsed.id);
  }

  /** Where a poster is fetched from: w500, the one size the nook caches. */
  const posterUrl = (posterPath: string) =>
    `${imageBaseUrl.replace(/\/$/, "")}/w500${posterPath}`;

  return { get, search, movie, tv, details, posterUrl };
}

export type TmdbKind = "movie" | "tv";

/** One TMDB film or show in the nook's terms; a search row leaves details null. */
export type TmdbItem = {
  kind: TmdbKind;
  key: string;
  title: string;
  year: number | null;
  releasedOn: string | null;
  releasedPrecision: "day" | null;
  summary: string | null;
  posterPath: string | null;
  originalTitle: string | null;
  runtimeMinutes: number | null;
  seasons: number | null;
  episodes: number | null;
  firstAired: string | null;
  lastAired: string | null;
  ended: boolean | null;
  collection: { key: string; name: string } | null;
};

export type TmdbPage = {
  page: number;
  totalPages: number;
  results: TmdbItem[];
};

type RawRow = {
  media_type?: string;
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
};
type RawPage = { page: number; total_pages: number; results: RawRow[] };
type RawMovie = RawRow & {
  runtime?: number | null;
  belongs_to_collection?: { id: number; name: string } | null;
};
type RawTv = RawRow & {
  number_of_seasons?: number;
  number_of_episodes?: number;
  last_air_date?: string | null;
  status?: string;
};

/** `movie/<id>` or `tv/<id>`; anything else is not a TMDB key. */
export function parseTmdbKey(key: string) {
  const match = key.match(/^(movie|tv)\/([0-9]+)$/);
  return match ? { kind: match[1] as TmdbKind, id: Number(match[2]) } : null;
}

// TMDB gives a full date or an empty string; anything else reads as unknown.
function fullDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

// Only a plain file name is ever joined to the image base (section 1's SSRF line).
function safePosterPath(value: string | null | undefined) {
  return value && /^\/[A-Za-z0-9]+\.(jpg|png)$/.test(value) ? value : null;
}

function mapRow(kind: TmdbKind, row: RawRow): TmdbItem {
  const releasedOn = fullDate(
    kind === "movie" ? row.release_date : row.first_air_date,
  );
  return {
    kind,
    key: `${kind}/${row.id}`,
    title: (kind === "movie" ? row.title : row.name) ?? "",
    year: releasedOn ? Number(releasedOn.slice(0, 4)) : null,
    releasedOn,
    releasedPrecision: releasedOn ? "day" : null,
    summary: row.overview || null,
    posterPath: safePosterPath(row.poster_path),
    originalTitle:
      (kind === "movie" ? row.original_title : row.original_name) ?? null,
    runtimeMinutes: null,
    seasons: null,
    episodes: null,
    firstAired: null,
    lastAired: null,
    ended: null,
    collection: null,
  };
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
