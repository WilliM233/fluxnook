import { describe, expect, it } from "vitest";
import { conditions, editionFormats } from "@/db/vocabulary";
import {
  BACKUP_ONLY,
  conditionLabel,
  formatLabel,
  formatsFor,
  formatsSentence,
  formatWord,
} from "@/lib/collection/formats";

// A2: the 1.1 vocabulary narrowed per type and form, and every label it prints.

describe("formatsFor", () => {
  it.each([
    ["book", "novel", ["paperback", "hardcover", "ebook", "audiobook"]],
    ["book", "story", ["paperback", "hardcover", "ebook", "audiobook"]],
    ["comic", "issue", ["floppy", "digital"]],
    ["comic", "one-shot", ["floppy", "digital"]],
    ["comic", "anthology", ["floppy", "digital"]],
    ["comic", "collected", ["tpb", "hardcover", "omnibus", "digital"]],
    ["comic", "backup", []],
    ["film", null, ["dvd", "blu-ray", "4k", "digital"]],
    ["tv", null, ["dvd", "blu-ray", "4k", "digital"]],
  ] as const)("%s %s", (type, form, expected) => {
    expect(formatsFor(type, form)).toEqual(expected);
  });

  it("stays inside the one vocabulary", () => {
    for (const [type, form] of [
      ["book", "novel"],
      ["comic", "issue"],
      ["comic", "collected"],
      ["film", null],
      ["tv", null],
    ] as const) {
      for (const format of formatsFor(type, form)) {
        expect(editionFormats).toContain(format);
      }
    }
  });
});

describe("the labels", () => {
  it.each([
    ["paperback", "Paperback"],
    ["hardcover", "Hardcover"],
    ["ebook", "Ebook"],
    ["audiobook", "Audiobook"],
    ["floppy", "Floppy"],
    ["digital", "Digital"],
    ["tpb", "Trade paperback"],
    ["omnibus", "Omnibus"],
    ["dvd", "DVD"],
    ["blu-ray", "Blu-ray"],
    ["4k", "4K"],
  ])("%s prints %s", (format, label) => {
    expect(formatLabel(format)).toBe(label);
  });

  it("every format in the vocabulary has one", () => {
    for (const format of editionFormats) {
      expect(formatLabel(format)).toMatch(/^[A-Z0-9]/);
    }
  });

  it("a word inside a sentence is lowered, but DVD and 4K stay", () => {
    expect(formatWord("hardcover")).toBe("hardcover");
    expect(formatWord("tpb")).toBe("trade paperback");
    expect(formatWord("blu-ray")).toBe("blu-ray");
    expect(formatWord("dvd")).toBe("DVD");
    expect(formatWord("4k")).toBe("4K");
  });
});

describe("the sentences at format", () => {
  it.each([
    [
      "book",
      "novel",
      "A book comes as paperback, hardcover, ebook or audiobook.",
    ],
    ["comic", "issue", "A comic comes as floppy or digital."],
    [
      "comic",
      "collected",
      "A collected comic comes as trade paperback, hardcover, omnibus or digital.",
    ],
    ["film", null, "A film comes as DVD, Blu-ray, 4K or digital."],
    ["tv", null, "A show comes as DVD, Blu-ray, 4K or digital."],
    ["comic", "backup", BACKUP_ONLY],
  ] as const)("%s %s", (type, form, sentence) => {
    expect(formatsSentence(type, form)).toBe(sentence);
  });
});

describe("the conditions", () => {
  it("are five words, each with its label", () => {
    expect(conditions).toEqual(["new", "fine", "good", "fair", "poor"]);
    expect(conditions.map(conditionLabel)).toEqual([
      "New",
      "Fine",
      "Good",
      "Fair",
      "Poor",
    ]);
  });
});
