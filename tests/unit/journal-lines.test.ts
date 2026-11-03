import { describe, expect, it } from "vitest";
import { journalHeading, readDates, writtenLabel } from "@/lib/journal/lines";

// The card's dates and the Journal heading (Ch 1.6 A5, census C3 and C4).

describe("readDates", () => {
  it("started only, both, finished only, neither", () => {
    expect(readDates({ startedOn: "2026-10-28", finishedOn: null })).toBe(
      "Started 28 October 2026",
    );
    expect(
      readDates({ startedOn: "2019-03-03", finishedOn: "2019-03-09" }),
    ).toBe("3 March 2019 to 9 March 2019");
    expect(readDates({ startedOn: null, finishedOn: "2019-03-09" })).toBe(
      "Finished 9 March 2019",
    );
    expect(readDates({ startedOn: null, finishedOn: null })).toBeNull();
  });

  it("a read started and finished on one day prints that day once (Q1 b)", () => {
    expect(
      readDates({ startedOn: "2026-11-02", finishedOn: "2026-11-02" }),
    ).toBe("2 November 2026");
  });
});

describe("journalHeading", () => {
  const none = { reads: 0, lastFinishedStars: null, readingNow: false };

  it("with no read, the empty sentence in the type's word", () => {
    expect(journalHeading("book", none)).toBe(
      "Nothing logged yet. Log a read and the journal starts here.",
    );
    expect(journalHeading("film", none)).toBe(
      "Nothing logged yet. Log a watch and the journal starts here.",
    );
  });

  it("the count alone, then each part when it holds", () => {
    expect(journalHeading("comic", { ...none, reads: 1 })).toBe("1 read");
    expect(
      journalHeading("book", { ...none, reads: 1, lastFinishedStars: 4.5 }),
    ).toBe("1 read · last finished at ★ 4.5");
    expect(
      journalHeading("book", { ...none, reads: 2, readingNow: true }),
    ).toBe("2 reads · reading now");
    expect(journalHeading("tv", { ...none, reads: 1, readingNow: true })).toBe(
      "1 watch · watching now",
    );
  });

  it("both parts in that order when both hold (C3, Q1 a)", () => {
    expect(
      journalHeading("book", {
        reads: 2,
        lastFinishedStars: 4.5,
        readingNow: true,
      }),
    ).toBe("2 reads · last finished at ★ 4.5 · reading now");
  });

  it("2 reads alone when the latest finished read has no stars (C4)", () => {
    expect(journalHeading("book", { ...none, reads: 2 })).toBe("2 reads");
  });
});

describe("writtenLabel", () => {
  it("the instant's local day, whatever the zone the test runs in", () => {
    const iso = "2026-11-02T03:30:00.000000Z";
    const at = new Date(iso);
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    expect(writtenLabel(iso)).toBe(
      `${at.getDate()} ${months[at.getMonth()]} ${at.getFullYear()}`,
    );
  });
});
