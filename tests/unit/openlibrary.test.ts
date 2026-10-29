import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanDescription,
  createOpenLibrary,
  mapPhysicalFormat,
  openLibraryUserAgent,
  ProviderError,
  parseOpenLibraryDate,
} from "@/lib/providers/openlibrary";
import packageJson from "../../package.json";
import {
  type OpenLibraryStub,
  startOpenLibraryStub,
} from "../stub/openlibrary";

// The mapping, against the recordings: every expectation read from the files,
// so a re-record moves the numbers with it. A second stub over a temp dir
// holds the hand-tweaked copies (repeated authors, a string description,
// pages of 0).

const DIR = join(process.cwd(), "tests/fixtures/openlibrary");
const recording = (name: string) =>
  JSON.parse(readFileSync(join(DIR, name), "utf8"));

const carrieSearch = recording("search-carrie-p1.json");
const carrieWork = recording("works-OL81626W.json");
const nightShiftWork = recording("works-OL81608W.json");
const carrieEdition = recording("books-OL32864645M.json");
const itEdition = recording("books-OL28838648M.json");

let stub: OpenLibraryStub;
let tweaked: OpenLibraryStub;
let tmp: string;

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "openlibrary-map-"));
  const write = (name: string, body: unknown) =>
    writeFileSync(join(tmp, name), JSON.stringify(body));
  write("search-tweaks-p1.json", {
    numFound: 41,
    docs: [
      { key: "/works/OL1W", title: "Twice", author_name: ["A. B.", "A. B."] },
      { key: "/works/OL2W", title: "Nobody" },
      { key: "/books/OL3M", title: "Not a work" },
    ],
  });
  write("works-OL1W.json", {
    title: "Plain",
    description: "Just a plain string.",
    covers: [-1, 7],
    authors: [{ author: { key: "/authors/OL19981A" } }],
  });
  write("authors-OL19981A.json", recording("authors-OL19981A.json"));
  write("books-OL1M.json", {
    ...carrieEdition,
    key: "/books/OL1M",
    number_of_pages: 0,
    isbn_13: ["9780804429573"],
    physical_format: "Library Binding",
  });
  write("books-OL2M.json", {
    ...carrieEdition,
    key: "/books/OL2M",
    number_of_pages: -5,
    isbn_13: ["9781501142970"],
    physical_format: "Hardcover",
  });
  stub = await startOpenLibraryStub();
  tweaked = await startOpenLibraryStub({ dir: tmp });
});

afterAll(async () => {
  await stub.close();
  await tweaked.close();
  rmSync(tmp, { recursive: true, force: true });
});

const client = (target: OpenLibraryStub, contact: string | null = "test") =>
  createOpenLibrary({
    baseUrl: target.baseUrl,
    coversBaseUrl: target.coversBaseUrl,
    userAgent: openLibraryUserAgent(contact),
  });

describe("search", () => {
  it("maps every work row of the recording", async () => {
    const page = await client(stub).search("carrie");
    expect(page.results).toHaveLength(carrieSearch.docs.length);
    expect(page.totalPages).toBe(Math.ceil(carrieSearch.numFound / 20));
  });

  it("maps the Carrie row to the one shape", async () => {
    const doc = carrieSearch.docs.find(
      (d: { key: string }) => d.key === "/works/OL81626W",
    );
    const { results } = await client(stub).search("carrie");
    expect(results.find((r) => r.key === "works/OL81626W")).toEqual({
      key: "works/OL81626W",
      title: doc.title,
      authors: doc.author_name,
      year: doc.first_publish_year,
      publishedOn: null,
      publishedPrecision: null,
      editionCount: doc.edition_count,
      coverId: doc.cover_i,
      summary: null,
    });
  });

  it("dedupes authors, reads none as [], no year as null, and drops a non-work key", async () => {
    const { results } = await client(tweaked).search("tweaks");
    expect(results.map((r) => r.key)).toEqual(["works/OL1W", "works/OL2W"]);
    expect(results[0].authors).toEqual(["A. B."]);
    expect(results[1].authors).toEqual([]);
    expect(results[1].year).toBeNull();
  });
});

