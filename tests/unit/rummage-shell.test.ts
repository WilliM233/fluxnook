import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { versionCode } from "../../scripts/version-code.mjs";

// Rummage R1-R6 (ch 2.1.2). The builds that reach L's phone and PC, read from
// the files that make them. No YAML parser is a dependency; the shapes checked
// are one line each, as tests/unit/rummage-workflows.test.ts reads them.

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const build = read(".github/workflows/build.yml");
const shell = JSON.parse(read("src-tauri/tauri.conf.json"));

/** The `run:` block of the step with this name, its lines dedented. */
function runOf(workflow: string, stepName: string): string {
  const at = workflow.indexOf(`- name: ${stepName}`);
  expect(at, `a step named ${stepName}`).toBeGreaterThan(-1);
  const rest = workflow.slice(at);
  const next = rest.indexOf("\n      - ", 1);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("the builds", () => {
  // The Nookkeeper's line at plan review: build A installed over build B is
  // refused. Android refuses only when B's versionCode is the higher, and
  // Tauri's own default gives every 0.2.0-* build 2000: the two probe apks,
  // built without the rule, both read versionCode='2000' (aapt dump badging,
  // browse-results/2.1.2-probe-http and -https). The green is the walk's P9.
  it("R1: the apk's versionCode comes from the rule, and A's is below B's", () => {
    const step = runOf(build, "The signed apk, the phone's ABI only");
    expect(step).toMatch(/android build/);
    expect(step).toMatch(/versionCode\\?":\$VERSION_CODE/);
    expect(build).toMatch(/node scripts\/version-code\.mjs/);
    expect(versionCode("0.2.0-ch.1.1")).toBeLessThan(
      versionCode("0.2.0-ch.1.2"),
    );
  });

  // Android needs a positive versionCode; Gradle takes what it is given.
  // 0.0.0 is Volume 0's own version, and the rule hands it 0, and its first
  // chapter -9899.
  it("R2: a version whose code would be under 1 is refused in words", () => {
    expect(() => versionCode("0.0.0")).toThrow(/under 1|at least 1/);
    expect(() => versionCode("0.0.0-ch.1.1")).toThrow(/under 1|at least 1/);
  });

  // Semver forbids a leading zero in a numeric part, and the rule read one as
  // the same number: 0.2.0-ch.01.1 came out as 0.2.0-ch.1.1's code, so two
  // version strings shared one code and Android would take neither over the
  // other.
  it.each(["0.2.0-ch.01.1", "00.2.0", "0.2.0-ch.1.01", "0.02.0"])(
    "R3: a leading zero in %s is refused, not read as the same number",
    (version) => {
      expect(() => versionCode(version)).toThrow(/leading zero/);
    },
  );

  // P9's twin on Windows. Tauri's NSIS installs an older version over a newer
  // one unless this is false (config.schema.json, allowDowngrades: "The NSIS
  // installer won't install them over 1.2.1 in silent, passive or update mode.
  // The interactive installer only lets the user install them after
  // uninstalling 1.2.1 first"). The Deferral this Signature closed names
  // Android alone.
  it("R4: an older Windows build is refused over a newer one", () => {
    expect(shell.bundle?.windows?.allowDowngrades).toBe(false);
  });

  // The CI apk's lib/arm64-v8a/libfluxnook_lib.so has PT_LOAD p_align 4096. A
  // 16 KB-page device (Android 15+; the API 37 Play image, getconf PAGE_SIZE
  // 16384) shows "This app isn't 16 KB compatible. ELF alignment check failed"
  // and ran it in compatibility mode, where it stopped. L's phone reads 4096
  // today.
  //
  // The Raccoon's first shape, the flag in src-tauri/.cargo/config.toml, was
  // green here and still built a 4096 library (build.yml run 42400048440 at
  // 1249eba): Tauri sets CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS itself, and
  // a file can't add to that. A build script's link arg is added whatever the
  // environment holds, and the build checks the library it made, so the next
  // file that looks right over a wrong library fails CI, not a phone.
  it("R5: the Android library links 16 KB page-aligned, and the build checks it", () => {
    expect(existsSync(join(ROOT, "src-tauri/.cargo/config.toml"))).toBe(false);
    const buildScript = read("src-tauri/build.rs");
    expect(buildScript).toMatch(/CARGO_CFG_TARGET_OS[\s\S]*"android"/);
    expect(buildScript).toMatch(
      /cargo:rustc-link-arg=-Wl,-z,max-page-size=16384/,
    );
    const check = runOf(
      build,
      "Named for its version and label, and its key printed",
    );
    expect(check).toMatch(/node scripts\/elf-load-align\.mjs \S+ 16384/);
  });

  // `echo "VERSION_CODE=$(node ...)" >> "$GITHUB_ENV"` is an echo that
  // succeeds whatever the script did (bash -e, exit 0, seen on the box), so a
  // version outside the rule leaves VERSION_CODE empty and the build fails
  // three steps later at Tauri's --config parse, not in the rule's words.
  it("R6: the version-code step fails when the rule does", () => {
    const step = runOf(
      build,
      "The label, the version code and the runner's NDK",
    );
    expect(step).not.toMatch(/echo "VERSION_CODE=\$\(/);
    expect(step).toMatch(
      /^\s*VERSION_CODE=\$\(node scripts\/version-code\.mjs\)/m,
    );
  });
});
