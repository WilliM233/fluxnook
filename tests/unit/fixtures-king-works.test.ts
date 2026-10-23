import { describe, expect, it } from "vitest";
import { kingWorks } from "../../scripts/fixtures/king-works.mjs";

// The works builder on small inline exports. A film at row i is record i + 5.

const RAW = "raw/king.csv";

function exportOf(films: string[]): string {
  return [
    "Letterboxd list export v7",
    "Date,Name,Tags,URL,Description",
    "2024-04-01,X,,https://boxd.it/upKRw,d",
    "",
    "Position,Name,Year,URL,Description",
    ...films,
    "",
  ].join("\n");
}

// Every note is quoted, so a comma or a line break stays inside it.
function film(position: number, key: string, note: string): string {
  return `${position},Film ${position},2000,https://boxd.it/${key},"${note}"`;
}

function build(notes: string[]) {
  return kingWorks(
    exportOf(notes.map((note, i) => film(i + 1, `k${i + 1}`, note))),
    RAW,
  );
}

const SHELF_DESCRIPTION =
  "The works the list's notes name, less the stories (reached through Night Shift), by the year the notes give and then by the position of the first film whose first note line names the work or its collection.";

describe("kingWorks", () => {
  it("turns one note into a book, its adaptation-of and a one-entry shelf", () => {
    const works = kingWorks(
      exportOf(["1,Carrie,1976,https://boxd.it/20ZQ,Novel: Carrie (1974)"]),
      RAW,
    );
    expect(works.items).toEqual([
      {
        id: "manual:carrie-1974",
        type: "book",
        form: "novel",
        author: "Stephen King",
        title: "Carrie",
        year: 1974,
        providers: {},
        source_note: "Novel: Carrie (1974)",
      },
    ]);
    expect(works.relations).toEqual([
      {
        type: "adaptation-of",
        from: "letterboxd:20ZQ",
        to: "manual:carrie-1974",
      },
    ]);
    expect(works.gaps).toEqual([]);
    expect(works.shelves).toHaveLength(1);
    expect(works.shelves[0].entries).toEqual([
      { item: "manual:carrie-1974", position: 1 },
    ]);
  });

  it("reads the form and the author off the note's prefix", () => {
    const works = build([
      "Bachman Novel: The Running Man (1981)",
      "Novella: The Mist (1980)",
      "Series: The Dark Tower (1981)",
    ]);
    expect(
      works.items.map(({ id, form, author }) => [id, form, author]),
    ).toEqual([
      ["manual:the-running-man-1981", "novel", "Richard Bachman"],
      ["manual:the-mist-1980", "novella", "Stephen King"],
      ["manual:the-dark-tower-1981", "series", "Stephen King"],
    ]);
  });

  it("splits a story from its collection at the last comma, and contains it there", () => {
    const works = build(["Short Story: Quitters, Inc, Night Shift (1977)"]);
    expect(works.items).toEqual([
      {
        id: "manual:quitters-inc-1977",
        type: "book",
        form: "story",
        author: "Stephen King",
        title: "Quitters, Inc",
        year: 1977,
        providers: {},
        source_note: "Short Story: Quitters, Inc, Night Shift (1977)",
      },
      {
        id: "manual:night-shift-1977",
        type: "book",
        form: "collection",
        author: "Stephen King",
        title: "Night Shift",
        year: 1977,
        providers: {},
        source_note: "Short Story: Quitters, Inc, Night Shift (1977)",
      },
    ]);
    expect(works.relations).toEqual([
      {
        type: "adaptation-of",
        from: "letterboxd:k1",
        to: "manual:quitters-inc-1977",
      },
      {
        type: "contained-in",
        from: "manual:quitters-inc-1977",
        to: "manual:night-shift-1977",
      },
    ]);
  });

  it("makes one item per work and one adaptation-of per note line", () => {
    const repeated = build(["Novel: Carrie (1974)", "Novel: Carrie (1974)"]);
    expect(repeated.items.map(({ id }) => id)).toEqual(["manual:carrie-1974"]);
    expect(repeated.relations.map(({ from }) => from)).toEqual([
      "letterboxd:k1",
      "letterboxd:k2",
    ]);

    // The second film puts Night Shift on a first line, as Graveyard Shift
    // does in the real list, so the shelf has a place for it.
    const twoLines = build([
      "Novel: Salem's Lot (1975)\r\nShort Story: Jerusalem's Lot, Night Shift (1977)",
      "Short Story: Graveyard Shift, Night Shift (1977)",
    ]);
    expect(
      twoLines.relations
        .filter(
          ({ type, from }) =>
            type === "adaptation-of" && from === "letterboxd:k1",
        )
        .map(({ to }) => to),
    ).toEqual(["manual:salems-lot-1975", "manual:jerusalems-lot-1977"]);

    const twoStories = build([
      "Short Story: The Mangler, Night Shift (1977)",
      "Short Story: The Ledge, Night Shift (1977)",
      "Short Story: The Mangler, Night Shift (1977)",
    ]);
    expect(
      twoStories.items.filter(({ form }) => form === "collection"),
    ).toHaveLength(1);
    expect(
      twoStories.relations
        .filter(({ type }) => type === "contained-in")
        .map(({ from }) => from),
    ).toEqual(["manual:the-mangler-1977", "manual:the-ledge-1977"]);
  });

  it("slugs ids without apostrophes and keeps titles as written", () => {
    const works = build([
      "Novel: Salem's Lot (1975)",
      "Short Story: I am the Doorway, Night Shift (1977)",
    ]);
    expect(works.items.map(({ id, title }) => [id, title])).toEqual([
      ["manual:salems-lot-1975", "Salem's Lot"],
      ["manual:i-am-the-doorway-1977", "I am the Doorway"],
      ["manual:night-shift-1977", "Night Shift"],
    ]);
  });

  it("records an empty note as a gap, not a relation", () => {
    const works = kingWorks(
      exportOf([
        "1,Carrie,1976,https://boxd.it/20ZQ,Novel: Carrie (1974)",
        "2,The Long Walk,2025,https://boxd.it/mic8,",
      ]),
      RAW,
    );
    expect(works.gaps).toEqual([
      { item: "letterboxd:mic8", reason: "no source note" },
    ]);
    expect(
      works.relations.some(
        ({ from, to }) =>
          from === "letterboxd:mic8" || to === "letterboxd:mic8",
      ),
    ).toBe(false);
  });

  it("stops on a note line it can't read, naming the file, record and line", () => {
    for (const line of [
      "Poem: X (1990)",
      "Novel: X",
      "Novel: X (abc)",
      "Short Story: X (1977)",
    ]) {
      expect(() => build([line]), line).toThrow(`${RAW}: record 5: `);
      expect(() => build([line]), line).toThrow(JSON.stringify(line));
    }
  });

  it("stops on a collection dated two ways, or two lines that disagree on a work", () => {
    expect(() =>
      build(["Short Story: A, C (1977)", "Short Story: B, C (1978)"]),
    ).toThrow(/record 6: .*collection "C"/);
    expect(() =>
      build(["Novel: The Mist (1980)", "Novella: The Mist (1980)"]),
    ).toThrow(/record 6: .*manual:the-mist-1980/);
  });

  it("shelves the works that aren't stories by year, then by first first-line position", () => {
    const works = build([
      "Novel: B (1977)",
      "Novel: A (1975)\nShort Story: S, C (1977)",
      "Short Story: T, C (1977)",
    ]);
    const [shelf] = works.shelves;
    expect(shelf.entries).toEqual([
      { item: "manual:a-1975", position: 1 },
      { item: "manual:b-1977", position: 2 },
      { item: "manual:c-1977", position: 3 },
    ]);
    expect(shelf).toMatchObject({
      name: "Stephen King, publication order",
      date: "2024-04-01",
      url: "https://boxd.it/upKRw",
      description: SHELF_DESCRIPTION,
    });
  });

  it("stops on a work that no note's first line names", () => {
    expect(() => build(["Novel: A (1975)\nNovel: B (1976)"])).toThrow(
      /work "B"/,
    );
  });
});