describe("work", () => {
  it("maps Carrie: the first-publish date, the first cover, the author by key", async () => {
    const before = stub.requests.length;
    const work = await client(stub).work("works/OL81626W");
    expect(work).toMatchObject({
      key: "works/OL81626W",
      title: carrieWork.title,
      authors: ["Stephen King"],
      year: Number(carrieWork.first_publish_date),
      publishedOn: `${carrieWork.first_publish_date}-01-01`,
      publishedPrecision: "year",
      coverId: carrieWork.covers[0],
      editionCount: null,
    });
    const authorCalls = stub.requests
      .slice(before)
      .filter((r) => r.path === "/authors/OL19981A.json");
    expect(authorCalls).toHaveLength(1);
  });

  it("cuts Carrie's summary at the first rule and unwraps its links", async () => {
    const { summary } = await client(stub).work("works/OL81626W");
    const blurb = carrieWork.description.value.split("\r\n")[0];
    expect(summary?.startsWith(blurb)).toBe(true);
    expect(summary).not.toMatch(/Also contained|\]\(|https?:/);
  });

  it("maps Night Shift's day-precision date", async () => {
    const work = await client(stub).work("works/OL81608W");
    expect(nightShiftWork.first_publish_date).toBe("February 1, 1979");
    expect(work.publishedOn).toBe("1979-02-01");
    expect(work.publishedPrecision).toBe("day");
  });

  it("reads a string description, and skips a -1 cover", async () => {
    const work = await client(tweaked).work("works/OL1W");
    expect(work.summary).toBe("Just a plain string.");
    expect(work.coverId).toBe(7);
  });

  it("refuses a key that isn't a work's before any request", async () => {
    const before = stub.requests.length;
    await expect(client(stub).work("books/OL1M")).rejects.toThrow(RangeError);
    expect(stub.requests.length).toBe(before);
  });
});

describe("cleanDescription", () => {
  it("strips emphasis and unwraps a link, nothing else", () => {
    expect(
      cleanDescription(
        '"*It*" is a **novel**. See [the site](https://example.com).',
      ),
    ).toBe('"It" is a novel. See the site.');
  });

  it("keeps a second paragraph before the rule", () => {
    expect(
      cleanDescription({ value: "One.\r\n\r\nTwo.\r\n---\r\nThree." }),
    ).toBe("One.\n\nTwo.");
  });

  it("drops Carrie's source link with its parentheses", () => {
    const summary = cleanDescription(carrieWork.description);
    expect(summary).toBe(carrieWork.description.value.split("\r\n")[0]);
    expect(summary?.endsWith("during the senior prom.")).toBe(true);
  });

  it("drops a link that says only source, in any case", () => {
    expect(cleanDescription("A blurb. ([Source](https://example.com))")).toBe(
      "A blurb.",
    );
    expect(cleanDescription("A blurb. [SOURCE](https://example.com)")).toBe(
      "A blurb.",
    );
    expect(
      cleanDescription("See [the source](https://example.com) for more."),
    ).toBe("See the source for more.");
  });

  it("reads nothing, or only a rule, as null", () => {
    expect(cleanDescription(undefined)).toBeNull();
    expect(cleanDescription({ value: "---\nAlso contained in:" })).toBeNull();
  });
});

