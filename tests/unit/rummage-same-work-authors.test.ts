import { describe, expect, it } from "vitest";
import { type MatchRow, sameWork } from "@/lib/catalog/match";

// Rummage R3 (Ch 1.3). The book rule (D4) matches a held author against each
// of the row's names, or all of them joined in Open Library's order. A
// co-authored book the person typed as "Stephen King, Peter Straub" meets
// Open Library's `author_name` ["Peter Straub", "Stephen King"] and is `new`:
// Same is never offered, and Add forks The Talisman into a second item. The
// same two people in another order are the same two people.

const row = (authors: string[]): MatchRow => ({
  source: "openlibrary",
  key: "works/OL1W",
  type: "book",
  title: "The Talisman",
  year: 1984,
  authors,
});

const held = (author: string) => ({
  type: "book",
  title: "The Talisman",
  year: 1984,
  author,
});

describe("sameWork, books", () => {
  it("matches a held pair of authors against the same pair in the other order", () => {
    expect(
      sameWork(
        row(["Peter Straub", "Stephen King"]),
        held("Stephen King, Peter Straub"),
      ),
    ).toBe(true);
  });

  it("still refuses a pair against a different pair", () => {
    expect(
      sameWork(
        row(["Peter Straub", "Owen King"]),
        held("Stephen King, Peter Straub"),
      ),
    ).toBe(false);
  });

  it("still keeps a name's own word order: King, Stephen is not Stephen King", () => {
    expect(sameWork(row(["Stephen King"]), held("King, Stephen"))).toBe(false);
  });
});
