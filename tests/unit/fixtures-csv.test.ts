import { describe, expect, it } from "vitest";
import { parseCsv } from "../../scripts/fixtures/csv.mjs";

describe("parseCsv", () => {
  it("splits records and fields; a trailing newline adds no record", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps commas and newlines inside quotes", () => {
    expect(parseCsv('"x, y","l1\nl2",z')).toEqual([["x, y", "l1\nl2", "z"]]);
  });

  it("reads a doubled quote inside quotes as one quote", () => {
    expect(parseCsv('"say ""hi"""')).toEqual([['say "hi"']]);
  });

  it("reads CRLF as LF, inside quoted fields too", () => {
    const lf = 'a,"one\ntwo"\nb,c\n';
    expect(parseCsv(lf.replaceAll("\n", "\r\n"))).toEqual(parseCsv(lf));
    expect(parseCsv('"one\r\ntwo"')).toEqual([["one\ntwo"]]);
  });

  it("reads an empty line as an empty record", () => {
    expect(parseCsv("a\n\nb\n")).toEqual([["a"], [], ["b"]]);
  });

  it("keeps a trailing empty field", () => {
    expect(parseCsv("1,2,")).toEqual([["1", "2", ""]]);
  });

  it("throws on an unterminated quote", () => {
    expect(() => parseCsv('a,"open\n')).toThrow();
  });

  it("throws on a character after a closing quote", () => {
    expect(() => parseCsv('"a"b')).toThrow();
  });
});
