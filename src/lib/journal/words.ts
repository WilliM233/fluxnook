import type {
  anchorKinds,
  itemTypes,
  occurrenceStatuses,
} from "@/db/vocabulary";

/**
 * The journal's words per type (Ch 1.6 A2): a book or a comic is read, a film
 * or a show is watched, and every label the journal prints comes from here.
 * Free of the database, so a client component can print it.
 */
export type ItemType = (typeof itemTypes)[number];
export type AnchorKind = (typeof anchorKinds)[number];
type Status = (typeof occurrenceStatuses)[number];

export function verb(type: ItemType): "read" | "watch" {
  return type === "book" || type === "comic" ? "read" : "watch";
}

const PAST = { read: "read", watch: "watched" } as const;
const NOW = { read: "Reading", watch: "Watching" } as const;

export type Words = {
  /** The button: "Log a read". */
  log: string;
  /** The sheet's title: "Log a read of Carrie". */
  logOf: (title: string) => string;
  status: Record<Status, string>;
  /** The heading's count: "1 read", "2 watches". */
  count: (n: number) => string;
  /** A shelf row's repeat note: "read twice", "watched 3 times"; "" under 2. */
  times: (n: number) => string;
  /** The Done offer's question: "Read it?". */
  ask: string;
  /** The heading's part for an open read: "reading now". */
  now: string;
  /** The Journal section with no read. */
  empty: string;
};

export function words(type: ItemType): Words {
  const v = verb(type);
  const past = PAST[v];
  return {
    log: `Log a ${v}`,
    logOf: (title) => `Log a ${v} of ${title}`,
    status: { in_progress: NOW[v], done: "Done", abandoned: "Abandoned" },
    count: (n) => `${n} ${v}${n === 1 ? "" : v === "watch" ? "es" : "s"}`,
    times: (n) =>
      n < 2 ? "" : n === 2 ? `${past} twice` : `${past} ${n} times`,
    ask: `${v === "read" ? "Read" : "Watched"} it?`,
    now: `${NOW[v].toLowerCase()} now`,
    empty: `Nothing logged yet. Log a ${v} and the journal starts here.`,
  };
}

/**
 * Where in a work an entry may be pinned (A2). A collected comic holds issues;
 * every other comic form is read by the page, as an issue is (1.6.1 plan 2b).
 */
export function anchorKindsFor(
  type: ItemType,
  form: string | null,
): AnchorKind[] {
  switch (type) {
    case "book":
      return ["page", "chapter"];
    case "comic":
      return form === "collected" ? ["issue", "page"] : ["page"];
    case "tv":
      return ["episode"];
    case "film":
      return [];
  }
}

/** The 400's sentence when an entry names a kind its work doesn't take. */
export function anchorKindSentence(type: ItemType, form: string | null) {
  switch (type) {
    case "book":
      return "A book takes page or chapter.";
    case "comic":
      return form === "collected"
        ? "A collected comic takes issue or page."
        : "A comic takes page.";
    case "tv":
      return "A show takes episode.";
    case "film":
      return "A film has nowhere to pin an entry to.";
  }
}
