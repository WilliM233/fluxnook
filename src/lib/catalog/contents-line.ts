/**
 * One comic inside an edition's contents, as the Contents line, the
 * Collected in rows and the picker read it. Free of the database, so a
 * client component can print the same line.
 */
export type ContentRow = {
  itemId: string;
  title: string;
  number: number | null;
  series: string | null;
  seriesId: string | null;
  position: number;
};

export type ContentsLineOptions = {
  /** The run the page is about: its issues print as bare numbers, first. */
  own?: { seriesId?: string | null; series?: string | null };
  /** The item the page is about, left out; the line then starts "with". */
  omit?: string;
};

/** Consecutive numbers as runs: [12, 14, 15, 17] is "#12, #14 to #15, #17". */
function runs(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const out: string[] = [];
  let start = 0;
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === sorted[i - 1] + 1) continue;
    const [a, b] = [sorted[start], sorted[i - 1]];
    out.push(a === b ? `#${a}` : `#${a} to #${b}`);
    start = i;
  }
  return out.join(", ");
}

/** A group's numbered rows as runs, then its unnumbered ones by title. */
function groupParts(rows: ContentRow[], label: string | null): string[] {
  const numbered = rows.flatMap((r) => (r.number === null ? [] : [r.number]));
  const titled = rows.filter((r) => r.number === null).map((r) => r.title);
  const head = numbered.length
    ? [label ? `${label} ${runs(numbered)}` : runs(numbered)]
    : [];
  return [...head, ...titled];
}

/**
 * An edition's contents in words: "Teenage Mutant Ninja Turtles (Mirage)
 * Vol. 1 #1 to #7, Raphael: Me, Myself and I". With `own`, that run comes
 * first as bare numbers and the rest follow ", and"; with `omit`, the line
 * says what else the edition holds. Empty when nothing is left to name.
 */
export function contentsLine(
  rows: ContentRow[],
  { own, omit }: ContentsLineOptions = {},
): string {
  const ordered = [...rows]
    .sort((a, b) => a.position - b.position)
    .filter((r) => r.itemId !== omit);
  const isOwn = (r: ContentRow) =>
    own?.seriesId
      ? r.seriesId === own.seriesId
      : own?.series
        ? r.series === own.series
        : false;

  const mine = ordered.filter(isOwn);
  const bySeries = new Map<string, ContentRow[]>();
  const rest: ContentRow[] = [];
  for (const r of ordered) {
    if (isOwn(r)) continue;
    if (r.series === null) rest.push(r);
    else bySeries.set(r.series, [...(bySeries.get(r.series) ?? []), r]);
  }
  const others = [
    ...[...bySeries].flatMap(([series, group]) => groupParts(group, series)),
    ...rest.map((r) => r.title),
  ];

  const ownPart = groupParts(mine, null).join(", ");
  const line =
    ownPart && others.length
      ? `${ownPart}, and ${others.join(", ")}`
      : ownPart || others.join(", ");
  return line && omit ? `with ${line}` : line;
}
