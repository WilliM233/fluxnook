/**
 * Turns the King list's notes into the works the films adapt.
 *
 * Each film's Description names its source, one work per line, as
 * `<Form>: <Title>[, <Collection>] (<Year>)`. Every work becomes a `book` item
 * with id `manual:<slug>-<year>`; the prefix gives its form and its author
 * (Bachman Novel is Richard Bachman, everything else Stephen King). Each line
 * is one adaptation-of from the film; each story is contained-in its
 * collection, which is a book too. A film with no note is a gap, and the works
 * that aren't stories make a publication-order shelf.
 *
 * Built on `letterboxdList`, so the export checks run once and the film ids
 * here are the ids in king-films.json. Two traps: a story's title may hold a
 * comma (`Quitters, Inc`), so the collection is what follows the last `, `;
 * and a two-line note arrives with `\n` only, since csv.mjs normalized it.
 * A line that doesn't read, or that disagrees with an earlier line about the
 * same work, stops the build naming the record and the line.
 */
import { letterboxdList } from "./letterboxd.mjs";

const LINE =
  /^(Novel|Short Story|Novella|Series|Bachman Novel): (.+) \((\d{4})\)$/;
const FORMS = {
  Novel: ["novel", "Stephen King"],
  "Bachman Novel": ["novel", "Richard Bachman"],
  Novella: ["novella", "Stephen King"],
  Series: ["series", "Stephen King"],
  "Short Story": ["story", "Stephen King"],
};
const SHELF_NAME = "Stephen King, publication order";
const SHELF_DESCRIPTION =
  "The works the list's notes name, less the stories (reached through Night Shift), by publication year and then by the position of the first film whose first note line names the work or its collection.";

// Apostrophes go first, so Salem's Lot is salems-lot and not salem-s-lot.
function slug(text) {
  return text
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseLine(line, fail) {
  const match = LINE.exec(line);
  if (!match) fail("is not <Form>: <Title> (<Year>)");
  const [, prefix, rest, yearText] = match;
  const [form, author] = FORMS[prefix];
  let title = rest;
  let collection;
  if (form === "story") {
    const cut = rest.lastIndexOf(", ");
    if (cut === -1) fail("names no collection");
    title = rest.slice(0, cut);
    collection = rest.slice(cut + 2);
  }
  if (
    slug(title) === "" ||
    (collection !== undefined && slug(collection) === "")
  ) {
    fail("has an empty title");
  }
  return { form, author, title, collection, year: Number(yearText) };
}

export function kingWorks(text, rawPath) {
  const films = letterboxdList(text, rawPath);
  const [list] = films.shelves;
  const filmById = new Map(films.items.map((item) => [item.id, item]));

  const works = new Map();
  const collectionOf = new Map();
  const collectionYear = new Map();
  const firstNamed = new Map();
  const contained = new Set();
  const adaptations = [];
  const containments = [];
  const gaps = [];

  const walked = new Set();
  list.entries.forEach((entry, i) => {
    // A film listed twice is one item with one note: one set of relations.
    if (walked.has(entry.item)) return;
    walked.add(entry.item);
    const film = filmById.get(entry.item);
    const record = i + 5;
    if (film.source_note === "") {
      gaps.push({ item: film.id, reason: "no source note" });
      return;
    }

    film.source_note.split("\n").forEach((line, n) => {
      const fail = (message) => {
        throw new Error(
          `${rawPath}: record ${record}: note line ${n + 1} ${JSON.stringify(line)} ${message}`,
        );
      };
      // The first line to name an id defines it; later lines must agree.
      const remember = (book, partOf) => {
        const seen = works.get(book.id);
        if (!seen) {
          works.set(book.id, book);
          collectionOf.set(book.id, partOf);
        } else if (
          seen.form !== book.form ||
          seen.author !== book.author ||
          seen.title !== book.title ||
          collectionOf.get(book.id) !== partOf
        ) {
          fail(
            `disagrees on ${book.id} with ${JSON.stringify(seen.source_note)}`,
          );
        }
      };
      const named = (id) => {
        if (n === 0 && !firstNamed.has(id)) firstNamed.set(id, entry.position);
      };

      const { form, author, title, collection, year } = parseLine(line, fail);
      const id = `manual:${slug(title)}-${year}`;
      const base = { type: "book", year, providers: {}, source_note: line };
      remember({ id, form, author, title, ...base }, collection);
      adaptations.push({ type: "adaptation-of", from: film.id, to: id });
      named(id);
      if (collection === undefined) return;

      const dated = collectionYear.get(collection);
      if (dated !== undefined && dated !== year) {
        fail(
          `puts collection ${JSON.stringify(collection)} in ${year}; an earlier line has ${dated}`,
        );
      }
      collectionYear.set(collection, year);
      const cid = `manual:${slug(collection)}-${year}`;
      remember(
        {
          id: cid,
          form: "collection",
          author: "Stephen King",
          title: collection,
          ...base,
        },
        undefined,
      );
      if (!contained.has(id)) {
        contained.add(id);
        containments.push({ type: "contained-in", from: id, to: cid });
      }
      named(cid);
    });
  });

  const shelved = [...works.values()].filter(({ form }) => form !== "story");
  for (const work of shelved) {
    if (!firstNamed.has(work.id)) {
      throw new Error(
        `${rawPath}: work ${JSON.stringify(work.title)} (${work.id}) is on no note's first line, so it has no place on the shelf`,
      );
    }
  }
  shelved.sort(
    (a, b) => a.year - b.year || firstNamed.get(a.id) - firstNamed.get(b.id),
  );

  return {
    items: [...works.values()],
    relations: [...adaptations, ...containments],
    shelves: [
      {
        name: SHELF_NAME,
        date: list.date,
        url: list.url,
        description: SHELF_DESCRIPTION,
        entries: shelved.map(({ id }, i) => ({ item: id, position: i + 1 })),
      },
    ],
    gaps,
  };
}
