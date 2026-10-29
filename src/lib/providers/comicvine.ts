import { readServerEnv } from "@/lib/env";
import packageJson from "../../../package.json";
import { ProviderBusy, ProviderError, ProviderNotConfigured } from "./errors";

export { ProviderBusy, ProviderError, ProviderNotConfigured };

const PROVIDER = "Comic Vine";
const REPO_URL = "https://github.com/WilliM233/fluxnook";

/** Rows per search: one page, in Comic Vine's relevance order. */
export const SEARCH_LIMIT = 20;
/** Issues per `issues` call, Comic Vine's most. */
export const ISSUES_LIMIT = 100;
// 2,000 issues: past it, a total that keeps growing is a lie, not a run.
const ISSUES_MAX_PAGES = 20;

/** The fields each call asks for; the recorder asks for the same. */
export const SEARCH_FIELDS =
  "id,name,start_year,publisher,count_of_issues,image,site_detail_url,deck";
export const VOLUME_FIELDS = `${SEARCH_FIELDS},description`;
export const ISSUE_FIELDS =
  "id,issue_number,name,cover_date,image,site_detail_url,description";

/** Where a record's public page lives; a link off this host is dropped. */
export const SITE_HOST = "https://comicvine.gamespot.com/";
/** The path every cover sits under, on Comic Vine and on the stub. */
export const IMAGE_PATH = "/a/uploads/";

/**
 * The User-Agent on every call. Comic Vine refuses a blank one; this names
 * the nook, its version and a way to reach whoever runs it. The contact goes
 * nowhere else.
 */
export function comicVineUserAgent(contact: string | null) {
  return `Fluxnook/${packageJson.version} (${contact ?? REPO_URL})`;
}

