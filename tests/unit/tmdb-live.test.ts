import { expect, it } from "vitest";
import { createTmdb } from "@/lib/providers/tmdb";

// The one live call (Roadmap 2026-10-24): checks the recordings' shape against
// the real API when a token is in .env.local. CI holds none, so it skips there.
const apiKey = process.env.TMDB_API_KEY;

it.skipIf(!apiKey)(
  "the real TMDB still answers in the recordings' shape",
  async () => {
    const tmdb = createTmdb({
      apiKey: apiKey ?? null,
      baseUrl: "https://api.themoviedb.org/3",
      imageBaseUrl: "https://image.tmdb.org/t/p",
    });
    const carrie = await tmdb.movie(133805);
    expect(carrie).toMatchObject({ title: "Carrie", year: 2013 });
    expect(carrie.runtimeMinutes).toBeGreaterThan(0);
    const page = await tmdb.search("carrie");
    expect(page.results.map((r) => r.key)).toContain("movie/133805");
  },
  15_000,
);
