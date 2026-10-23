/**
 * Builds a set of fixtures from their raw files, all or nothing.
 *
 * Every builder runs before any file is written, so a raw file that stops
 * its builder leaves the fixtures as they were rather than half rebuilt (Ch
 * 0.5 N3). `serializeFixture` is the only writer, so the same raw files
 * always give the same bytes. Returns one log line per file written.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The arrays a log line counts, in this order, after items and shelves.
const COUNTED = ["relations", "editions", "copies", "occurrences", "gaps"];

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  );
}

// Sorted keys, two-space indent, one trailing newline: what Biome's JSON
// formatter writes too, so lint and the byte compare agree.
function serializeFixture(data) {
  return `${JSON.stringify(sortKeys(data), null, 2)}\n`;
}

function counts(data) {
  const named = COUNTED.filter((key) => data[key]?.length > 0).map(
    (key) => `${data[key].length} ${key}`,
  );
  return [
    `${data.items.length} items`,
    `${data.shelves.length} shelves`,
    ...named,
  ].join(", ");
}

export function buildFixtures(sources, { rawDir, outDir }) {
  // A second line with the same `out` would silently replace the first.
  const outs = sources.map(({ out }) => out);
  const twice = outs.find((out, i) => outs.indexOf(out) !== i);
  if (twice !== undefined) {
    throw new Error(`${twice}: two SOURCES lines write it`);
  }
  const built = sources.map((source) => {
    const rawPath = `${rawDir}/${source.raw}`;
    // Two fixtures can share a raw file, so an error names the one being built.
    try {
      const data = source.build(readFileSync(rawPath, "utf8"), rawPath);
      return { out: source.out, text: serializeFixture(data), data };
    } catch (error) {
      throw new Error(`${source.out}: ${error.message}`);
    }
  });

  mkdirSync(outDir, { recursive: true });
  return built.map(({ out, text, data }) => {
    writeFileSync(join(outDir, out), text, "utf8");
    return `wrote ${outDir}/${out} (${counts(data)})`;
  });
}
