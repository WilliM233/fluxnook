"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CatalogStatus } from "@/lib/catalog/match";
import type { RecentItem } from "@/lib/catalog/recent";
import type { TmdbItem } from "@/lib/providers/tmdb";
import { MatchSheet } from "./match-sheet";
import { Row, sourceLabel } from "./rows";

type Kind = "all" | "film" | "tv";
type Result = TmdbItem & { catalog: CatalogStatus };
type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; results: Result[] }
  | { kind: "unavailable"; message: string }
  | { kind: "error" };

const kinds: { value: Kind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "film", label: "Films" },
  { value: "tv", label: "TV" },
];
const parseKind = (value: string | null): Kind =>
  value === "film" || value === "tv" ? value : "all";

function searchUrl(q: string, type: Kind) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (type !== "all") params.set("type", type);
  const query = params.toString();
  return query ? `/search?${query}` : "/search";
}

const openLink = (id: string) => (
  <Link
    href={`/items/${id}`}
    className="inline-flex min-h-11 items-center rounded-[10px] border border-line-strong px-4.5 text-sm font-medium text-foreground hover:bg-muted"
  >
    Open
  </Link>
);

export function Search({
  recent,
  imageBaseUrl,
  supabaseUrl,
}: {
  recent: RecentItem[];
  imageBaseUrl: string;
  supabaseUrl: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [type, setType] = useState<Kind>(parseKind(params.get("type")));
  const [state, setState] = useState<State>({ kind: "idle" });
  const [matching, setMatching] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(
    null,
  );

  const poster = (path: string | null) =>
    path ? `${imageBaseUrl.replace(/\/$/, "")}/w185${path}` : null;
  const cover = (path: string | null) =>
    path
      ? `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/covers/${path}`
      : null;

  // The URL carries the search, so it can be shared or refreshed; the fetch
  // waits for 300 ms of quiet and drops an answer a newer one replaced.
  useEffect(() => {
    const query = q.trim();
    router.replace(searchUrl(query, type), { scroll: false });
    if (query.length < 2) {
      setState({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState({ kind: "loading" });
      try {
        const response = await fetch(
          `/api/v1/providers/tmdb/search?${new URLSearchParams({ q: query, type })}`,
          { signal: controller.signal },
        );
        const body = await response.json();
        if (response.status === 503) {
          setState({ kind: "unavailable", message: body.error.message });
        } else if (!response.ok) {
          setState({ kind: "error" });
        } else {
          setState({ kind: "results", results: body.results });
        }
      } catch {
        if (!controller.signal.aborted) setState({ kind: "error" });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, type, router]);

  async function add(result: Result, attachTo?: string) {
    setBusy(result.key);
    setFailed(null);
    const response = await fetch("/api/v1/items/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "tmdb", key: result.key, attachTo }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (response?.ok && body?.id) {
      router.push(`/items/${body.id}`);
      return;
    }
    setBusy(null);
    setFailed({
      key: result.key,
      message:
        response?.status === 409
          ? body.error.message
          : "Couldn't add it just now. Try again.",
    });
  }

  function status(result: Result) {
    const c = result.catalog;
    if (c.status === "in") {
      return <span className="text-primary">In your catalog</span>;
    }
    if (c.status === "match") {
      return (
        <span className="text-muted-foreground">
          Looks like one you have: {c.title} ({c.year}), from{" "}
          {sourceLabel[c.source] ?? c.source}
        </span>
      );
    }
    return result.kind === "tv" && result.seasons !== null ? (
      <span className="text-dim">
        {result.seasons} {result.seasons === 1 ? "season" : "seasons"}
      </span>
    ) : null;
  }

  function action(result: Result) {
    const c = result.catalog;
    if (c.status === "in") return openLink(c.itemId);
    return (
      <Button
        size="lg"
        className="min-h-11 px-4.5"
        disabled={busy !== null}
        onClick={() =>
          c.status === "match" ? setMatching(result) : add(result)
        }
      >
        Add
      </Button>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <label
          htmlFor="q"
          className="font-heading text-[34px] leading-tight tracking-tight"
        >
          What are you looking for?
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="q"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="A film or a show"
            className="min-h-13 min-w-0 flex-[1_1_420px] rounded-xl border border-line-strong bg-card px-4 text-[17px] outline-none placeholder:text-dim focus-visible:border-ring"
          />
          <fieldset className="flex gap-1.5 rounded-xl border bg-card p-1">
            <legend className="sr-only">Type</legend>
            {kinds.map((k) => (
              <button
                key={k.value}
                type="button"
                aria-pressed={type === k.value}
                onClick={() => setType(k.value)}
                className={
                  type === k.value
                    ? "rounded-[9px] bg-primary px-3.5 py-2.5 text-[13px] font-semibold text-primary-foreground"
                    : "rounded-[9px] px-3.5 py-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
                }
              >
                {k.label}
              </button>
            ))}
          </fieldset>
        </div>
        <p className="text-[13px] text-dim">
          Results from TMDB. Books and comics come later; until then,{" "}
          <Link
            href="/items/new"
            className="text-primary hover:text-accent-hover"
          >
            add one by hand
          </Link>
          .
        </p>
      </div>

      {state.kind === "unavailable" && (
        <p className="text-muted-foreground">{state.message}</p>
      )}
      {state.kind === "error" && (
        <p className="text-muted-foreground">
          Search didn't answer. Try again in a moment.
        </p>
      )}
      {state.kind === "loading" && (
        <p className="text-dim" aria-live="polite">
          Looking…
        </p>
      )}
      {state.kind === "results" &&
        (state.results.length === 0 ? (
          <p className="text-muted-foreground">Nothing by that name at TMDB.</p>
        ) : (
          <ol aria-label="Results" className="flex flex-col gap-2.5">
            {state.results.map((result) => (
              <Row
                key={result.key}
                thumb={poster(result.posterPath)}
                title={result.title}
                year={result.year}
                type={result.kind}
                summary={result.summary}
                status={
                  <>
                    {status(result)}
                    {failed?.key === result.key && (
                      <span role="alert" className="block text-destructive">
                        {failed.message}
                      </span>
                    )}
                  </>
                }
                action={action(result)}
              />
            ))}
          </ol>
        ))}
      {state.kind === "idle" && (
        <section aria-labelledby="recent" className="flex flex-col gap-3">
          <h2
            id="recent"
            className="text-sm font-semibold text-muted-foreground"
          >
            Recently added to the catalog
          </h2>
          <ol className="flex flex-col gap-2.5">
            {recent.map((item) => (
              <Row
                key={item.id}
                thumb={cover(item.cover_path)}
                title={item.title}
                year={item.year}
                type={item.type}
                action={openLink(item.id)}
              />
            ))}
          </ol>
        </section>
      )}

      {matching?.catalog.status === "match" && (
        <MatchSheet
          result={matching}
          candidates={matching.catalog.candidates}
          poster={poster(matching.posterPath)}
          busy={busy !== null}
          error={failed?.key === matching.key ? failed.message : null}
          onSame={(itemId) => add(matching, itemId)}
          onDifferent={() => add(matching)}
          onClose={() => {
            setMatching(null);
            setFailed(null);
          }}
        />
      )}
    </>
  );
}
