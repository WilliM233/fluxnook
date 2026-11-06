import { describe, expect, it } from "vitest";
import {
  journalHeading,
  journalLede,
  readDates,
  readState,
  writtenLabel,
  writtenTime,
} from "@/lib/journal/lines";

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

describe("writtenTime", () => {
  it("the instant's local hour and minute, 24-hour", () => {
    const iso = "2019-03-09T21:14:03.512345Z";
    const at = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(writtenTime(iso)).toBe(
      `${pad(at.getHours())}:${pad(at.getMinutes())}`,
    );
    expect(writtenTime(iso)).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("readState", () => {
  const now = new Date(2026, 10, 3, 12);
  const read = {
    status: "done" as const,
    startedOn: null,
    finishedOn: null,
    stars: null,
  };

  it("this year's dates leave the year off (A8's examples)", () => {
    expect(
      readState(
        "book",
        { ...read, status: "in_progress", startedOn: "2026-10-28" },
        now,
      ),
    ).toBe("Reading since 28 October");
    expect(
      readState("book", { ...read, finishedOn: "2026-11-01", stars: 5 }, now),
    ).toBe("Done, 1 November · ★ 5");
  });

  it("another year's dates keep it", () => {
    expect(
      readState("book", { ...read, finishedOn: "2019-03-09", stars: 4.5 }, now),
    ).toBe("Done, 9 March 2019 · ★ 4.5");
    expect(
      readState(
        "comic",
        { ...read, status: "abandoned", finishedOn: "2020-05-02" },
        now,
      ),
    ).toBe("Abandoned, 2 May 2020");
  });

  it("an abandoned read with no Finished falls back to its Started", () => {
    expect(
      readState(
        "book",
        { ...read, status: "abandoned", startedOn: "2020-04-30" },
        now,
      ),
    ).toBe("Abandoned, 30 April 2020");
  });

  it("no date for the state is the word alone, stars still after it", () => {
    expect(readState("comic", read, now)).toBe("Done");
    expect(readState("comic", { ...read, stars: 4 }, now)).toBe("Done · ★ 4");
    expect(readState("book", { ...read, status: "in_progress" }, now)).toBe(
      "Reading",
    );
    expect(readState("book", { ...read, status: "abandoned" }, now)).toBe(
      "Abandoned",
    );
  });

  it("a film or a show is watched", () => {
    expect(
      readState(
        "tv",
        { ...read, status: "in_progress", startedOn: "2026-10-28" },
        now,
      ),
    ).toBe("Watching since 28 October");
    expect(
      readState("film", { ...read, finishedOn: "2026-11-03", stars: 3.5 }, now),
    ).toBe("Done, 3 November · ★ 3.5");
  });
});

describe("journalLede", () => {
  const SECOND =
    " An entry is written from a work's page, on the read or watch it belongs to.";

  it("with none, the empty sentence alone", () => {
    expect(journalLede({ entries: 0, works: 0 })).toBe(
      "Nothing written yet. Open a work, log a read or a watch, and write the first line.",
    );
  });

  it("singulars at one, plurals past it", () => {
    expect(journalLede({ entries: 1, works: 1 })).toBe(
      `1 entry across 1 work, newest first.${SECOND}`,
    );
    expect(journalLede({ entries: 2, works: 1 })).toBe(
      `2 entries across 1 work, newest first.${SECOND}`,
    );
    expect(journalLede({ entries: 51, works: 2 })).toBe(
      `51 entries across 2 works, newest first.${SECOND}`,
    );
  });
});
