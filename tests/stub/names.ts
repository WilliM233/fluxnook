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

/** The recording a Comic Vine volume is served from: `volume-<id>.json`. */
export function volumeFileName(id: number) {
  return `volume-${id}.json`;
}

/**
 * The recording one page of a Comic Vine volume's issues is served from:
 * `issues-<id>-o<offset>.json`, so a volume past a hundred issues is two files.
 */
export function issuesFileName(id: number, offset: number) {
  return `issues-${id}-o${offset}.json`;
}
