// The apk's versionCode, derived from package.json's version (Ch 2.1.2, plan
// section 3's shape choices; the Nookkeeper's correction at plan review).
//
// Android refuses an install whose versionCode is lower than the one on the
// phone, so the code has to rise with every newer build, or an older build could
// install over a newer one and open a newer store. Tauri's own default
// (major * 1000000 + minor * 1000 + patch) gives every 0.2.0-* build 2000.
//
// A release M.m.p is M * 100000000 + m * 1000000 + p * 10000.
// A pre-release M.m.p-ch.<n>.<s> sits under its release:
//   that release's code - 10000 + n * 100 + s.
// So 0.2.0-ch.1.1 is 1990101, 0.2.0-ch.1.2 is 1990102, 0.2.0 is 2000000, the
// hotfix 0.2.1 is 2010000, and 0.3.0-ch.1.1 is 2990101, above it.
// Minor, patch, n and s are each under 100 and major under 21, which keeps the
// code under the 2100000000 Tauri and the Play Store allow.
//
// Usage: node scripts/version-code.mjs [version]   (default: package.json's)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SHAPE = /^(\d+)\.(\d+)\.(\d+)(?:-ch\.(\d+)\.(\d+))?$/;

/**
 * The versionCode for a version in the repo's shapes, `M.m.p` or `M.m.p-ch.<n>.<s>`.
 * @param {string} version
 * @returns {number}
 */
export function versionCode(version) {
  const match = SHAPE.exec(version);
  if (!match) {
    throw new Error(
      `A version code needs M.m.p or M.m.p-ch.<n>.<s>, and ${version} is neither.`,
    );
  }
  const [major, minor, patch, chapter, signature] = match
    .slice(1)
    .map((part) => (part === undefined ? undefined : Number(part)));
  const parts = { minor, patch, chapter, signature };
  for (const [name, value] of Object.entries(parts)) {
    if (value !== undefined && value > 99) {
      throw new Error(
        `A version code holds ${name} up to 99, and ${version} has ${value}.`,
      );
    }
  }
  if (major > 20) {
    throw new Error(
      `A version code holds a major up to 20, and ${version} has ${major}.`,
    );
  }
  const release = major * 100_000_000 + minor * 1_000_000 + patch * 10_000;
  if (chapter === undefined) return release;
  if (chapter < 1 || signature < 1) {
    throw new Error(
      `A chapter and a signature count from 1, and ${version} has a 0.`,
    );
  }
  return release - 10_000 + chapter * 100 + signature;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version =
    process.argv[2] ??
    JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ).version;
  console.log(versionCode(version));
}
