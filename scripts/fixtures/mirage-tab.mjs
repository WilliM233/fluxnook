/**
 * Turns the Mirage tab of L's TMNT sheet into comics and the shelf that
 * mirrors it.
 *
 * The tab, as exported: a column header (`Read,Issue,Name,Publish Date,
 * Owned,Format`), a title row (`Mirage Run`), then sections, each a blank
 * row, a header row and its data rows. A header has the section name in
 * `Issue` and, on the first section of a volume, `Volume <n>` in `Read`
 * (Volumes 2 to 4 repeat it in `Owned`). A data row has `TRUE` or `FALSE` in
 * `Read`.
 *
 * The columns change meaning by section, so each header names a rule
 * (`RULES`): which cell is the title, which the date, and how the form,
 * series and number are read. The numbered runs take their series from
 * `SERIES`; a mini series takes it from `Name` less its ` #<n>` or
 * `, part <n>`; a Minor Titles, tie-in or crossover title ending ` #<n>` is
 * an issue of the title before it, else a one-shot. The date cell gives
 * `year` (its first four-digit number) and `month` (a leading month name);
 * the cell is kept in `source_date`, and a cell with no year is a gap.
 *
 * Then the collection. A backup is contained-in its host (`Name`): the Vol 1
 * issue when the cell is exactly `Teenage Mutant Ninja Turtles #<n>` and the
 * sheet lists it, else an `anthology` item of that cell. An owned row names
 * its Ultimate Collection in `Format`; each collection is a `collected` work
 * with a hardcover edition whose contents are those rows, and a copy of it.
 * A read row is a `done` occurrence. Items come out rows first, in sheet
 * order, then anthologies, then collections.
 *
 * Ids are `manual:tmnt-mirage-<key>-<n>` for a numbered row and
 * `manual:tmnt-mirage-<section>-<title>` otherwise. A repeated id stops the
 * build, except in Supplemental/Crossover, where the sheet repeats a row and
 * the later one takes `-r<record>`. So does a header the rules don't know, a
 * row a rule can't give an id to, and any cell a rule relies on that isn't
 * what it expects. The rules are fitted to this tab; another tab needs its
 * own.
 */
import { parseCsv } from "./csv.mjs";
import { slug } from "./slug.mjs";

