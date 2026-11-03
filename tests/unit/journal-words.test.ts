import { describe, expect, it } from "vitest";
import {
  anchorKindSentence,
  anchorKindsFor,
  verb,
  words,
} from "@/lib/journal/words";

// The journal's words per type (Ch 1.6 A2).

describe("verb", () => {
  it("a book or a comic is read, a film or a show is watched", () => {
    expect(verb("book")).toBe("read");
    expect(verb("comic")).toBe("read");
    expect(verb("film")).toBe("watch");
    expect(verb("tv")).toBe("watch");
  });
});

describe("words", () => {
  it("the button and the sheet's title follow the type", () => {
    expect(words("book").log).toBe("Log a read");
    expect(words("book").logOf("Carrie")).toBe("Log a read of Carrie");
    expect(words("film").log).toBe("Log a watch");
    expect(words("film").logOf("Carrie")).toBe("Log a watch of Carrie");
  });

  it("the status words: Reading on a comic, Watching on a show", () => {
    expect(words("comic").status).toEqual({
      in_progress: "Reading",
      done: "Done",
      abandoned: "Abandoned",
    });
    expect(words("tv").status.in_progress).toBe("Watching");
  });

  it("the count, singular at one", () => {
    expect(words("book").count(1)).toBe("1 read");
    expect(words("book").count(2)).toBe("2 reads");
    expect(words("comic").count(3)).toBe("3 reads");
    expect(words("film").count(1)).toBe("1 watch");
    expect(words("tv").count(2)).toBe("2 watches");
  });

  it("the repeat note: twice, then n times, nothing under two", () => {
    expect(words("book").times(2)).toBe("read twice");
    expect(words("book").times(3)).toBe("read 3 times");
    expect(words("film").times(2)).toBe("watched twice");
    expect(words("film").times(3)).toBe("watched 3 times");
    expect(words("book").times(1)).toBe("");
    expect(words("book").times(0)).toBe("");
  });

  it("the offer's question, the open read's part and the empty sentence", () => {
    expect(words("book").ask).toBe("Read it?");
    expect(words("film").ask).toBe("Watched it?");
    expect(words("book").now).toBe("reading now");
    expect(words("tv").now).toBe("watching now");
    expect(words("book").empty).toBe(
      "Nothing logged yet. Log a read and the journal starts here.",
    );
    expect(words("film").empty).toBe(
      "Nothing logged yet. Log a watch and the journal starts here.",
    );
  });
});

describe("anchorKindsFor", () => {
  it("a book takes page and chapter, whatever its form", () => {
    expect(anchorKindsFor("book", "novel")).toEqual(["page", "chapter"]);
    expect(anchorKindsFor("book", "story")).toEqual(["page", "chapter"]);
  });

  it("a comic takes page; a collected one issue and page", () => {
    expect(anchorKindsFor("comic", "issue")).toEqual(["page"]);
    expect(anchorKindsFor("comic", "one-shot")).toEqual(["page"]);
    expect(anchorKindsFor("comic", "collected")).toEqual(["issue", "page"]);
  });

  it("a show takes episode; a film takes nothing", () => {
    expect(anchorKindsFor("tv", null)).toEqual(["episode"]);
    expect(anchorKindsFor("film", null)).toEqual([]);
  });
});

describe("anchorKindSentence", () => {
  it("names the kinds the type takes", () => {
    expect(anchorKindSentence("book", "novel")).toBe(
      "A book takes page or chapter.",
    );
    expect(anchorKindSentence("comic", "issue")).toBe("A comic takes page.");
    expect(anchorKindSentence("comic", "collected")).toBe(
      "A collected comic takes issue or page.",
    );
    expect(anchorKindSentence("tv", null)).toBe("A show takes episode.");
    expect(anchorKindSentence("film", null)).toBe(
      "A film has nowhere to pin an entry to.",
    );
  });
});
