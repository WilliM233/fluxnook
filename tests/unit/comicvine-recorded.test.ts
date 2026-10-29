import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type ComicVine,
  createComicVine,
  IMAGE_PATH,
  SITE_HOST,
} from "@/lib/providers/comicvine";
import { type ComicVineStub, startComicVineStub } from "../stub/comicvine";

// A2's mapping on the recordings, through the stub as a route would reach
// Comic Vine. Expectations are read off the files where they can be, so a
// re-record moves them; the junk cases run on tweaked copies in a temp dir.

const RECORDINGS = join(process.cwd(), "tests/fixtures/comicvine");
const raw = (name: string) =>
  JSON.parse(readFileSync(join(RECORDINGS, name), "utf8"));

let stub: ComicVineStub;
let tweaked: ComicVineStub;
let dir: string;
let cv: ComicVine;
let junk: ComicVine;

const client = (baseUrl: string) =>
  createComicVine({ apiKey: "k", baseUrl, userAgent: "test" });

beforeAll(async () => {
  stub = await startComicVineStub();
  cv = client(stub.baseUrl);

  dir = mkdtempSync(join(tmpdir(), "comicvine-junk-"));
  cpSync(RECORDINGS, dir, { recursive: true });
  const issues = raw("issues-20281-o0.json");
  issues.results[1].name = null;
  issues.results[2].issue_number = "1.5";
  issues.results[3].cover_date = null;
  writeFileSync(join(dir, "issues-20281-o0.json"), JSON.stringify(issues));
  const volume = raw("volume-18790.json");
  volume.results.publisher = null;
  writeFileSync(join(dir, "volume-18790.json"), JSON.stringify(volume));
  tweaked = await startComicVineStub({ dir });
  junk = client(tweaked.baseUrl);
});

afterAll(async () => {
  await stub.close();
  await tweaked.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("the search recording", () => {
  it("maps the 1984 run: volume/20281, 1984, Mirage, 62 issues", async () => {
    const rows = await cv.search("teenage mutant ninja turtles");
    expect(rows.find((r) => r.key === "volume/20281")).toMatchObject({
      name: "Teenage Mutant Ninja Turtles",
      year: 1984,
      publisher: "Mirage",
      issueCount: 62,
      summary: "Volume 1.",
      description: null,
    });
  });

  it("every row has a key, a name, a link on Comic Vine's host and a cover on the stub", async () => {
    const rows = await cv.search("teenage mutant ninja turtles");
    expect(rows).toHaveLength(
      raw("search-teenage-mutant-ninja-turtles-p1.json").results.length,
    );
    for (const row of rows) {
      expect(row.key).toMatch(/^volume\/[1-9][0-9]*$/);
      expect(row.name).not.toBe("");
      expect(row.url?.startsWith(SITE_HOST)).toBe(true);
      expect(row.coverUrl?.startsWith(`${stub.origin}${IMAGE_PATH}`)).toBe(
        true,
      );
    }
  });

  it("the stub's cover answers for a mapped coverUrl", async () => {
    const [row] = await cv.search("teenage mutant ninja turtles");
    const cover = await fetch(row.coverUrl as string);
    expect(cover.headers.get("content-type")).toBe("image/jpeg");
  });
});

describe("the volume recordings", () => {
  it("a detail carries its description as a blurb", async () => {
    const row = await cv.volume(20281);
    expect(row.description).toMatch(/^The first TMNT Comic book series\./);
    expect(row.description).not.toMatch(/<|&[a-z]+;/);
  });

  it("volume/18785 is Tales of the TMNT, 2004, 71", async () => {
    expect(await cv.volume(18785)).toMatchObject({
      key: "volume/18785",
      name: "Tales of the TMNT",
      year: 2004,
      publisher: "Mirage",
      issueCount: 71,
      summary: "Volume 2.",
    });
  });

  it("the Ultimate Collection has no deck", async () => {
    expect(await cv.volume(50804)).toMatchObject({
      name: "Teenage Mutant Ninja Turtles: The Ultimate Collection",
      year: 2011,
      publisher: "IDW Publishing",
      issueCount: 7,
      summary: null,
    });
  });

  it("an unrecorded volume is Comic Vine's 404", async () => {
    await expect(cv.volume(1)).rejects.toMatchObject({ status: 404 });
  });
});

describe("the issue recordings", () => {
  it("the 1984 run: 62 issues in cover-date order, eight with no name", async () => {
    const issues = await cv.issues(20281);
    expect(issues).toHaveLength(62);
    for (const issue of issues) {
      expect(issue.key).toMatch(/^issue\/[1-9][0-9]*$/);
      expect(issue.coverDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(issue.coverUrl?.startsWith(`${stub.origin}${IMAGE_PATH}`)).toBe(
        true,
      );
    }
    const dates = issues.map((i) => i.coverDate as string);
    expect(dates).toEqual([...dates].sort());
    expect(
      issues
        .filter((i) => i.name === null)
        .map((i) => Number(i.number))
        .sort((a, b) => a - b),
    ).toEqual([1, 3, 4, 5, 7, 8, 12, 32]);
  });

  it("#1's summary is its first paragraph", async () => {
    const one = (await cv.issues(20281)).find((i) => i.number === "1");
    expect(one?.summary).toMatch(
      /^The Turtles are cornered by the Purple Dragon gang/,
    );
    expect(one?.summary).not.toMatch(/Master Splinter tells/);
  });

  it("the Ultimate Collection's issues are Vol. 1 to Vol. 7, numbered 1 to 7", async () => {
    const issues = await cv.issues(50804);
    expect(issues.map((i) => i.name)).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map((n) => `Vol. ${n}`),
    );
    expect(issues.map((i) => i.number)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
    expect(issues[5].coverDate).toBe("2015-12-31");
  });

  it("a volume with no recorded issues is an empty list", async () => {
    expect(await cv.issues(18790)).toEqual([]);
  });
});

describe("the junk cases, on tweaked copies", () => {
  it("an issue with no name maps name null", async () => {
    const issues = await junk.issues(20281);
    expect(issues[1].name).toBeNull();
  });

  it("a non-integer issue_number stays the string", async () => {
    expect((await junk.issues(20281))[2].number).toBe("1.5");
  });

  it("a null cover date maps null", async () => {
    expect((await junk.issues(20281))[3].coverDate).toBeNull();
  });

  it("a volume with no publisher maps null", async () => {
    expect((await junk.volume(18790)).publisher).toBeNull();
  });
});
