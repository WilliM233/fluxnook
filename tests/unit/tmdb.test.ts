import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTmdb, type Tmdb } from "@/lib/providers/tmdb";
import { startTmdbStub, type TmdbStub } from "../stub/tmdb";

// A3's mapping on the recordings: every expectation is read from the files,
// so a re-record changes the data, never the test.

const DIR = join(process.cwd(), "tests/fixtures/tmdb");
// biome-ignore lint/suspicious/noExplicitAny: raw TMDB JSON
const read = (name: string): any =>
  JSON.parse(readFileSync(join(DIR, name), "utf8"));

const search = read("search-carrie-p1.json");
type Row = {
  media_type: string;
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
};
const row = (media: string, title: string, year: string) =>
  (search.results as Row[]).find(
    (r) =>
      r.media_type === media &&
      (r.title ?? r.name) === title &&
      (r.release_date ?? r.first_air_date ?? "").startsWith(year),
  ) as Row;
const carrie2013 = row("movie", "Carrie", "2013");
const diaries = row("tv", "The Carrie Diaries", "2013");
const movie2013 = read(`movie-${carrie2013.id}.json`);
const show = read(`tv-${diaries.id}.json`);

let stub: TmdbStub;
let tmdb: Tmdb;

beforeAll(async () => {
  stub = await startTmdbStub();
  tmdb = createTmdb({
    apiKey: "stub",
    baseUrl: stub.baseUrl,
    imageBaseUrl: stub.imageBaseUrl,
  });
});

afterAll(() => stub.close());

describe("the TMDB mapping", () => {
  it("search keeps movie and tv rows and drops people", async () => {
    const page = await tmdb.search("carrie", 1);
    const kept = (search.results as Row[]).filter(
      (r) => r.media_type !== "person",
    );
    expect(page.results).toHaveLength(kept.length);
    expect(new Set(page.results.map((r) => r.kind))).toEqual(
      new Set(["movie", "tv"]),
    );
    expect(page.totalPages).toBe(search.total_pages);
  });

  it("a film row carries its key, title, date and poster, and no details", async () => {
    const page = await tmdb.search("carrie", 1);
    const found = page.results.find((r) => r.key === `movie/${carrie2013.id}`);
    expect(found).toMatchObject({
      kind: "movie",
      title: "Carrie",
      year: 2013,
      releasedOn: carrie2013.release_date,
      releasedPrecision: "day",
      seasons: null,
      runtimeMinutes: null,
    });
    expect(found?.posterPath).toBe(
      search.results.find((r: Row) => r.id === carrie2013.id).poster_path,
    );
  });

  it("a show row is kind tv under its name", async () => {
    const page = await tmdb.search("carrie", 1);
    expect(
      page.results.find((r) => r.key === `tv/${diaries.id}`),
    ).toMatchObject({ kind: "tv", title: "The Carrie Diaries", year: 2013 });
  });

  it("movie details map runtime, original title, summary and collection", async () => {
    const item = await tmdb.movie(carrie2013.id);
    expect(item).toMatchObject({
      key: `movie/${carrie2013.id}`,
      runtimeMinutes: movie2013.runtime,
      originalTitle: movie2013.original_title,
      summary: movie2013.overview,
      collection: movie2013.belongs_to_collection
        ? {
            key: `collection/${movie2013.belongs_to_collection.id}`,
            name: movie2013.belongs_to_collection.name,
          }
        : null,
    });
  });

  it("a film in a collection maps it to a franchise key", async () => {
    const carrie1976 = row("movie", "Carrie", "1976");
    const raw = read(`movie-${carrie1976.id}.json`);
    const item = await tmdb.movie(carrie1976.id);
    expect(item.collection).toEqual({
      key: `collection/${raw.belongs_to_collection.id}`,
      name: raw.belongs_to_collection.name,
    });
  });

  it("tv details map seasons, episodes, air dates and ended", async () => {
    const item = await tmdb.tv(diaries.id);
    expect(item).toMatchObject({
      seasons: show.number_of_seasons,
      episodes: show.number_of_episodes,
      firstAired: show.first_air_date,
      lastAired: show.last_air_date,
      ended: ["Ended", "Canceled"].includes(show.status),
      originalTitle: show.original_name,
    });
  });

  it("an empty release date maps both date fields to null", async () => {
    const fake = createTmdb({
      apiKey: "x",
      baseUrl: "http://fake/3",
      imageBaseUrl: "http://fake/t/p",
      fetch: async () =>
        Response.json({ id: 9, title: "Undated", release_date: "" }),
    });
    expect(await fake.movie(9)).toMatchObject({
      releasedOn: null,
      releasedPrecision: null,
      year: null,
    });
  });

  it("a poster path that isn't a plain file name maps to null", async () => {
    const fake = createTmdb({
      apiKey: "x",
      baseUrl: "http://fake/3",
      imageBaseUrl: "http://fake/t/p",
      fetch: async () =>
        Response.json({ id: 9, title: "Sneaky", poster_path: "../x.jpg" }),
    });
    expect((await fake.movie(9)).posterPath).toBeNull();
  });

  it("details refuses a key that isn't TMDB's, before any request", async () => {
    const before = stub.requests.length;
    await expect(tmdb.details("book/1")).rejects.toThrow(/Not a TMDB key/);
    expect(stub.requests.length).toBe(before);
  });
});