const HEADER = ["Read", "Issue", "Name", "Publish Date", "Owned", "Format"];
const TAB = "Mirage Run";
// The export carries no date of its own; the raw README row records it.
const EXPORT_DATE = "2026-10-23";
const SHELF_NAME = "TMNT, the Mirage run";
const SHELF_DESCRIPTION = `Mirrors the Mirage tab of L's TMNT sheet as exported on ${EXPORT_DATE}, section for section and row for row.`;
const MONTHS = [
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

// The numbered runs, by volume and header: the series name and the id key.
const SERIES = {
  "1|Main Series": ["Teenage Mutant Ninja Turtles (Mirage) Vol. 1", "v1"],
  "2|Main Series": ["Teenage Mutant Ninja Turtles (Mirage) Vol. 2", "v2"],
  "3|Image Series": ["Teenage Mutant Ninja Turtles (Image) Vol. 3", "v3"],
  "4|Main Series": ["Teenage Mutant Ninja Turtles (Mirage) Vol. 4", "v4"],
  "1|Tales of the Teenage Mutant Ninja Turtles": [
    "Tales of the Teenage Mutant Ninja Turtles",
    "tales-v1",
  ],
  "4|Tales of the Teenage Mutant Ninja Turtles 2": [
    "Tales of the Teenage Mutant Ninja Turtles Vol. 2",
    "tales-v2",
  ],
};

// One rule per header. `read` takes the row's cells and returns the title,
// the date cell, the note and the run fields, or calls `fail`.
const numbered = ({ Issue, Name, Published }, fail, run) => {
  const n = /^#(\d+)$/.exec(Issue);
  if (!n) fail(`Issue ${JSON.stringify(Issue)} is not #<n>`);
  const [series, key] = run;
  return {
    title: Name,
    date: Published,
    form: "issue",
    series,
    number: Number(n[1]),
    key,
  };
};

// A title ending ` #<n>` is an issue of the title before it.
const trailingNumber = (title, key) => {
  const n = / #(\d+)$/.exec(title);
  if (!n) return { form: "one-shot", series: null, number: null, key };
  const series = title.slice(0, n.index);
  return { form: "issue", series, number: Number(n[1]), key: slug(series) };
};

const RULES = {
  "Main Series": { kind: "ongoing", read: numbered },
  "Image Series": { kind: "ongoing", read: numbered },
  "Tales of the Teenage Mutant Ninja Turtles": {
    kind: "ongoing",
    read: numbered,
  },
  "Tales of the Teenage Mutant Ninja Turtles 2": {
    kind: "ongoing",
    read: numbered,
  },
  "Micro Series": {
    kind: "micro-series",
    read: ({ Issue, Name, Published }) => ({
      title: `${Issue}: ${Name}`,
      date: Published,
      form: "one-shot",
      series: null,
      number: null,
      key: "micro",
    }),
  },
  "Mini Series": {
    kind: "mini-series",
    read: ({ Issue, Name, Published }, fail) => {
      const n = /^#(\d+)$/.exec(Issue);
      if (!n) fail(`Issue ${JSON.stringify(Issue)} is not #<n>`);
      const part = /^(.+?)(?: #|, part )(\d+)$/.exec(Name);
      if (!part)
        fail(
          `Name ${JSON.stringify(Name)} ends in neither #<n> nor , part <n>`,
        );
      if (part[2] !== n[1])
        fail(`Name ${JSON.stringify(Name)} disagrees with Issue ${Issue}`);
      return {
        title: Name,
        date: Published,
        form: "issue",
        series: part[1],
        number: Number(n[1]),
        key: slug(part[1]),
      };
    },
  },
  // Kind null: a backup is a story, not a run; its host is in Name.
  "Short Stories": {
    kind: null,
    read: ({ Issue, Name, Published }, fail) => {
      if (Name === "") fail("is a backup with no host in Name");
      return {
        title: Issue,
        date: Published,
        host: Name,
        form: "backup",
        series: null,
        number: null,
        key: "backup",
      };
    },
  },
  // Slid left: the title is in Issue, the date in Name.
  "Minor Titles": { kind: "minor", read: slid("minor") },
  "Movie tie-ins": { kind: "tie-in", read: slid("tie-in") },
  // No date; a stray Name is kept as the note. The sheet repeats a row here.
  "Supplemental/Crossover": {
    kind: "crossover",
    repeats: true,
    read: ({ Issue, Name, Published }) => ({
      title: Issue,
      date: Published,
      note: Name,
      ...trailingNumber(Issue, "crossover"),
    }),
  },
};

function slid(key) {
  return ({ Issue, Name, Published }, fail) => {
    if (Published !== "")
      fail(
        `Publish Date ${JSON.stringify(Published)} should be empty; this section's date is in Name`,
      );
    return { title: Issue, date: Name, ...trailingNumber(Issue, key) };
  };
}

function readDate(cell) {
  const year = /(?<!\d)\d{4}(?!\d)/.exec(cell);
  const month = MONTHS.findIndex((name) =>
    new RegExp(`^${name}\\b`).test(cell),
  );
  return {
    year: year ? Number(year[0]) : null,
    ...(month === -1 ? {} : { month: month + 1 }),
  };
}

export function mirageTab(text, rawPath) {
  const records = parseCsv(text);
  const failAt = (record) => (message) => {
    throw new Error(`${rawPath}: record ${record}: ${message}`);
  };

  if (records[0]?.join(",") !== HEADER.join(",")) {
    failAt(0)(`is not the header ${HEADER.join(",")}`);
  }
  if (records[1]?.join(",") !== [TAB, "", "", "", "", ""].join(",")) {
    failAt(1)(`is not the title row ${TAB},,,,,`);
  }

  const items = [];
  const sections = [];
  const gaps = [];
  const recordOf = new Map();
  const repeatable = new Set();
  const backups = [];
  const collected = new Map();
  const occurrences = [];
  let volume;
  let section;

  for (let i = 2; i < records.length; i++) {
    const fail = failAt(i);
    const record = records[i];
    if (record.length === 0 || record.every((cell) => cell === "")) continue;
    if (record.length !== HEADER.length) {
      fail(`has ${record.length} fields, not ${HEADER.length}`);
    }
    const [Read, Issue, Name, Published, Owned, Format] = record;

    if (Read !== "TRUE" && Read !== "FALSE") {
      const vol = /^Volume (\d+)$/.exec(Read);
      if (Read !== "" && !vol) {
        fail(
          `Read ${JSON.stringify(Read)} is not TRUE, FALSE, blank or Volume <n>`,
        );
      }
      if (
        Name !== "" ||
        Published !== "" ||
        Format !== "" ||
        (Owned !== "" && Owned !== Read)
      ) {
        fail(`is a header with cells past its name`);
      }
      if (vol) volume = vol[1];
      if (volume === undefined) fail("is a header before any Volume <n>");
      // Own keys only: `toString` is not a section (Ch 0.6 R1).
      const rule = Object.hasOwn(RULES, Issue) ? RULES[Issue] : undefined;
      const runKey = `${volume}|${Issue}`;
      const run = Object.hasOwn(SERIES, runKey) ? SERIES[runKey] : undefined;
      if (!rule || (rule.read === numbered && !run)) {
        fail(`header ${JSON.stringify(Issue)} in Volume ${volume} has no rule`);
      }
      const name = `Volume ${volume} · ${Issue}`;
      const twin = sections.find((s) => s.name === name);
      if (twin)
        fail(`repeats the section ${name}; record ${twin.record} opened it`);
      section = { name, record: i, rule, run, entries: [] };
      sections.push(section);
      continue;
    }

    if (!section) fail("is a data row before any section header");
    if (Owned !== "TRUE" && Owned !== "FALSE") {
      fail(`Owned ${JSON.stringify(Owned)} is not TRUE or FALSE`);
    }
    const collection = /^Ultimate Collection ([1-5])$/.exec(Format);
    if (
      (Owned === "TRUE") !== Boolean(collection) ||
      (!collection && Format !== "")
    ) {
      fail(
        `Owned ${Owned} with Format ${JSON.stringify(Format)}; an owned row names Ultimate Collection 1 to 5, any other row nothing`,
      );
    }
    const { kind, read, repeats } = section.rule;
    const row = read({ Issue, Name, Published }, fail, section.run);
    if (row.title === "") fail("has an empty title");
    const tail = row.number === null ? slug(row.title) : String(row.number);
    if (tail === "" || row.key === "") fail("gives an empty id");
    let id = `manual:tmnt-mirage-${row.key}-${tail}`;
    if (recordOf.has(id)) {
      // Only a row repeated inside a section that allows it takes a suffix;
      // a repeat across sections would be a silent fork (Ch 0.6 R2).
      if (!repeats || !repeatable.has(id)) {
        fail(`is ${id} again; record ${recordOf.get(id)} is the first`);
      }
      id = `${id}-r${i}`;
    }
    recordOf.set(id, i);
    if (repeats) repeatable.add(id);

    const date = readDate(row.date);
    items.push({
      id,
      type: "comic",
      title: row.title,
      ...date,
      source_date: row.date,
      source_note: row.note ?? "",
      providers: {},
      form: row.form,
      series: row.series,
      series_kind: kind,
      number: row.number,
    });
    if (date.year === null) gaps.push({ item: id, reason: "no readable year" });
    section.entries.push({ item: id, position: section.entries.length + 1 });
    if (row.host !== undefined) {
      backups.push({ id, host: row.host, date, cell: row.date, record: i });
    }
    if (collection) {
      const n = Number(collection[1]);
      collected.set(n, [...(collected.get(n) ?? []), id]);
    }
    if (Read === "TRUE") occurrences.push({ item: id, status: "done" });
  }

  // Hosts resolve after the walk, so a backup may come before its issue. A
  // host is a Vol 1 issue only when the cell is exactly that issue's name and
  // the sheet lists it (A6); any other cell, reprints and listed rows of
  // other sections included, is an anthology of that exact text (Q2). It is
  // dated from its first dated backup; an undated backup is its own gap and
  // dates nothing, and a host no backup dates is a gap too (Ch 0.6 R3, R4).
  const anthologies = new Map();
  const relations = backups.map(({ id, host, date, cell, record }) => {
    const issue = /^Teenage Mutant Ninja Turtles #(\d+)$/.exec(host);
    const listed = issue && `manual:tmnt-mirage-v1-${issue[1]}`;
    if (listed && recordOf.has(listed)) {
      return { type: "contained-in", from: id, to: listed };
    }
    if (!anthologies.has(host)) {
      const hostId = `manual:tmnt-mirage-host-${slug(host)}`;
      if (recordOf.has(hostId)) {
        failAt(record)(
          `host ${JSON.stringify(host)} would be ${hostId}, which record ${recordOf.get(hostId)} already is`,
        );
      }
      recordOf.set(hostId, record);
      anthologies.set(host, { id: hostId, first: { date, cell } });
    }
    const anthology = anthologies.get(host);
    if (date.year !== null) {
      if (anthology.dated === undefined) {
        anthology.dated = { date, cell, record };
      } else if (anthology.dated.date.year !== date.year) {
        failAt(record)(
          `host ${JSON.stringify(host)} is dated ${date.year} here and ${anthology.dated.date.year} at record ${anthology.dated.record}`,
        );
      }
    }
    return { type: "contained-in", from: id, to: anthology.id };
  });
  const hosts = [...anthologies].map(([host, { id, first, dated }]) => {
    const { date, cell } = dated ?? first;
    if (date.year === null) gaps.push({ item: id, reason: "no readable year" });
    return {
      id,
      type: "comic",
      title: host,
      ...date,
      source_date: cell,
      source_note: "",
      providers: {},
      form: "anthology",
      series: null,
      series_kind: null,
      number: null,
    };
  });

  // An Ultimate Collection is a work whose edition collects the rows that
  // name it; owning a row is "owned via" the copy of that edition, never a
  // contained-in. Its date is the edition's, which the sheet doesn't hold.
  const numbers = [...collected.keys()].sort((a, b) => a - b);
  const collections = numbers.map((n) => ({
    id: `manual:tmnt-ultimate-collection-${n}`,
    type: "comic",
    title: `Ultimate Collection ${n}`,
    year: null,
    source_date: "",
    source_note: "",
    providers: {},
    form: "collected",
    series: null,
    series_kind: null,
    number: null,
  }));
  const editions = numbers.map((n) => ({
    id: `edition:tmnt-ultimate-collection-${n}-hardcover`,
    item: `manual:tmnt-ultimate-collection-${n}`,
    format: "hardcover",
    contents: collected.get(n),
  }));

  return {
    items: [...items, ...hosts, ...collections],
    shelves: [
      {
        name: SHELF_NAME,
        date: EXPORT_DATE,
        description: SHELF_DESCRIPTION,
        sections: sections.map(({ name, entries }) => ({ name, entries })),
      },
    ],
    relations,
    editions,
    copies: editions.map(({ id }) => ({ edition: id, note: "" })),
    occurrences,
    gaps,
  };
}
