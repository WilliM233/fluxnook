import { describe, expect, it } from "vitest";
import { fixture } from "@/fixtures/shape";

function sample() {
  return {
    items: [
      {
        id: "letterboxd:a1",
        type: "film",
        title: "Carrie",
        year: 1976,
        providers: { letterboxd: "https://boxd.it/a1" },
        source_note: "Novel: Carrie (1974)",
      },
      {
        id: "letterboxd:b2",
        type: "film",
        title: "The Shining",
        year: 1980,
        providers: { letterboxd: "https://boxd.it/b2" },
        source_note: "Novel: The Shining (1977)",
      },
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
    ],
    shelves: [
      {
        name: "A shelf",
        date: "2024-04-01",
        url: "https://boxd.it/upKRw",
        description: "Two films.",
        entries: [
          { item: "letterboxd:a1", position: 1 },
          { item: "letterboxd:b2", position: 2 },
        ],
      },
    ],
    relations: [
      {
        type: "adaptation-of",
        from: "letterboxd:a1",
        to: "manual:carrie-1974",
      },
    ],
    gaps: [{ item: "letterboxd:b2", reason: "no source note" }],
  };
}

type Loose = Record<string, unknown>;
type Entry = { item: string; position: number };

// A comics file with one of each collection piece, kept apart from sample()
// because several tests above rebuild items from sample()'s first three.
function comics(): {
  items: Loose[];
  shelves: (Loose & { sections?: { name: string; entries: Entry[] }[] })[];
  relations: Loose[];
  editions: { id: string; item: string; format: string; contents: string[] }[];
  copies: Loose[];
  occurrences: Loose[];
} {
  const comic = {
    type: "comic",
    year: 1986,
    source_date: "March, 1986",
    source_note: "",
    providers: {},
    series: null,
    series_kind: null,
    number: null,
  };
  return {
    items: [
      {
        ...comic,
        id: "manual:tmnt-mirage-v1-1",
        title: "The Turtles' Origin is Told",
        form: "issue",
        year: 1984,
        month: 5,
        source_date: "May, 1984",
        series: "Teenage Mutant Ninja Turtles (Mirage) Vol. 1",
        series_kind: "ongoing",
        number: 1,
      },
      {
        ...comic,
        id: "manual:tmnt-mirage-backup-you-had-to-be-there",
        title: "You Had to Be There",
        form: "backup",
      },
      {
        ...comic,
        id: "manual:tmnt-mirage-host-shell-shock",
        title: "Shell Shock",
        form: "anthology",
        year: 1989,
        month: 12,
        source_date: "December, 1989",
      },
      {
        ...comic,
        id: "manual:tmnt-ultimate-collection-1",
        title: "Ultimate Collection 1",
        form: "collected",
        year: null,
        source_date: "",
      },
    ],
    shelves: [
      {
        name: "TMNT, the Mirage run",
        date: "2026-10-23",
        url: "https://example.com/sheet",
        description: "Two sections.",
        sections: [
          {
            name: "Volume 1 · Main Series",
            entries: [{ item: "manual:tmnt-mirage-v1-1", position: 1 }],
          },
          {
            name: "Volume 1 · Short Stories",
            entries: [
              {
                item: "manual:tmnt-mirage-backup-you-had-to-be-there",
                position: 1,
              },
            ],
          },
        ],
      },
    ],
    relations: [
      {
        type: "contained-in",
        from: "manual:tmnt-mirage-backup-you-had-to-be-there",
        to: "manual:tmnt-mirage-v1-1",
      },
    ],
    editions: [
      {
        id: "edition:tmnt-ultimate-collection-1-hardcover",
        item: "manual:tmnt-ultimate-collection-1",
        format: "hardcover",
        contents: ["manual:tmnt-mirage-v1-1"],
      },
    ],
    copies: [
      { edition: "edition:tmnt-ultimate-collection-1-hardcover", note: "" },
    ],
    occurrences: [{ item: "manual:tmnt-mirage-v1-1", status: "done" }],
  };
}

function messages(data: unknown): string {
  const result = fixture.safeParse(data);
  expect(result.success).toBe(false);
  return (result.error?.issues ?? []).map((issue) => issue.message).join("\n");
}

