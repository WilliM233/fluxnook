import { describe, expect, it } from "vitest";
import {
  collectedStem,
  normalizeName,
  normalizePublisher,
  normalizeSeries,
  normalizeTitle,
  seriesPublisher,
} from "@/lib/catalog/normalize";

describe("normalizeName", () => {
  it("folds case", () => {
    expect(normalizeName("Stephen King")).toBe(normalizeName("stephen king"));
  });

  it("keeps word order: King, Stephen is not Stephen King", () => {
    expect(normalizeName("King, Stephen")).not.toBe(
      normalizeName("Stephen King"),
    );
  });

  it("folds a doubled space", () => {
    expect(normalizeName("Stephen  King")).toBe(normalizeName("Stephen King"));
  });

  it("keeps a leading initial A, which a title would drop", () => {
    expect(normalizeName("A. Smith")).not.toBe(normalizeName("Smith"));
  });
});

describe("normalizeTitle", () => {
  it("folds punctuation and the leading article", () => {
    expect(normalizeTitle("The Rage: Carrie 2")).toBe("rage carrie 2");
  });

  it("treats Carrie and carrie! as one title", () => {
    expect(normalizeTitle("Carrie")).toBe("carrie");
    expect(normalizeTitle("carrie!")).toBe("carrie");
  });

  it("reads 'Salem's Lot with or without its apostrophe the same", () => {
    expect(normalizeTitle("'Salem's Lot")).toBe(normalizeTitle("Salem's Lot"));
  });

  it("keeps a subtitle, so a sequel isn't its original", () => {
    expect(normalizeTitle("Pet Sematary")).not.toBe(
      normalizeTitle("Pet Sematary: Bloodlines"),
    );
  });

  it("drops a leading A", () => {
    expect(normalizeTitle("A Good Marriage")).toBe("good marriage");
  });

  it("strips accents, and a one-word title keeps its word", () => {
    expect(normalizeTitle("Thé")).toBe("the");
  });

  it("leaves a short title alone", () => {
    expect(normalizeTitle("It")).toBe("it");
  });

  it("trims the edges", () => {
    expect(normalizeTitle("  Misery  ")).toBe("misery");
  });
});

describe("normalizeSeries", () => {
  it.each([
    [
      "Teenage Mutant Ninja Turtles (Mirage) Vol. 1",
      "teenage mutant ninja turtles",
    ],
    [
      "Teenage Mutant Ninja Turtles (Image) Vol. 3",
      "teenage mutant ninja turtles",
    ],
    ["Teenage Mutant Ninja Turtles", "teenage mutant ninja turtles"],
    [
      "Tales of the Teenage Mutant Ninja Turtles Vol. 2",
      "tales of the teenage mutant ninja turtles",
    ],
    ["The Savage Dragon", "the savage dragon"],
    ["Groo Volume 2", "groo"],
    ["Groo vol 2", "groo"],
    ["Groo (Vol. 2)", "groo"],
    [
      "TMNT:  Teenage Mutant Ninja Turtles",
      "tmnt teenage mutant ninja turtles",
    ],
    ["Volume", "volume"],
  ])("%s → %s", (name, folded) => {
    expect(normalizeSeries(name)).toBe(folded);
  });

  it("keeps Adventures, so a longer name is another series", () => {
    expect(normalizeSeries("Teenage Mutant Ninja Turtles Adventures")).not.toBe(
      normalizeSeries("Teenage Mutant Ninja Turtles (Mirage) Vol. 1"),
    );
  });
});

describe("seriesPublisher", () => {
  it.each([
    ["Teenage Mutant Ninja Turtles (Mirage) Vol. 1", "mirage"],
    ["Teenage Mutant Ninja Turtles (Image) Vol. 3", "image"],
    ["Groo (Epic Comics)", "epic comics"],
    ["Groo (Epic) (Vol. 2)", "epic"],
    ["Tales of the Teenage Mutant Ninja Turtles Vol. 2", null],
    ["Teenage Mutant Ninja Turtles & Flaming Carrot", null],
    ["Groo (Vol. 2)", null],
    ["Groo ( )", null],
  ])("%s → %s", (label, publisher) => {
    expect(seriesPublisher(label)).toBe(publisher);
  });

  it("folds a publisher's name the same way", () => {
    expect(normalizePublisher("Mirage")).toBe(
      seriesPublisher("X (Mirage) Vol. 1"),
    );
    expect(normalizePublisher("IDW Publishing")).toBe("idw publishing");
  });
});

describe("collectedStem", () => {
  it.each([
    ["Ultimate Collection 1", "ultimate collection"],
    ["Ultimate Collection", "ultimate collection"],
    ["Ultimate Collection 12 ", "ultimate collection"],
    ["12", ""],
  ])("%s → %j", (title, stem) => {
    expect(collectedStem(title)).toBe(stem);
  });
});