describe("editions", () => {
  it("maps Carrie's Anchor paperback through the ISBN redirect", async () => {
    const edition = await client(stub).editionByIsbn("9780307743664");
    expect(edition).toEqual({
      key: "books/OL32864645M",
      workKey: "works/OL81626W",
      title: carrieEdition.title,
      publisher: carrieEdition.publishers[0],
      publishedOn: `${carrieEdition.publish_date}-01-01`,
      publishedPrecision: "year",
      pages: carrieEdition.number_of_pages,
      format: "paperback",
      formatWord: carrieEdition.physical_format,
      isbn13: carrieEdition.isbn_13,
      isbn10: carrieEdition.isbn_10,
      coverId: carrieEdition.covers[0],
    });
  });

  it("maps It's Scribner edition: no format word, no ISBN-10", async () => {
    const edition = await client(stub).edition("books/OL28838648M");
    expect(edition.publisher).toBe(itEdition.publishers[0]);
    expect(edition.pages).toBe(itEdition.number_of_pages);
    expect(edition.format).toBeNull();
    expect(edition.formatWord).toBeNull();
    expect(edition.isbn10).toEqual([]);
    expect(edition.workKey).toBe(itEdition.works[0].key.slice(1));
  });

  it("reads pages of 0 or below as null", async () => {
    expect((await client(tweaked).edition("books/OL1M")).pages).toBeNull();
    expect((await client(tweaked).edition("books/OL2M")).pages).toBeNull();
  });

  it("keeps a format word it can't map, and maps Hardcover", async () => {
    const binding = await client(tweaked).edition("books/OL1M");
    expect(binding.format).toBeNull();
    expect(binding.formatWord).toBe("Library Binding");
    expect((await client(tweaked).edition("books/OL2M")).format).toBe(
      "hardcover",
    );
  });

  it("maps physical_format by word", () => {
    expect(mapPhysicalFormat("mass market paperback")).toBe("paperback");
    expect(mapPhysicalFormat("Kindle Edition")).toBe("ebook");
    expect(mapPhysicalFormat("Audio CD")).toBe("audiobook");
    expect(mapPhysicalFormat(null)).toBeNull();
  });
});

describe("parseOpenLibraryDate", () => {
  it.each([
    ["2011", { on: "2011-01-01", precision: "year" }],
    ["May 1, 1990", { on: "1990-05-01", precision: "day" }],
    ["December 2002", { on: "2002-12-01", precision: "month" }],
    ["2002-12", { on: "2002-12-01", precision: "month" }],
    ["1990-05-01", { on: "1990-05-01", precision: "day" }],
    ["Feb 30, 1990", null],
    ["19uu", null],
    ["c. 1990", null],
    ["[1990]", null],
    ["0990", null],
    ["", null],
  ])("%j", (text, expected) => {
    expect(parseOpenLibraryDate(text)).toEqual(expected);
  });
});

describe("the client's edges", () => {
  it("a 404 is a ProviderError with the status and none of the body's words", async () => {
    const error = await client(stub)
      .work("works/OL1W")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).status).toBe(404);
    expect((error as ProviderError).message).not.toMatch(/notfound/);
  });

  it("refuses a redirect off its base URL and never follows it", async () => {
    const offhost = createOpenLibrary({
      baseUrl: `${stub.baseUrl}/offhost`,
      coversBaseUrl: stub.coversBaseUrl,
      userAgent: "test",
    });
    const before = stub.requests.length;
    const error = await offhost
      .editionByIsbn("9780307743664")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).status).toBe(502);
    expect(stub.requests.length).toBe(before + 1);
  });

  it("sends the nook's User-Agent with the contact, else the repo URL", async () => {
    await client(stub, "nook@example.com").work("works/OL81608W");
    expect(stub.requests.at(-1)?.userAgent).toBe(
      `Fluxnook/${packageJson.version} (nook@example.com)`,
    );
    expect(openLibraryUserAgent(null)).toBe(
      `Fluxnook/${packageJson.version} (https://github.com/WilliM233/fluxnook)`,
    );
  });

  it("gives up on a call that never answers", async () => {
    const hung = createOpenLibrary({
      baseUrl: stub.baseUrl,
      coversBaseUrl: stub.coversBaseUrl,
      userAgent: "test",
      fetch: () => new Promise<Response>(() => {}),
      timeoutMs: 50,
    });
    const error = await hung.search("carrie").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).status).toBe(504);
  });

  it("joins only a positive integer into a cover URL", () => {
    const ol = client(stub);
    expect(ol.coverUrl(9256043)).toBe(
      `${stub.coversBaseUrl}/b/id/9256043-L.jpg?default=false`,
    );
    expect(() => ol.coverUrl(-1)).toThrow(RangeError);
    expect(() => ol.coverUrl(1.5)).toThrow(RangeError);
  });
});
