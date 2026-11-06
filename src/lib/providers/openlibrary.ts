import type { releasedPrecisions } from "@/db/vocabulary";
import { readServerEnv } from "@/lib/env";
import { isValidIsbn10, normalizeIsbn } from "@/lib/isbn";
import packageJson from "../../../package.json";
import { ProviderError } from "./errors";

export { ProviderError };

const PROVIDER = "Open Library";
const REPO_URL = "https://github.com/WilliM233/fluxnook";

/** The search fields the nook reads; the recorder asks for the same. */
export const SEARCH_FIELDS =
  "key,title,author_name,first_publish_year,cover_i,edition_count";
/** Rows per search page. */
export const SEARCH_LIMIT = 20;

/**
 * The User-Agent on every call, as Open Library's policy asks: the nook, its
 * version and a way to reach whoever runs it. The contact goes nowhere else.
 */
export function openLibraryUserAgent(contact: string | null) {
  return `Fluxnook/${packageJson.version} (${contact ?? REPO_URL})`;
}

export type OpenLibraryOptions = {
  baseUrl: string;
  coversBaseUrl: string;
  userAgent: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/**
 * An Open Library client. No key: the User-Agent is the identity. Redirects
 * are followed by hand, once, and only when they land under `baseUrl`, so the
 * ISBN lookup's 302 can't send the server anywhere else (section 1's SSRF
 * line). The base URLs come from the server's environment, never a request.
 */
export function createOpenLibrary({
  baseUrl,
  coversBaseUrl,
  userAgent,
  fetch: fetcher = fetch,
  timeoutMs = 20_000,
}: OpenLibraryOptions) {
  const base = new URL(`${baseUrl.replace(/\/$/, "")}/`);

  const underBase = (url: URL) =>
    url.origin === base.origin && url.pathname.startsWith(base.pathname);

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

  async function get<T = unknown>(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    const url = new URL(path.replace(/^\//, ""), base);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, String(value));
    }
    const signal = AbortSignal.timeout(timeoutMs);
    let response = await fetchOnce(url, signal);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      const next = location ? new URL(location, url) : null;
      if (!next || !underBase(next)) throw new ProviderError(502, PROVIDER);
      response = await fetchOnce(next, signal);
      if (response.status >= 300 && response.status < 400) {
        throw new ProviderError(502, PROVIDER);
      }
    }
    if (!response.ok) throw new ProviderError(response.status, PROVIDER);
    return (await response.json()) as T;
  }

  async function search(query: string, page = 1): Promise<OpenLibraryPage> {
    const body = await get<RawSearch>("/search.json", {
      q: query,
      fields: SEARCH_FIELDS,
      limit: SEARCH_LIMIT,
      page,
    });
    return {
      page,
      totalPages: Math.ceil((body.numFound ?? 0) / SEARCH_LIMIT),
      results: (body.docs ?? []).flatMap((doc) => {
        const key = workKey(doc.key);
        if (!key) return [];
        return [
          {
            key,
            title: doc.title ?? "",
            authors: dedupe(doc.author_name ?? []),
            year: positiveInteger(doc.first_publish_year),
            publishedOn: null,
            publishedPrecision: null,
            editionCount: positiveInteger(doc.edition_count),
            coverId: positiveInteger(doc.cover_i),
            summary: null,
          },
        ];
      }),
    };
  }

  /** The names behind author keys, one call each, deduped in order. */
  async function authorNames(keys: string[]): Promise<string[]> {
    const names: string[] = [];
    for (const key of keys) {
      const id = key.match(/^\/?authors\/(OL[0-9]+A)$/)?.[1];
      if (!id) continue;
      const body = await get<{ name?: string }>(`/authors/${id}.json`);
      if (body.name?.trim()) names.push(body.name.trim());
    }
    return dedupe(names);
  }

  /** A work by key (`works/OL81626W`), with its authors' names. */
  async function work(key: string): Promise<OpenLibraryWork> {
    const id = parseOpenLibraryWorkKey(key);
    if (!id) throw new RangeError(`Not an Open Library work key: ${key}`);
    const body = await get<RawWork>(`/works/${id}.json`);
    const published = parseOpenLibraryDate(body.first_publish_date ?? "");
    const authors = await authorNames(
      (body.authors ?? []).flatMap((a) =>
        a.author?.key ? [a.author.key] : [],
      ),
    );
    return {
      key: `works/${id}`,
      title: body.title ?? "",
      authors,
      year: published ? Number(published.on.slice(0, 4)) : null,
      publishedOn: published?.on ?? null,
      publishedPrecision: published?.precision ?? null,
      editionCount: null,
      coverId: firstCover(body.covers),
      summary: cleanDescription(body.description),
    };
  }

  /** An edition by key (`books/OL32864645M`). */
  async function edition(key: string): Promise<OpenLibraryEdition> {
    const id = parseOpenLibraryEditionKey(key);
    if (!id) throw new RangeError(`Not an Open Library edition key: ${key}`);
    return mapEdition(await get<RawEdition>(`/books/${id}.json`));
  }

  /** The edition an ISBN-13 names, through Open Library's redirect. */
  async function editionByIsbn(isbn13: string): Promise<OpenLibraryEdition> {
    if (normalizeIsbn(isbn13) !== isbn13) {
      throw new RangeError(`Not an ISBN-13: ${isbn13}`);
    }
    return mapEdition(await get<RawEdition>(`/isbn/${isbn13}.json`));
  }

  /** Where a cover is fetched from; `default=false` makes a missing one a 404. */
  function coverUrl(id: number, size: "M" | "L" = "L") {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new RangeError(`Not a cover id: ${id}`);
    }
    return `${coversBaseUrl.replace(/\/$/, "")}/b/id/${id}-${size}.jpg?default=false`;
  }

  return { get, search, authorNames, work, edition, editionByIsbn, coverUrl };
}

