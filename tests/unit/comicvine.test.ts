import { describe, expect, it, vi } from "vitest";
import {
  comicVinePath,
  comicVineUserAgent,
  coverDate,
  createComicVine,
  ProviderBusy,
  ProviderError,
  ProviderNotConfigured,
  parseComicVineKey,
} from "@/lib/providers/comicvine";
import packageJson from "../../package.json";

// The Comic Vine client on hand-made bodies (A2, A3): the envelope read
// first, the key only in the URL the client builds, junk as null.

const BASE = "http://cv.test/api";
const ok = (results: unknown, extra: Record<string, unknown> = {}) =>
  Response.json({
    status_code: 1,
    error: "OK",
    number_of_total_results: Array.isArray(results) ? results.length : 1,
    results,
    ...extra,
  });

function client(answer: (url: URL) => Response | Promise<Response>) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return answer(url);
  }) as unknown as typeof globalThis.fetch;
  const cv = createComicVine({
    apiKey: "k",
    baseUrl: BASE,
    userAgent: comicVineUserAgent(null),
    fetch,
  });
  return { cv, calls, fetch };
}

const volume = {
  id: 20281,
  name: "Teenage Mutant Ninja Turtles",
  start_year: "1984",
  publisher: { name: "Mirage" },
  count_of_issues: 62,
  image: {
    original_url:
      "https://comicvine.gamespot.com/a/uploads/original/0/77/1-tmnt.jpg",
  },
  site_detail_url:
    "https://comicvine.gamespot.com/teenage-mutant-ninja-turtles/4050-20281/",
  deck: "Volume 1.",
  description: "<p>The first run.</p>",
};

const issue = {
  id: 105,
  issue_number: "1",
  name: null,
  cover_date: "1984-05-31",
  image: {
    original_url:
      "https://comicvine.gamespot.com/a/uploads/original/0/77/105-1.jpg",
  },
  site_detail_url: "https://comicvine.gamespot.com/tmnt-1/4000-105/",
  description: "<p>The Turtles are cornered.</p>",
};

describe("parseComicVineKey and comicVinePath", () => {
  it.each([
    ["volume/20281", { kind: "volume", id: 20281 }],
    ["issue/37", { kind: "issue", id: 37 }],
  ])("%s parses", (key, parts) => {
    expect(parseComicVineKey(key)).toEqual(parts);
  });

  it.each([
    ["volume/4050-20281"],
    ["issue/4000-37"],
    ["issue/0"],
    ["volume/01"],
    ["Volume/1"],
    ["volume/1/"],
    ["volume/99999999999"],
    ["series/1"],
    [""],
  ])("%s is not a key", (key) => {
    expect(parseComicVineKey(key)).toBeNull();
  });

  it("rebuilds Comic Vine's prefixed path for each kind", () => {
    expect(comicVinePath({ kind: "volume", id: 20281 })).toBe(
      "/volume/4050-20281/",
    );
    expect(comicVinePath({ kind: "issue", id: 37 })).toBe("/issue/4000-37/");
    expect(() => comicVinePath({ kind: "issue", id: 0 })).toThrow(RangeError);
  });
});

describe("coverDate", () => {
  it.each([
    ["1984-05-31", "1984-05-31"],
    ["1984-00-00", null],
    ["1984-02-30", null],
    ["1984-05", null],
    [null, null],
    ["", null],
  ])("%s → %s", (raw, date) => {
    expect(coverDate(raw)).toBe(date);
  });
});

