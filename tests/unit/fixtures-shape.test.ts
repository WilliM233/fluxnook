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
  };
}

function messages(data: unknown): string {
  const result = fixture.safeParse(data);
  expect(result.success).toBe(false);
  return (result.error?.issues ?? []).map((issue) => issue.message).join("\n");
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
    data.items[0].type = "book";
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

  it("rejects a provider it doesn't know and accepts none", () => {
    const data = sample();
    const unknown = {
      ...data.items[0],
      providers: { tmdb: "https://example.com" },
    };
    expect(
      fixture.safeParse({ ...data, items: [unknown, data.items[1]] }).success,
    ).toBe(false);
    const none = { ...data.items[0], providers: {} };
    expect(
      fixture.safeParse({ ...data, items: [none, data.items[1]] }).success,
    ).toBe(true);
  });

  it("rejects a shelf date that isn't an ISO date", () => {
    const data = sample();
    data.shelves[0].date = "2024-4-1";
    expect(fixture.safeParse(data).success).toBe(false);
  });
});
