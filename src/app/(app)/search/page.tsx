import { Suspense } from "react";
import { serverDb } from "@/db/client";
import { recentItems } from "@/lib/catalog/recent";
import { readEnv, readServerEnv } from "@/lib/env";
import { Search } from "./search";

/**
 * `/search` (A7; Ch 1.3 A8, A9). The server lists the catalog's newest items
 * for an empty query; the client searches as you type. No base URL here is a
 * secret: TMDB's image host, Open Library's covers host, the public bucket.
 */
export default async function SearchPage() {
  const recent = await recentItems(serverDb());
  const env = readServerEnv();
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-7 px-6 py-10">
      <Suspense>
        <Search
          recent={recent}
          imageBaseUrl={env.tmdbImageBaseUrl}
          coversBaseUrl={env.openLibraryCoversBaseUrl}
          supabaseUrl={readEnv().supabaseUrl}
        />
      </Suspense>
    </main>
  );
}