export type ComicVineOptions = {
  apiKey: string | null;
  baseUrl: string;
  userAgent: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/**
 * A Comic Vine client. The key rides every call as `api_key=` in the query
 * string, by Comic Vine's design, so this closure is the only place a URL
 * holding it exists: nothing thrown, logged or returned carries one. The
 * envelope is read before the results, since Comic Vine reports an error
 * behind an HTTP 200. No redirects, no retry.
 */
export function createComicVine({
  apiKey,
  baseUrl,
  userAgent,
  fetch: fetcher = fetch,
  timeoutMs = 20_000,
}: ComicVineOptions) {
  const base = new URL(`${baseUrl.replace(/\/$/, "")}/`);

  async function fetchOnce(url: URL, signal: AbortSignal) {
    const timedOut = new Promise<never>((_, reject) => {
      const fail = () => reject(new ProviderError(504, PROVIDER));
      if (signal.aborted) fail();
      signal.addEventListener("abort", fail, { once: true });
    });
    const request = fetcher(url, {
      headers: { accept: "application/json", "user-agent": userAgent },
      redirect: "manual",
      signal,
    }).catch((error: unknown) => {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(signal.aborted ? 504 : 502, PROVIDER);
    });
    return Promise.race([request, timedOut]);
  }

  /** One call, its envelope checked; `results` is the call's own shape. */
  async function get<T = unknown>(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<Envelope<T>> {
    if (!apiKey) throw new ProviderNotConfigured("COMICVINE_API_KEY");
    const url = new URL(path.replace(/^\//, ""), base);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, String(value));
    }
    const response = await fetchOnce(url, AbortSignal.timeout(timeoutMs));
    if (response.status === 420 || response.status === 429) {
      throw new ProviderBusy();
    }
    if (response.status >= 300 && response.status < 400) {
      throw new ProviderError(502, PROVIDER);
    }
    if (!response.ok) throw new ProviderError(response.status, PROVIDER);
    let body: Envelope<T>;
    try {
      body = (await response.json()) as Envelope<T>;
    } catch {
      throw new ProviderError(502, PROVIDER);
    }
    const code =
      typeof body?.status_code === "number" ? body.status_code : null;
    if (code === 1) return body;
    if (code === 101) throw new ProviderError(404, PROVIDER, code);
    if (/velocity|rate limit/i.test(String(body?.error ?? ""))) {
      throw new ProviderBusy(code);
    }
    throw new ProviderError(502, PROVIDER, code);
  }

  /** Comic Vine's origin for covers: the stub's under test, its own live. */
  const origin = base.origin;

  /** Volumes for a query, one page, junk rows dropped. */
  async function search(query: string): Promise<ComicVineSeries[]> {
    const body = await get<RawVolume[]>("/search/", {
      resources: "volume",
      query,
      limit: SEARCH_LIMIT,
      field_list: SEARCH_FIELDS,
    });
    // A relevance search can list one volume twice; the first stays (R1).
    const found = new Map<string, ComicVineSeries>();
    for (const raw of Array.isArray(body.results) ? body.results : []) {
      const row = mapVolume(raw, origin, false);
      if (row && !found.has(row.key)) found.set(row.key, row);
    }
    return [...found.values()];
  }

  /** One volume by id, with its description as a blurb. */
  async function volume(id: number): Promise<ComicVineSeries> {
    const body = await get<RawVolume>(comicVinePath({ kind: "volume", id }), {
      field_list: VOLUME_FIELDS,
    });
    const row = mapVolume(body.results, origin, true);
    if (!row) throw new ProviderError(502, PROVIDER);
    return row;
  }

  /**
   * Every issue of a volume in cover-date order, a hundred a call. Paging
   * stops at the reported total, at an empty page, or at the page cap, so a
   * total that lies can't spin it.
   */
  async function issues(id: number): Promise<ComicVineIssue[]> {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new RangeError(`Not a Comic Vine volume id: ${id}`);
    }
    const found = new Map<string, ComicVineIssue>();
    let offset = 0;
    for (let page = 0; page < ISSUES_MAX_PAGES; page++) {
      const body = await get<RawIssue[]>("/issues/", {
        filter: `volume:${id}`,
        sort: "cover_date:asc",
        limit: ISSUES_LIMIT,
        offset,
        field_list: ISSUE_FIELDS,
      });
      const rows = Array.isArray(body.results) ? body.results : [];
      for (const raw of rows) {
        const issue = mapIssue(raw, origin);
        if (issue && !found.has(issue.key)) found.set(issue.key, issue);
      }
      offset += rows.length;
      const total = body.number_of_total_results ?? 0;
      if (rows.length === 0 || offset >= total) break;
    }
    return [...found.values()];
  }

  return { get, search, volume, issues };
}

/** One Comic Vine volume in the nook's terms; a search row's description is null. */
export type ComicVineSeries = {
  key: string;
  name: string;
  year: number | null;
  publisher: string | null;
  issueCount: number | null;
  coverUrl: string | null;
  url: string | null;
  summary: string | null;
  description: string | null;
};

/** One issue of a volume. `number` is Comic Vine's string ("1", "1.5", "1A"). */
export type ComicVineIssue = {
  key: string;
  number: string | null;
  name: string | null;
  coverDate: string | null;
  coverUrl: string | null;
  url: string | null;
  summary: string | null;
};

type Envelope<T> = {
  status_code?: number;
  error?: string;
  number_of_total_results?: number;
  number_of_page_results?: number;
  limit?: number;
  offset?: number;
  results: T;
};
type RawImage = { original_url?: string | null } | null;
type RawVolume = {
  id?: number;
  name?: string | null;
  start_year?: string | number | null;
  publisher?: { name?: string | null } | null;
  count_of_issues?: number | null;
  image?: RawImage;
  site_detail_url?: string | null;
  deck?: string | null;
  description?: string | null;
};
type RawIssue = {
  id?: number;
  issue_number?: string | null;
  name?: string | null;
  cover_date?: string | null;
  image?: RawImage;
  site_detail_url?: string | null;
  description?: string | null;
};

type KeyParts = { kind: "volume" | "issue"; id: number };

/** `volume/20281` or `issue/105` → its parts; anything else, prefixes included, is null. */
export function parseComicVineKey(key: string): KeyParts | null {
  const match = key.match(/^(volume|issue)\/([1-9][0-9]{0,9})$/);
  if (!match) return null;
  return { kind: match[1] as KeyParts["kind"], id: Number(match[2]) };
}

/** The API path for a key's parts: Comic Vine's `4050-` and `4000-` prefixes. */
export function comicVinePath({ kind, id }: KeyParts) {
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new RangeError(`Not a Comic Vine ${kind} id: ${id}`);
  }
  return kind === "volume" ? `/volume/4050-${id}/` : `/issue/4000-${id}/`;
}

const positiveId = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;

const trimmed = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function startYear(value: unknown) {
  const text = typeof value === "number" ? String(value) : value;
  return typeof text === "string" && /^\d{4}$/.test(text.trim())
    ? Number(text.trim())
    : null;
}

const count = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

/** A real `YYYY-MM-DD`, or null: "1984-00-00" and "1984-02-30" are null. */
export function coverDate(value: unknown) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1000 || year > 2999) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * A cover as a URL on the given origin: the path of Comic Vine's image when
 * it sits under `IMAGE_PATH`, joined to the client's own base, so the stub
 * serves it under test and no raw URL from a response is ever used.
 */
