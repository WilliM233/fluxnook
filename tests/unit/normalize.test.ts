import { describe, expect, it } from "vitest";
import { normalizeName, normalizeTitle } from "@/lib/catalog/normalize";

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