describe("the calls", () => {
  it("search asks for volumes with the key, json, its fields and the User-Agent", async () => {
    const { cv, calls } = client(() => ok([volume]));
    const rows = await cv.search("teenage mutant ninja turtles");
    const { url, init } = calls[0];
    expect(url.pathname).toBe("/api/search/");
    expect(url.searchParams.get("api_key")).toBe("k");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("resources")).toBe("volume");
    expect(url.searchParams.get("query")).toBe("teenage mutant ninja turtles");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("field_list")).toContain("start_year");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["user-agent"]).toBe(
      `Fluxnook/${packageJson.version} (https://github.com/WilliM233/fluxnook)`,
    );
    expect(init?.redirect).toBe("manual");
    expect(rows).toEqual([
      {
        key: "volume/20281",
        name: "Teenage Mutant Ninja Turtles",
        year: 1984,
        publisher: "Mirage",
        issueCount: 62,
        coverUrl: "http://cv.test/a/uploads/original/0/77/1-tmnt.jpg",
        url: "https://comicvine.gamespot.com/teenage-mutant-ninja-turtles/4050-20281/",
        summary: "Volume 1.",
        description: null,
      },
    ]);
  });

  it("volume asks for the prefixed path and carries the description as a blurb", async () => {
    const { cv, calls } = client(() => ok(volume));
    const row = await cv.volume(20281);
    expect(calls[0].url.pathname).toBe("/api/volume/4050-20281/");
    expect(row.description).toBe("The first run.");
  });

  it("an empty key throws ProviderNotConfigured naming it, and nothing is fetched", async () => {
    const fetch = vi.fn();
    const cv = createComicVine({
      apiKey: null,
      baseUrl: BASE,
      userAgent: "test",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    const error = await cv.search("turtles").catch((e) => e);
    expect(error).toBeInstanceOf(ProviderNotConfigured);
    expect(error.message).toContain("COMICVINE_API_KEY");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a velocity error behind a 200 is ProviderBusy with the code", async () => {
    const { cv } = client(() =>
      Response.json({
        status_code: 107,
        error: "Your velocity has exceeded the maximum allowed for this API.",
        results: [],
      }),
    );
    const error = await cv.search("turtles").catch((e) => e);
    expect(error).toBeInstanceOf(ProviderBusy);
    expect(error.code).toBe(107);
  });

  it.each([420, 429])("an HTTP %i is ProviderBusy", async (status) => {
    const { cv } = client(() => new Response("slow down", { status }));
    await expect(cv.search("turtles")).rejects.toBeInstanceOf(ProviderBusy);
  });

  it("status_code 101 is a 404", async () => {
    const { cv } = client(() =>
      Response.json({
        status_code: 101,
        error: "Object Not Found",
        results: [],
      }),
    );
    const error = await cv.volume(1).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).not.toBeInstanceOf(ProviderBusy);
    expect(error.status).toBe(404);
  });

  it("another non-1 status_code is a 502 with the code", async () => {
    const { cv } = client(() =>
      Response.json({
        status_code: 100,
        error: "Invalid API Key",
        results: [],
      }),
    );
    const error = await cv.search("turtles").catch((e) => e);
    expect(error.status).toBe(502);
    expect(error.code).toBe(100);
  });

  it("a 500 is a ProviderError whose message holds no URL and no key", async () => {
    const { cv } = client(() => new Response("boom", { status: 500 }));
    const error = await cv.search("turtles").catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.status).toBe(500);
    expect(`${error.message} ${error.stack}`).not.toMatch(/http:|api_key|k&/);
  });

  it("a body that isn't JSON is a 502", async () => {
    const { cv } = client(() => new Response("<html>", { status: 200 }));
    await expect(cv.search("turtles")).rejects.toMatchObject({ status: 502 });
  });

  it("a network failure is a 502 and says nothing of the URL", async () => {
    const { cv } = client(() => {
      throw new TypeError("fetch failed: http://cv.test/api/search/?api_key=k");
    });
    const error = await cv.search("turtles").catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.status).toBe(502);
    expect(error.message).not.toContain("api_key");
  });

  it("a call that never answers is a 504 after the timeout", async () => {
    const cv = createComicVine({
      apiKey: "k",
      baseUrl: BASE,
      userAgent: "test",
      timeoutMs: 20,
      fetch: (() => new Promise(() => {})) as unknown as typeof fetch,
    });
    await expect(cv.search("turtles")).rejects.toMatchObject({ status: 504 });
  });

  it("a redirect is a 502, never followed", async () => {
    const { cv, calls } = client(
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://elsewhere.test/" },
        }),
    );
    await expect(cv.search("turtles")).rejects.toMatchObject({ status: 502 });
    expect(calls).toHaveLength(1);
  });
});

