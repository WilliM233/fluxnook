/**
 * The facts a row prints under a work's title, one formatter for every type
 * (Ch 1.5 A7, census C3). Free of the database, so a client list can print it.
 */
export type WorkFacts = {
  type: string;
  released_on: string | null;
  runtime_minutes?: number | null;
  seasons?: number | null;
  form?: string | null;
  author?: string | null;
  series?: string | null;
  number?: number | null;
};

export const plural = (n: number, one: string) =>
  `${n} ${one}${n === 1 ? "" : "s"}`;

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * film: year · runtime; TV: year · seasons; book: year · form · author;
 * comic: year · series · #n. A part the catalog doesn't hold is left out.
 */
export function workLine(work: WorkFacts): string {
  const year = work.released_on?.slice(0, 4);
  const parts: (string | null | undefined | false)[] = [year];
  switch (work.type) {
    case "film":
      parts.push(work.runtime_minutes != null && `${work.runtime_minutes} min`);
      break;
    case "tv":
      parts.push(work.seasons != null && plural(work.seasons, "season"));
      break;
    case "book":
      parts.push(work.form && capital(work.form), work.author);
      break;
    case "comic":
      parts.push(work.series, work.number != null && `#${work.number}`);
      break;
  }
  return parts.filter(Boolean).join(" · ");
}
