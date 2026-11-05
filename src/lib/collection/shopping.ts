import type { WorkFacts } from "@/lib/catalog/work-line";
import type { ItemType } from "./formats";
import type { Printing } from "./sheet";

/**
 * Shopping as data (Ch 1.7 A11): what the caller's shelves ask for and their
 * copies don't answer, grouped in code so the rule reads over a list. Free of
 * the database; `loadShopping` hands it the rows.
 */

/** A chip's word: `?type=` on `/collection`. */
export type ChipType = ItemType | "all";

const CHIPS: readonly ItemType[] = ["book", "comic", "film", "tv"];

/**
 * `?type=` read back: no value is All; anything off the list, or a repeated
 * `?type=` (an array), is null, which the page answers as its not-found.
 */
export function parseType(value: unknown): ChipType | null {
  if (value === undefined) return "all";
  return CHIPS.includes(value as ItemType) ? (value as ItemType) : null;
}

export type ShoppingWork = WorkFacts & {
  id: string;
  title: string;
  type: ItemType;
  form: string | null;
  cover_path: string | null;
};

/** One entry on one of the caller's shelves, in the shelf's order. */
export type ShoppingEntry = {
  shelfId: string;
  section: { id: string; name: string } | null;
  work: ShoppingWork;
  /** The work's printings, for the sheet; only rows to find carry them. */
  printings: Printing[];
  /** Neither held nor via, and not a backup (`toFind` in `owned.ts`). */
  toFind: boolean;
  backup: boolean;
};

/** A row: the work, and the later shelves that ask for it too. */
export type ShoppingRow = Pick<ShoppingEntry, "work" | "printings"> & {
  alsoOn: string[];
};

export type ShoppingGroup = { section: string | null; rows: ShoppingRow[] };

export type ShoppingShelf = {
  id: string;
  name: string;
  /** What this shelf asks for, a work listed under an earlier shelf included. */
  toFind: number;
  works: number;
  backups: number;
  groups: ShoppingGroup[];
  /** What a shelf with no rows says instead; null when it has rows, or backups only. */
  note: string | null;
};

export type Shopping = { total: number; shelves: ShoppingShelf[] };

/** The sections' rows, the unsectioned first, a section only with rows. */
function grouped(
  rows: { row: ShoppingRow; section: ShoppingEntry["section"] }[],
): ShoppingGroup[] {
  const loose: ShoppingRow[] = [];
  const sections = new Map<string, ShoppingGroup>();
  for (const { row, section } of rows) {
    if (!section) {
      loose.push(row);
      continue;
    }
    const group = sections.get(section.id) ?? {
      section: section.name,
      rows: [],
    };
    group.rows.push(row);
    sections.set(section.id, group);
  }
  return [
    ...(loose.length > 0 ? [{ section: null, rows: loose }] : []),
    ...sections.values(),
  ];
}

/**
 * Shelves and their entries, both in the nook's order, into the page: a work on
 * two shelves is listed once, under the first, with the later ones as Also on;
 * a backup is left out and counted; a later shelf's count still holds a work
 * listed earlier, so each shelf's "to find" is true on its own and they can
 * sum past the total.
 */
export function groupShopping(
  shelves: { id: string; name: string }[],
  entries: ShoppingEntry[],
): Shopping {
  const rows = new Map<string, ShoppingRow>();
  const listedUnder = new Map<string, string>();
  const built = shelves.map((shelf) => {
    const own = entries.filter((entry) => entry.shelfId === shelf.id);
    const asked = own.filter((entry) => entry.toFind);
    const listed: { row: ShoppingRow; section: ShoppingEntry["section"] }[] =
      [];
    const earlier = new Set<string>();
    for (const entry of asked) {
      const first = rows.get(entry.work.id);
      if (first) {
        first.alsoOn.push(shelf.name);
        earlier.add(listedUnder.get(entry.work.id) as string);
        continue;
      }
      const row: ShoppingRow = {
        work: entry.work,
        printings: entry.printings,
        alsoOn: [],
      };
      rows.set(entry.work.id, row);
      listedUnder.set(entry.work.id, shelf.name);
      listed.push({ row, section: entry.section });
    }
    const backups = own.filter((entry) => entry.backup).length;
    return {
      id: shelf.id,
      name: shelf.name,
      toFind: asked.length,
      works: own.length,
      backups,
      groups: grouped(listed),
      note: shelfNote({
        works: own.length,
        toFind: asked.length,
        backups,
        listed: listed.length,
        earlier: [...earlier],
      }),
    };
  });
  return { total: rows.size, shelves: built };
}

function shelfNote({
  works,
  toFind,
  backups,
  listed,
  earlier,
}: {
  works: number;
  toFind: number;
  backups: number;
  listed: number;
  earlier: string[];
}): string | null {
  if (works === 0) return "Nothing on this shelf yet.";
  if (toFind === 0)
    // With backups left out, those aren't all yours: their line says so.
    return backups === 0 ? "Everything here is yours." : null;
  return listed === 0 ? `Listed under ${earlier.join(", ")}.` : null;
}
