import { expect, it } from "vitest";
import { comicVineUserAgent, createComicVine } from "@/lib/providers/comicvine";

// The one live call pair (the providers skill): checks the recordings' shape
// against the real API when a key is in .env.local. CI holds none, so it
// skips there. Two calls against 200 an hour.
const apiKey = process.env.COMICVINE_API_KEY;

it.skipIf(!apiKey)(
  "the real Comic Vine still answers in the recordings' shape",
  async () => {
    const cv = createComicVine({
      apiKey: apiKey ?? null,
      baseUrl: "https://comicvine.gamespot.com/api",
      userAgent: comicVineUserAgent(null),
    });
    const collection = await cv.volume(50804);
    expect(collection.name).toContain("Ultimate Collection");
    expect(collection.url?.startsWith("https://comicvine.gamespot.com/")).toBe(
      true,
    );
    const rows = await cv.search("teenage mutant ninja turtles");
    expect(rows.map((r) => r.key)).toContain("volume/20281");
  },
  15_000,
);
