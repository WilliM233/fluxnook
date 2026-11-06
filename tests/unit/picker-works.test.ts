import { describe, expect, it } from "vitest";
import { normalizeName } from "@/lib/catalog/normalize";
import {
  matchesFind,
  type PickerWork,
  pickerLine,
} from "@/lib/catalog/picker-works";

const work = (over: Partial<PickerWork>): PickerWork => ({
  id: crypto.randomUUID(),
  type: "film",
  title: "Carrie",
  released_on: "1976-11-03",
  author: null,
  series: null,
  number: null,
  ...over,
});

const finds = (w: PickerWork, box: string) =>
  matchesFind(w, normalizeName(box));

describe("matchesFind", () => {
  it("finds a work by its title", () => {
    expect(finds(work({}), "carrie")).toBe(true);
    expect(finds(work({}), "shining")).toBe(false);
  });

  it("finds a book by its author, and not a film", () => {
    const book = work({ type: "book", author: "Stephen King" });
    expect(finds(book, "king")).toBe(true);
    expect(finds(work({}), "king")).toBe(false);
  });

  it("finds a comic by its series text", () => {
    const comic = work({
      type: "comic",
      title: "The Turtles' Origin is Told",
      series: "Teenage Mutant Ninja Turtles (Mirage) Vol. 1",
      number: 1,
    });
    expect(finds(comic, "mirage")).toBe(true);
  });

  it("folds case and accents on both sides", () => {
    expect(finds(work({}), "CARRIE")).toBe(true);
    const lot = work({ type: "book", title: "Jerusalem's Lot" });
    expect(finds(lot, "Jérusalem")).toBe(true);
  });

  it("an empty box matches everything", () => {
    expect(finds(work({}), "")).toBe(true);
    expect(finds(work({}), "  ")).toBe(true);
  });
});

describe("pickerLine", () => {
  it("a film is its year", () => {
    expect(pickerLine(work({}))).toBe("1976");
  });

  it("a book is its year and author", () => {
    const book = work({
      type: "book",
      released_on: "1974-04-05",
      author: "Stephen King",
    });
    expect(pickerLine(book)).toBe("1974 · Stephen King");
  });

  it("a comic is its year and series #n", () => {
    const comic = work({
      type: "comic",
      released_on: "1984-05-01",
      series: "Teenage Mutant Ninja Turtles (Mirage) Vol. 1",
      number: 1,
    });
    expect(pickerLine(comic)).toBe(
      "1984 · Teenage Mutant Ninja Turtles (Mirage) Vol. 1 #1",
    );
    expect(pickerLine({ ...comic, number: null })).toBe(
      "1984 · Teenage Mutant Ninja Turtles (Mirage) Vol. 1",
    );
  });

  it("no date and no author is empty", () => {
    expect(pickerLine(work({ type: "book", released_on: null }))).toBe("");
  });
});
