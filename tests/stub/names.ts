/**
 * The recording a search is served from: `search-<query>-p<page>.json`. One
 * rule for both stubs and both recorders, so a recording lands where its stub
 * looks.
 */
export function searchFileName(query: string, page: number) {
  const slug = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `search-${slug}-p${page}.json`;
}