function paths(data: unknown): PropertyKey[][] {
  const result = fixture.safeParse(data);
  expect(result.success).toBe(false);
  return (result.error?.issues ?? []).map((issue) => issue.path);
}

describe("fixture", () => {
  it("accepts a file of items and a shelf pointing at them", () => {
    expect(fixture.safeParse(sample()).success).toBe(true);
  });

  it("rejects an item with no title, at that item's path", () => {
    const data = sample();
    const { title: _, ...untitled } = data.items[0];
    const result = fixture.safeParse({
      ...data,
      items: [untitled, data.items[1]],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([
      "items",
      0,
      "title",
    ]);
  });

  it("rejects an entry that points at no item, naming the id and position", () => {
    const data = sample();
    data.shelves[0].entries[1] = { item: "letterboxd:zz", position: 2 };
    const message = messages(data);
    expect(message).toContain("letterboxd:zz");
    expect(message).toContain("entry 2");
  });

  it("rejects two items with the same id, naming it", () => {
    const data = sample();
    data.items[1].id = "letterboxd:a1";
    expect(messages(data)).toContain("letterboxd:a1");
  });

  it("rejects a type with no variant", () => {
    const data = sample();
    data.items[0].type = "game";
    expect(fixture.safeParse(data).success).toBe(false);
  });

  it("rejects a key the shape doesn't name", () => {
    const data = sample();
    expect(
      fixture.safeParse({
        ...data,
        items: [{ ...data.items[0], rating: 5 }, data.items[1]],
      }).success,
    ).toBe(false);
  });

  it("accepts an empty source_note", () => {
    const data = sample();
    data.items[0].source_note = "";
    expect(fixture.safeParse(data).success).toBe(true);
  });

  it("rejects a provider it doesn't know and accepts none on a non-provider id", () => {
    const data = sample();
    const unknown = {
      ...data.items[0],
      providers: { tmdb: "https://example.com" },
    };
    expect(
      fixture.safeParse({ ...data, items: [unknown, data.items[1]] }).success,
    ).toBe(false);
    // A letterboxd: id must carry its URL (R8); an id from a source with no
    // provider, as Chapter 5's works will be, may carry none.
    const none = { ...data.items[0], id: "manual:carrie-1974", providers: {} };
    data.shelves[0].entries[0].item = "manual:carrie-1974";
    expect(
      fixture.safeParse({ ...data, items: [none, data.items[1]] }).success,
    ).toBe(true);
  });

  it("rejects a shelf date that isn't an ISO date", () => {
    const data = sample();
    data.shelves[0].date = "2024-4-1";
    expect(fixture.safeParse(data).success).toBe(false);
  });

  // L's sheet has no public link to give (Ch 0.6 Q1).
  it("takes a shelf with no url, and still refuses one that isn't https", () => {
    const { url: _, ...unlinked } = sample().shelves[0];
    const result = fixture.safeParse({ ...sample(), shelves: [unlinked] });
    expect(result.success).toBe(true);
    expect(result.data?.shelves[0]).not.toHaveProperty("url");
    const data = sample();
    data.shelves[0].url = "http://boxd.it/upKRw";
    expect(paths(data)).toContainEqual(["shelves", 0, "url"]);
  });

  it("accepts a book, relations and gaps, and keeps them", () => {
    const data = sample();
    const result = fixture.safeParse(data);
    expect(result.success).toBe(true);
    expect(result.data?.relations).toEqual(data.relations);
    expect(result.data?.gaps).toEqual(data.gaps);
  });

  it("rejects a book form it doesn't know, at that item's path", () => {
    const data = sample();
    const poem = { ...data.items[2], form: "poem" };
    expect(
      paths({ ...data, items: [data.items[0], data.items[1], poem] }),
    ).toContainEqual(["items", 2, "form"]);
  });

  it("rejects a book with no author, at that item's path", () => {
    const data = sample();
    const { author: _, ...anonymous } = data.items[2];
    expect(
      paths({ ...data, items: [data.items[0], data.items[1], anonymous] }),
    ).toContainEqual(["items", 2, "author"]);
  });

  it("rejects a film that carries a form", () => {
    const data = sample();
    const film = { ...data.items[0], form: "novel" };
    expect(
      fixture.safeParse({ ...data, items: [film, data.items[1]] }).success,
    ).toBe(false);
  });

  it("rejects a relation type it doesn't know, at that relation's path", () => {
    const data = sample();
    const relation = { ...data.relations[0], type: "based-on" };
    expect(paths({ ...data, relations: [relation] })).toContainEqual([
      "relations",
      0,
      "type",
    ]);
  });

  it("rejects a relation endpoint that isn't an item id", () => {
    const data = sample();
    const relation = { ...data.relations[0], from: "carrie" };
    expect(paths({ ...data, relations: [relation] })).toContainEqual([
      "relations",
      0,
      "from",
    ]);
  });

  it("rejects a gap with no reason", () => {
    const data = sample();
    const gap = { ...data.gaps[0], reason: "" };
    expect(paths({ ...data, gaps: [gap] })).toContainEqual([
      "gaps",
      0,
      "reason",
    ]);
  });

  it("reads a file with no relations or gaps as empty ones", () => {
    const { relations: _, gaps: __, ...data } = sample();
    const result = fixture.safeParse(data);
    expect(result.success).toBe(true);
    expect(result.data?.relations).toEqual([]);
    expect(result.data?.gaps).toEqual([]);
  });

  // Relations may point into another fixture file; tests/unit/fixtures.test.ts
  // resolves them over every file together.
  it("leaves a relation endpoint in no item of this file to the cross-file test", () => {
    const data = sample();
    const relation = { ...data.relations[0], to: "manual:nowhere-1900" };
    expect(fixture.safeParse({ ...data, relations: [relation] }).success).toBe(
      true,
    );
  });
});

describe("fixture, comics and the collection", () => {
  it("accepts comics, editions, copies and occurrences, and keeps them", () => {
    const data = comics();
    const result = fixture.safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
    expect(result.data?.editions).toEqual(data.editions);
    expect(result.data?.copies).toEqual(data.copies);
    expect(result.data?.occurrences).toEqual(data.occurrences);
  });

  it("rejects a comic form it doesn't know, at that item's path", () => {
    const data = comics();
    data.items[0].form = "floppy";
    expect(paths(data)).toContainEqual(["items", 0, "form"]);
  });

  it("allows a null year on a comic and nowhere else", () => {
    const data = comics();
    data.items[0].year = null;
    expect(fixture.safeParse(data).success).toBe(true);
    const films = sample();
    const undated = { ...films.items[0], year: null };
    expect(
      fixture.safeParse({ ...films, items: [undated, films.items[1]] }).success,
    ).toBe(false);
  });

  it("takes a month of 1 to 12, or none", () => {
    for (const month of [0, 13]) {
      const data = comics();
      data.items[0].month = month;
      expect(paths(data), String(month)).toContainEqual(["items", 0, "month"]);
    }
    const data = comics();
    const { month: _, ...monthless } = data.items[0];
    const result = fixture.safeParse({
      ...data,
      items: [monthless, ...data.items.slice(1)],
    });
    expect(result.success).toBe(true);
    expect(result.data?.items[0]).not.toHaveProperty("month");
  });

  it("rejects a series kind it doesn't know and a number that isn't one", () => {
    const kind = comics();
    kind.items[0].series_kind = "arc";
    expect(paths(kind)).toContainEqual(["items", 0, "series_kind"]);
    const number = comics();
    number.items[0].number = "7";
    expect(paths(number)).toContainEqual(["items", 0, "number"]);
  });

  it("rejects a comic with no source_date", () => {
    const data = comics();
    const { source_date: _, ...undated } = data.items[1];
    expect(
      paths({
        ...data,
        items: [data.items[0], undated, ...data.items.slice(2)],
      }),
    ).toContainEqual(["items", 1, "source_date"]);
  });

  it("rejects an edition format it doesn't know, at that edition's path", () => {
    const data = comics();
    data.editions[0].format = "paperback";
    expect(paths(data)).toContainEqual(["editions", 0, "format"]);
  });

  it("rejects an edition id that isn't edition:<key>", () => {
    const data = comics();
    data.editions[0].id = "manual:x";
    expect(paths(data)).toContainEqual(["editions", 0, "id"]);
  });

  it("rejects an edition of an item not in this file, naming it", () => {
    const data = comics();
    data.editions[0].item = "manual:tmnt-ultimate-collection-9";
    expect(messages(data)).toContain("manual:tmnt-ultimate-collection-9");
  });

  it("rejects contents that repeat an id or name the edition's own item, and an edition id twice", () => {
    const repeated = comics();
    repeated.editions[0].contents.push("manual:tmnt-mirage-v1-1");
    expect(messages(repeated)).toContain("manual:tmnt-mirage-v1-1");
    const itself = comics();
    itself.editions[0].contents.push("manual:tmnt-ultimate-collection-1");
    expect(messages(itself)).toContain("manual:tmnt-ultimate-collection-1");
    const twice = comics();
    twice.editions.push({ ...twice.editions[0], contents: [] });
    expect(messages(twice)).toContain(
      "edition:tmnt-ultimate-collection-1-hardcover",
    );
  });

  it("rejects a copy with a key the shape doesn't name, and takes an empty note", () => {
    const data = comics();
    data.copies[0] = { ...data.copies[0], condition: "fine" };
    expect(fixture.safeParse(data).success).toBe(false);
    expect(fixture.safeParse(comics()).data?.copies[0].note).toBe("");
  });

  it("rejects an occurrence status it doesn't know", () => {
    const data = comics();
    data.occurrences[0].status = "reading";
    expect(paths(data)).toContainEqual(["occurrences", 0, "status"]);
  });

  it("rejects a shelf with both entries and sections, or neither", () => {
    const both = comics();
    both.shelves[0].entries = [
      { item: "manual:tmnt-mirage-v1-1", position: 1 },
    ];
    expect(messages(both)).toContain("entries or sections");
    const neither = comics();
    delete neither.shelves[0].sections;
    expect(messages(neither)).toContain("entries or sections");
  });

  it("wants positions increasing within a section, restarting across them", () => {
    const data = comics();
    expect(fixture.safeParse(data).success).toBe(true);
    const [main] = data.shelves[0].sections ?? [];
    main.entries.push({
      item: "manual:tmnt-mirage-host-shell-shock",
      position: 2,
    });
    expect(fixture.safeParse(data).success).toBe(true);
    main.entries[1].position = 1;
    expect(messages(data)).toContain("positions must increase");
  });

  it("rejects two sections with one name, naming it", () => {
    const data = comics();
    const sections = data.shelves[0].sections ?? [];
    sections[1].name = sections[0].name;
    expect(messages(data)).toContain("Volume 1 · Main Series");
  });

  it("rejects a section entry that is no item in this file, naming it and the section", () => {
    const data = comics();
    const sections = data.shelves[0].sections ?? [];
    sections[1].entries[0].item = "manual:tmnt-mirage-v1-999";
    const message = messages(data);
    expect(message).toContain("manual:tmnt-mirage-v1-999");
    expect(message).toContain("Volume 1 · Short Stories");
  });

  it("rejects a relation from an id to itself, and the same relation twice", () => {
    const self = comics();
    self.relations[0].to = self.relations[0].from;
    expect(paths(self)).toContainEqual(["relations", 0]);
    const twice = comics();
    twice.relations.push({ ...twice.relations[0] });
    expect(paths(twice)).toContainEqual(["relations", 1]);
  });

  it("reads a file with no editions, copies or occurrences as empty ones", () => {
    const result = fixture.safeParse(sample());
    expect(result.success).toBe(true);
    expect(result.data?.editions).toEqual([]);
    expect(result.data?.copies).toEqual([]);
    expect(result.data?.occurrences).toEqual([]);
  });

  // Like relations, these may point into another file; the cross-file test
  // resolves them.
  it("leaves contents, copies and occurrences outside this file to the cross-file test", () => {
    const data = comics();
    data.editions[0].contents = ["manual:nowhere-1900"];
    data.copies[0].edition = "edition:nowhere";
    data.occurrences[0].item = "manual:nowhere-1900";
    expect(fixture.safeParse(data).success).toBe(true);
  });
});
