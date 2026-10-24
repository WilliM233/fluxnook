import { Suspense } from "react";
import { serverDb } from "@/db/client";
import { recentItems } from "@/lib/catalog/recent";
import { readEnv, readServerEnv } from "@/lib/env";
import { Search } from "./search";

/**
 * `/search` (A7). The server lists the catalog's newest items for an empty
 * query; the client searches as you type. Neither base URL is a secret: one is
 * TMDB's image host, the other the public covers bucket.
 */
export default async function SearchPage() {
  const recent = await recentItems(serverDb());
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-7 px-6 py-10">
      <Suspense>
        <Search
          recent={recent}
          imageBaseUrl={readServerEnv().tmdbImageBaseUrl}
          supabaseUrl={readEnv().supabaseUrl}
        />
      </Suspense>
    </main>
  );
}