type Precision = (typeof releasedPrecisions)[number];

/** One Open Library work in the nook's terms; a search row leaves details null. */
export type OpenLibraryWork = {
  key: string;
  title: string;
  authors: string[];
  year: number | null;
  publishedOn: string | null;
  publishedPrecision: Precision | null;
  editionCount: number | null;
  coverId: number | null;
  summary: string | null;
};

export type OpenLibraryPage = {
  page: number;
  totalPages: number;
  results: OpenLibraryWork[];
};

export type EditionFormat = "paperback" | "hardcover" | "ebook" | "audiobook";

/** One printing: what an ISBN names. */
export type OpenLibraryEdition = {
  key: string;
  workKey: string | null;
  title: string;
  publisher: string | null;
  publishedOn: string | null;
  publishedPrecision: Precision | null;
  pages: number | null;
  format: EditionFormat | null;
  formatWord: string | null;
  isbn13: string[];
  isbn10: string[];
  coverId: number | null;
};

type RawSearch = {
  numFound?: number;
  docs?: {
    key?: string;
    title?: string;
    author_name?: string[];
    first_publish_year?: number;
    cover_i?: number;
    edition_count?: number;
  }[];
};
type RawDescription = string | { value?: string } | undefined;
type RawWork = {
  title?: string;
  authors?: { author?: { key?: string } }[];
  first_publish_date?: string;
  covers?: number[];
  description?: RawDescription;
};
type RawEdition = {
  key?: string;
  title?: string;
  works?: { key?: string }[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  physical_format?: string;
  isbn_13?: string[];
  isbn_10?: string[];
  covers?: number[];
};

/** `works/OL81626W` → `OL81626W`; anything else is not a work key. */
export function parseOpenLibraryWorkKey(key: string) {
  return key.match(/^works\/(OL[0-9]+W)$/)?.[1] ?? null;
}

/** `books/OL32864645M` → `OL32864645M`; anything else is not an edition key. */
export function parseOpenLibraryEditionKey(key: string) {
  return key.match(/^books\/(OL[0-9]+M)$/)?.[1] ?? null;
}

const workKey = (raw: string | undefined) => {
  const key = raw?.replace(/^\//, "") ?? "";
  return parseOpenLibraryWorkKey(key) ? key : null;
};

const dedupe = (names: string[]) => [
  ...new Set(names.map((n) => n.trim()).filter(Boolean)),
];

const positiveInteger = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;

// `editions.pages` is a Postgres integer; a count past it is junk, read as
// none rather than failing the whole import (Rummage R2).
const PAGES_MAX = 2_147_483_647;
const pageCount = (value: unknown) => {
  const pages = positiveInteger(value);
  return pages !== null && pages <= PAGES_MAX ? pages : null;
};

// Open Library pads a work's covers with -1 where one was removed.
const firstCover = (covers: number[] | undefined) =>
  (covers ?? []).map(positiveInteger).find((id) => id !== null) ?? null;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function month(name: string) {
  const lower = name.toLowerCase();
  const index = MONTHS.findIndex(
    (m) => m === lower || (lower.length === 3 && m.startsWith(lower)),
  );
  return index === -1 ? null : index + 1;
}

function dateOf(year: number, monthNumber: number, day: number) {
  if (year < 1000 || year > 2999) return null;
  const date = new Date(Date.UTC(year, monthNumber - 1, day));
  if (date.getUTCMonth() !== monthNumber - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Open Library's free-text dates in the nook's terms: "2011" is a year,
 * "December 2002" a month, "May 1, 1990" a day, and the ISO forms likewise.
 * Anything else ("19uu", "c. 1990", "[1990]") is null, never a guessed day.
 */
export function parseOpenLibraryDate(
  text: string,
): { on: string; precision: Precision } | null {
  const value = text.trim();
  let match = value.match(/^(\d{4})$/);
  if (match) {
    const on = dateOf(Number(match[1]), 1, 1);
    return on ? { on, precision: "year" } : null;
  }
  match = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (match) {
    const on = dateOf(
      Number(match[1]),
      Number(match[2]),
      Number(match[3] ?? 1),
    );
    return on ? { on, precision: match[3] ? "day" : "month" } : null;
  }
  match = value.match(/^([A-Za-z]+)\.? (\d{4})$/);
  if (match) {
    const m = month(match[1]);
    const on = m ? dateOf(Number(match[2]), m, 1) : null;
    return on ? { on, precision: "month" } : null;
  }
  match = value.match(/^([A-Za-z]+)\.? (\d{1,2}), (\d{4})$/);
  if (match) {
    const m = month(match[1]);
    const on = m ? dateOf(Number(match[3]), m, Number(match[2])) : null;
    return on ? { on, precision: "day" } : null;
  }
  return null;
}

/**
 * The nook's format for Open Library's `physical_format`, by word, or null
 * when the word names none of the four a book edition takes here.
 */
export function mapPhysicalFormat(word: string | null | undefined) {
  const lower = word?.toLowerCase() ?? "";
  if (/paperback|softcover|mass market/.test(lower)) return "paperback";
  if (/hardcover|hardback/.test(lower)) return "hardcover";
  if (/ebook|e-book|electronic|kindle/.test(lower)) return "ebook";
  if (/audio/.test(lower)) return "audiobook";
  return null;
}

/**
 * A work's description as a summary (Ch 1.3 Q1, b): the blurb before the
 * first horizontal rule, a link that says only "source" dropped with the
 * parentheses around it (Browse: Carrie ended "(source)"), other markdown
 * links unwrapped to their text and `*emphasis*` stripped. Nothing else is
 * touched.
 */
export function cleanDescription(description: RawDescription): string | null {
  const raw =
    typeof description === "string" ? description : description?.value;
  if (!raw) return null;
  const blurb = raw
    .replace(/\r\n?/g, "\n")
    .split(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m)[0]
    .replace(/[ \t]*\(\s*\[\s*source\s*\]\([^)]*\)\s*\)/gi, "")
    .replace(/[ \t]*\[\s*source\s*\]\([^)]*\)/gi, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*{1,2}([^*\n]+)\*{1,2}/g, "$1")
    .trim();
  return blurb || null;
}

function mapEdition(body: RawEdition): OpenLibraryEdition {
  const key = body.key?.replace(/^\//, "") ?? "";
  if (!parseOpenLibraryEditionKey(key)) throw new ProviderError(502, PROVIDER);
  const published = parseOpenLibraryDate(body.publish_date ?? "");
  const isbn10 = (body.isbn_10 ?? [])
    .map((isbn) => isbn.replace(/[\s-]+/g, "").toUpperCase())
    .filter(isValidIsbn10);
  return {
    key,
    workKey: workKey(body.works?.[0]?.key),
    title: body.title ?? "",
    publisher: body.publishers?.[0]?.trim() || null,
    publishedOn: published?.on ?? null,
    publishedPrecision: published?.precision ?? null,
    pages: pageCount(body.number_of_pages),
    format: mapPhysicalFormat(body.physical_format),
    formatWord: body.physical_format?.trim() || null,
    isbn13: dedupe(
      (body.isbn_13 ?? []).flatMap((isbn) => {
        const normal = normalizeIsbn(isbn);
        return normal && isbn.replace(/[\s-]+/g, "").length === 13
          ? [normal]
          : [];
      }),
    ),
    isbn10,
    coverId: firstCover(body.covers),
  };
}

export type OpenLibrary = ReturnType<typeof createOpenLibrary>;

/** The client a route uses: settings from the server's environment. */
export function openLibraryFromEnv(): OpenLibrary {
  const env = readServerEnv();
  return createOpenLibrary({
    baseUrl: env.openLibraryBaseUrl,
    coversBaseUrl: env.openLibraryCoversBaseUrl,
    userAgent: openLibraryUserAgent(env.openLibraryContact),
  });
}
