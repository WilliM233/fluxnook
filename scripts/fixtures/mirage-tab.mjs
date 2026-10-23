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
    read: ({ Issue, Published }) => ({
      title: Issue,
      date: Published,
      form: "backup",
      series: null,
      number: null,
      key: "backup",
    }),
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
      const rule = RULES[Issue];
      const run = SERIES[`${volume}|${Issue}`];
      if (!rule || (rule.read === numbered && !run)) {
        fail(`header ${JSON.stringify(Issue)} in Volume ${volume} has no rule`);
      }
      section = { name: `Volume ${volume} · ${Issue}`, rule, run, entries: [] };
      sections.push(section);
      continue;
    }

    if (!section) fail("is a data row before any section header");
    if (Owned !== "TRUE" && Owned !== "FALSE") {
      fail(`Owned ${JSON.stringify(Owned)} is not TRUE or FALSE`);
    }
    const { kind, read, repeats } = section.rule;
    const row = read({ Issue, Name, Published }, fail, section.run);
    if (row.title === "") fail("has an empty title");
    const tail = row.number === null ? slug(row.title) : String(row.number);
    if (tail === "" || row.key === "") fail("gives an empty id");
    let id = `manual:tmnt-mirage-${row.key}-${tail}`;
    if (recordOf.has(id)) {
      if (!repeats) {
        fail(`is ${id} again; record ${recordOf.get(id)} is the first`);
      }
      id = `${id}-r${i}`;
    }
    recordOf.set(id, i);

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
  }

  return {
    items,
    shelves: [
      {
        name: SHELF_NAME,
        date: EXPORT_DATE,
        description: SHELF_DESCRIPTION,
        sections: sections.map(({ name, entries }) => ({ name, entries })),
      },
    ],
    relations: [],
    editions: [],
    copies: [],
    occurrences: [],
    gaps,
  };
}
