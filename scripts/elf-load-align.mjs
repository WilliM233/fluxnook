// The load-segment alignment of a native library (Ch 2.1.2, the Raccoon's S1).
// A 16 KB-page Android device can't load a library whose PT_LOAD segments are
// aligned under 16384, and the apk installs anyway, so the build reads its own
// library and fails in words instead of a phone failing at launch.
//
// Usage: node scripts/elf-load-align.mjs <library.so> <minimum>
// Prints every PT_LOAD p_align; exits 1 when any is under the minimum.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The p_align of every PT_LOAD segment of a 64-bit little-endian ELF file.
 * @param {Buffer} bytes
 * @returns {number[]}
 */
export function loadAlignments(bytes) {
  if (
    bytes.readUInt32BE(0) !== 0x7f454c46 ||
    bytes[4] !== 2 ||
    bytes[5] !== 1
  ) {
    throw new Error("Not a 64-bit little-endian ELF file.");
  }
  const tableAt = Number(bytes.readBigUInt64LE(0x20));
  const entrySize = bytes.readUInt16LE(0x36);
  const entries = bytes.readUInt16LE(0x38);
  const alignments = [];
  for (let i = 0; i < entries; i += 1) {
    const at = tableAt + i * entrySize;
    const PT_LOAD = 1;
    if (bytes.readUInt32LE(at) === PT_LOAD) {
      alignments.push(Number(bytes.readBigUInt64LE(at + 0x30)));
    }
  }
  return alignments;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, minimum] = process.argv.slice(2);
  const alignments = loadAlignments(readFileSync(file));
  console.log(`${file}: PT_LOAD p_align ${alignments.join(", ")}`);
  const short = alignments.filter((alignment) => alignment < Number(minimum));
  if (alignments.length === 0 || short.length > 0) {
    console.error(
      `A 16 KB-page phone can't load this library: its segments are aligned to ${alignments.join(", ")}, under ${minimum}.`,
    );
    process.exit(1);
  }
}