describe("issues paging", () => {
  const many = (from: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ...issue,
      id: from + i,
      issue_number: String(from + i),
    }));

  it("pages by offset until the reported total", async () => {
    const { cv, calls } = client((url) => {
      const offset = Number(url.searchParams.get("offset"));
      return ok(offset === 0 ? many(1, 100) : many(101, 50), {
        number_of_total_results: 150,
      });
    });
    const rows = await cv.issues(20281);
    expect(calls.map((c) => c.url.searchParams.get("offset"))).toEqual([
      "0",
      "100",
    ]);
    expect(calls[0].url.searchParams.get("filter")).toBe("volume:20281");
    expect(calls[0].url.searchParams.get("sort")).toBe("cover_date:asc");
    expect(calls[0].url.searchParams.get("limit")).toBe("100");
    expect(rows).toHaveLength(150);
  });

  it("stops at an empty page when the total lies", async () => {
    const { cv, calls } = client((url) =>
      ok(url.searchParams.get("offset") === "0" ? many(1, 100) : [], {
        number_of_total_results: 10000,
      }),
    );
    expect(await cv.issues(1)).toHaveLength(100);
    expect(calls).toHaveLength(2);
  });

  it("stops at the page cap when every page repeats", async () => {
    const { cv, calls } = client(() =>
      ok(many(1, 100), { number_of_total_results: 1_000_000 }),
    );
    expect(await cv.issues(1)).toHaveLength(100);
    expect(calls).toHaveLength(20);
  });

  it("refuses an id that isn't a positive integer", async () => {
    const { cv } = client(() => ok([]));
    await expect(cv.issues(0)).rejects.toBeInstanceOf(RangeError);
  });
});

describe("mapping junk as null", () => {
  const one = async (raw: Record<string, unknown>) => {
    const { cv } = client(() => ok([{ ...issue, ...raw }]));
    return (await cv.issues(1))[0];
  };

  it("an issue maps its own fields", async () => {
    expect(await one({})).toEqual({
      key: "issue/105",
      number: "1",
      name: null,
      coverDate: "1984-05-31",
      coverUrl: "http://cv.test/a/uploads/original/0/77/105-1.jpg",
      url: "https://comicvine.gamespot.com/tmnt-1/4000-105/",
      summary: "The Turtles are cornered.",
    });
  });

  it.each([
    [{ issue_number: "" }, { number: null }],
    [{ issue_number: "  " }, { number: null }],
    [{ issue_number: "1.5" }, { number: "1.5" }],
    [{ issue_number: "1A" }, { number: "1A" }],
    [{ issue_number: "100000000" }, { number: "100000000" }],
    [{ cover_date: "1984-00-00" }, { coverDate: null }],
    [{ cover_date: null }, { coverDate: null }],
    [{ image: null }, { coverUrl: null }],
    [
      { image: { original_url: "https://elsewhere.test/a/uploads/x.jpg" } },
      { coverUrl: "http://cv.test/a/uploads/x.jpg" },
    ],
    [
      { image: { original_url: "https://comicvine.gamespot.com/img/x.jpg" } },
      { coverUrl: null },
    ],
    [{ image: { original_url: "not a url" } }, { coverUrl: null }],
    [{ site_detail_url: "https://evil.test/4000-105/" }, { url: null }],
    [
      { site_detail_url: "https://comicvine.gamespot.com.evil.test/x" },
      { url: null },
    ],
    [{ name: "  The Name  " }, { name: "The Name" }],
    [{ description: null }, { summary: null }],
  ])("%j → %j", async (raw, mapped) => {
    expect(await one(raw)).toMatchObject(mapped);
  });

  it("drops an issue with no usable id", async () => {
    const { cv } = client(() =>
      ok([{ ...issue, id: 0 }, { ...issue, id: "7" }, issue]),
    );
    expect((await cv.issues(1)).map((i) => i.key)).toEqual(["issue/105"]);
  });

  // Rummage R1 (1.4.1): a relevance search can list one volume twice; two
  // rows with one key is a doubled row on the page and a duplicate React key.
  it("keeps one row when a search lists the same volume id twice", async () => {
    const { cv } = client(() =>
      ok([volume, { ...volume, id: 7, name: "Other" }, { ...volume }]),
    );
    const rows = await cv.search("x");
    expect(rows.map((r) => r.key)).toEqual(["volume/20281", "volume/7"]);
  });

  it("drops a volume with no id or a blank name, and reads junk years as null", async () => {
    const { cv } = client(() =>
      ok([
        { ...volume, id: null },
        { ...volume, id: 2, name: "  " },
        { ...volume, id: 3, start_year: "198?" },
        { ...volume, id: 4, publisher: null, count_of_issues: -1, deck: "" },
      ]),
    );
    const rows = await cv.search("x");
    expect(rows.map((r) => r.key)).toEqual(["volume/3", "volume/4"]);
    expect(rows[0].year).toBeNull();
    expect(rows[1]).toMatchObject({
      publisher: null,
      issueCount: null,
      summary: null,
    });
  });
});