function coverUrl(image: RawImage | undefined, origin: string) {
  const raw = image?.original_url;
  if (typeof raw !== "string") return null;
  try {
    const { pathname } = new URL(raw);
    return pathname.startsWith(IMAGE_PATH) ? `${origin}${pathname}` : null;
  } catch {
    return null;
  }
}

/** A record's page, only when it is on Comic Vine's own host. */
function siteUrl(value: unknown) {
  return typeof value === "string" && value.startsWith(SITE_HOST)
    ? value
    : null;
}

function mapVolume(
  raw: RawVolume | null | undefined,
  origin: string,
  detail: boolean,
): ComicVineSeries | null {
  const id = positiveId(raw?.id);
  const name = trimmed(raw?.name);
  if (!raw || !id || !name) return null;
  return {
    key: `volume/${id}`,
    name,
    year: startYear(raw.start_year),
    publisher: trimmed(raw.publisher?.name),
    issueCount: count(raw.count_of_issues),
    coverUrl: coverUrl(raw.image, origin),
    url: siteUrl(raw.site_detail_url),
    summary: trimmed(raw.deck),
    description: detail ? cleanHtmlBlurb(raw.description) : null,
  };
}

function mapIssue(
  raw: RawIssue | null | undefined,
  origin: string,
): ComicVineIssue | null {
  const id = positiveId(raw?.id);
  if (!raw || !id) return null;
  return {
    key: `issue/${id}`,
    number: trimmed(raw.issue_number),
    name: trimmed(raw.name),
    coverDate: coverDate(raw.cover_date),
    coverUrl: coverUrl(raw.image, origin),
    url: siteUrl(raw.site_detail_url),
    summary: cleanHtmlBlurb(raw.description),
  };
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

function decodeEntities(text: string) {
  return text.replace(
    /&(#[0-9]+|#x[0-9a-f]+|[a-z]+);/gi,
    (whole, name: string) => {
      if (name[0] !== "#") return NAMED[name.toLowerCase()] ?? whole;
      const point =
        name[1] === "x" || name[1] === "X"
          ? Number.parseInt(name.slice(2), 16)
          : Number.parseInt(name.slice(1), 10);
      return point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : whole;
    },
  );
}

const plainText = (html: string) =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

/**
 * Comic Vine's HTML description as a summary, the 1.3 blurb rule's shape for
 * HTML: the first paragraph with words in it (the whole text when there are
 * no paragraphs), tags stripped, entities decoded, whitespace collapsed.
 */
export function cleanHtmlBlurb(html: string | null | undefined): string | null {
  if (!html) return null;
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(
    (match) => match[1],
  );
  for (const piece of paragraphs.length ? paragraphs : [html]) {
    const text = plainText(piece);
    if (text) return text;
  }
  return null;
}

export type ComicVine = ReturnType<typeof createComicVine>;

/** The client a route uses: settings from the server's environment. */
export function comicVineFromEnv(): ComicVine {
  const env = readServerEnv();
  return createComicVine({
    apiKey: env.comicVineApiKey,
    baseUrl: env.comicVineBaseUrl,
    userAgent: comicVineUserAgent(env.comicVineContact),
  });
}
