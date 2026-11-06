import { describe, expect, it } from "vitest";
import {
  latestFinished,
  latestStarred,
  type ReadLike,
  sortReads,
  summarize,
} from "@/lib/journal/order";

// A5's card order: coalesce(finished_on, started_on, created_at::date) desc,
// created_at desc, then id so the order is total.

const read = (id: string, fields: Partial<ReadLike>): ReadLike => ({
  id,
  status: "done",
  startedOn: null,
  finishedOn: null,
  stars: null,
  createdAt: "2026-11-01T00:00:00.000000Z",
  ...fields,
});

describe("sortReads", () => {
  const reads = [
    read("march-2019", {
      startedOn: "2019-03-03",
      finishedOn: "2019-03-09",
      createdAt: "2026-11-01T10:00:00.000000Z",
    }),
    read("started-oct", {
      status: "in_progress",
      startedOn: "2026-10-28",
      createdAt: "2026-10-28T12:00:00.000000Z",
    }),
    read("no-dates", { createdAt: "2026-11-01T09:00:00.000000Z" }),
    read("finished-today", {
      finishedOn: "2026-11-02",
      createdAt: "2026-11-02T10:00:00.000000Z",
    }),
    read("started-today", {
      status: "in_progress",
      startedOn: "2026-11-02",
      createdAt: "2026-11-02T10:00:01.000000Z",
    }),
  ];

  it("over a list with and without dates: the day first, then the later logged", () => {
    expect(sortReads(reads).map((r) => r.id)).toEqual([
      "started-today",
      "finished-today",
      "no-dates",
      "started-oct",
      "march-2019",
    ]);
  });

  it("leaves its input as it was", () => {
    const before = reads.map((r) => r.id);
    sortReads(reads);
    expect(reads.map((r) => r.id)).toEqual(before);
  });

  it("the fixture's case: no dates and one created_at sort by id, newest id first", () => {
    const at = "2026-11-03T01:00:00.123456Z";
    const fixture = ["b", "a", "c"].map((id) => read(id, { createdAt: at }));
    expect(sortReads(fixture).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("microseconds decide between two reads logged in one millisecond", () => {
    const pair = [
      read("first", { createdAt: "2026-11-02T10:00:00.123400Z" }),
      read("second", { createdAt: "2026-11-02T10:00:00.123456Z" }),
    ];
    expect(sortReads(pair).map((r) => r.id)).toEqual(["second", "first"]);
  });
});

describe("latestFinished and latestStarred", () => {
  const open = read("open", {
    status: "in_progress",
    startedOn: "2026-11-02",
  });
  const dropped = read("dropped", {
    status: "abandoned",
    finishedOn: "2026-10-30",
    stars: 2,
  });
  const done = read("done", { finishedOn: "2019-03-09", stars: 4.5 });

  it("the newest done read, past an open and an abandoned one", () => {
    expect(latestFinished([done, open, dropped])?.id).toBe("done");
  });

  it("null with nothing done", () => {
    expect(latestFinished([open, dropped])).toBeNull();
  });

  it("a work's stars are the newest starred read's, an abandoned one included", () => {
    expect(latestStarred([done, open, dropped])?.id).toBe("dropped");
    expect(latestStarred([open])).toBeNull();
  });
});

describe("summarize", () => {
  it("none", () => {
    expect(summarize([])).toEqual({
      reads: 0,
      lastFinishedStars: null,
      readingNow: false,
    });
  });

  it("one done read without stars", () => {
    expect(summarize([read("a", {})])).toEqual({
      reads: 1,
      lastFinishedStars: null,
      readingNow: false,
    });
  });

  it("a starred done read beside an open one", () => {
    expect(
      summarize([
        read("done", { finishedOn: "2026-11-02", stars: 4.5 }),
        read("open", { status: "in_progress", startedOn: "2026-11-02" }),
      ]),
    ).toEqual({ reads: 2, lastFinishedStars: 4.5, readingNow: true });
  });
});
