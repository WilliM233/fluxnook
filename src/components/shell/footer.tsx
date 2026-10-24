/** The signed-in footer: TMDB's attribution, which its API terms require. */
export function Footer() {
  return (
    <footer className="mt-auto flex flex-wrap items-center gap-4 border-t px-4 py-6 text-[13px] text-dim sm:px-10">
      {/* biome-ignore lint/performance/noImgElement: a fixed-size SVG mark; next/image adds nothing here */}
      <img src="/tmdb/blue_short.svg" alt="TMDB" width={92} height={12} />
      <p>
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </footer>
  );
}
