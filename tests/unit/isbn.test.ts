import { describe, expect, it } from "vitest";
import { normalizeIsbn } from "@/lib/isbn";

describe("normalizeIsbn", () => {
  it("strips the hyphens off a 13", () => {
    expect(normalizeIsbn("978-0-307-74366-4")).toBe("9780307743664");
  });

  it("converts a 10 to its 13", () => {
    expect(normalizeIsbn("0307743667")).toBe("9780307743664");
  });

  it("refuses a 13 whose check digit is wrong", () => {
    expect(normalizeIsbn("978-0-307-74366-5")).toBeNull();
  });

  it("refuses a 979 whose check digit is wrong", () => {
    expect(normalizeIsbn("9799999999994")).toBeNull();
  });

  it("takes a 10 ending in X", () => {
    expect(normalizeIsbn("0-8044-2957-X")).toBe("9780804429573");
  });

  it("strips spaces as well as hyphens", () => {
    expect(normalizeIsbn("978 0 307 74366 4")).toBe("9780307743664");
  });

  it("takes a lowercase x", () => {
    expect(normalizeIsbn("080442957x")).toBe("9780804429573");
  });

  it("refuses twelve digits", () => {
    expect(normalizeIsbn("978030774366")).toBeNull();
  });
});
