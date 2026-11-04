import { describe, expect, it } from "vitest";
import { asksFirst, newestFloppy, takesFloppy } from "@/lib/collection/ticks";

// A8's rules over what A4 answers.

const copy = (id: string, format = "floppy") => ({
  id,
  format,
  condition: null,
  note: "",
});

describe("newestFloppy", () => {
  it("is the last floppy in A4's order", () => {
    expect(newestFloppy([copy("a"), copy("b")])?.id).toBe("b");
  });

  it("skips the other formats", () => {
    expect(newestFloppy([copy("a"), copy("b", "digital")])?.id).toBe("a");
  });

  it("is null at none", () => {
    expect(newestFloppy([copy("a", "digital")])).toBeNull();
    expect(newestFloppy([])).toBeNull();
  });
});

describe("asksFirst", () => {
  it("doesn't ask of a bare copy", () => {
    expect(asksFirst({ condition: null, note: "" })).toBe(false);
  });

  it("asks of a condition, a note or both", () => {
    expect(asksFirst({ condition: "good", note: "" })).toBe(true);
    expect(asksFirst({ condition: null, note: "Signed." })).toBe(true);
    expect(asksFirst({ condition: "good", note: "Signed." })).toBe(true);
  });
});

describe("takesFloppy", () => {
  it("is every comic form but a collected work and a backup", () => {
    expect(takesFloppy("issue")).toBe(true);
    expect(takesFloppy("one-shot")).toBe(true);
    expect(takesFloppy("anthology")).toBe(true);
    expect(takesFloppy("collected")).toBe(false);
    expect(takesFloppy("backup")).toBe(false);
  });
});
