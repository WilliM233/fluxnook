import { describe, expect, it } from "vitest";
import {
  copyChange,
  copyPost,
  type Printing,
  printingOptions,
} from "@/lib/collection/sheet";

// A7: one select, two shapes of post.

const printing = (over: Partial<Printing>): Printing => ({
  id: "p1",
  format: "paperback",
  title: null,
  publisher: null,
  released_on: null,
  ...over,
});
const fields = { condition: "", acquiredOn: "", note: "" };

describe("printingOptions", () => {
  it("lists the printings, then the formats the catalog lacks", () => {
    const { printed, lacking } = printingOptions(
      [
        printing({
          id: "p1",
          publisher: "Anchor Books",
          released_on: "2011-01-01",
        }),
      ],
      "book",
      "novel",
    );
    expect(printed).toEqual([
      { value: "edition:p1", label: "Paperback · Anchor Books, 2011" },
    ]);
    expect(lacking).toEqual([
      { value: "format:hardcover", label: "Hardcover" },
      { value: "format:ebook", label: "Ebook" },
      { value: "format:audiobook", label: "Audiobook" },
    ]);
  });

  it("prints the format alone when every part is null", () => {
    const { printed } = printingOptions(
      [printing({ id: "p2", format: "hardcover" })],
      "comic",
      "collected",
    );
    expect(printed[0].label).toBe("Hardcover");
  });

  it("a title beats a publisher, and a year stands alone", () => {
    expect(
      printingOptions(
        [
          printing({
            title: "Anniversary",
            publisher: "Anchor Books",
            released_on: "2011-01-01",
          }),
        ],
        "book",
        "novel",
      ).printed[0].label,
    ).toBe("Paperback · Anniversary, 2011");
    expect(
      printingOptions(
        [printing({ released_on: "2011-01-01" })],
        "book",
        "novel",
      ).printed[0].label,
    ).toBe("Paperback · 2011");
  });

  it("no printing lists only what the type allows", () => {
    const { printed, lacking } = printingOptions([], "film", null);
    expect(printed).toEqual([]);
    expect(lacking.map((o) => o.label)).toEqual([
      "DVD",
      "Blu-ray",
      "4K",
      "Digital",
    ]);
  });

  it("every format printed leaves nothing lacking", () => {
    const { lacking } = printingOptions(
      ["paperback", "hardcover", "ebook", "audiobook"].map((format) =>
        printing({ id: format, format }),
      ),
      "book",
      "novel",
    );
    expect(lacking).toEqual([]);
  });

  it("two printings of a format are two options", () => {
    const { printed, lacking } = printingOptions(
      [printing({ id: "a" }), printing({ id: "b" })],
      "book",
      "novel",
    );
    expect(printed.map((o) => o.value)).toEqual(["edition:a", "edition:b"]);
    expect(lacking.map((o) => o.value)).not.toContain("format:paperback");
  });
});

describe("the bodies", () => {
  it("a printing's option posts its edition", () => {
    expect(copyPost("w", "edition:p1", fields)).toEqual({
      edition: "p1",
      condition: null,
      acquiredOn: null,
      note: "",
    });
  });

  it("a format's option posts the work and the format", () => {
    expect(
      copyPost("w", "format:blu-ray", {
        condition: "fine",
        acquiredOn: "2019-03-12",
        note: "Sealed.",
      }),
    ).toEqual({
      item: "w",
      format: "blu-ray",
      condition: "fine",
      acquiredOn: "2019-03-12",
      note: "Sealed.",
    });
  });

  it("a change sends blanks as null and an empty note as empty", () => {
    expect(copyChange(fields)).toEqual({
      condition: null,
      acquiredOn: null,
      note: "",
    });
  });
});
