import type { AnchorKind } from "./words";

/**
 * The pill an entry wears for where it was written (Ch 1.6 A2): p. 112,
 * Ch. 7, S02E03 as typed, #7. One formatter for every page that prints one.
 */
export function anchorLabel(kind: AnchorKind, value: string): string {
  switch (kind) {
    case "page":
      return `p. ${value}`;
    case "chapter":
      return `Ch. ${value}`;
    case "episode":
      return value;
    case "issue":
      return `#${value}`;
  }
}

/** A kind's word in the "Where in it" select. */
export function anchorKindLabel(kind: AnchorKind): string {
  return {
    page: "Page",
    chapter: "Chapter",
    episode: "Episode",
    issue: "Issue",
  }[kind];
}
