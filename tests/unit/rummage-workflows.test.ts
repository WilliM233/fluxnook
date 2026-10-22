import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Rummage R6-R8 (ch 0.3). Read the workflow files as text; no YAML parser is
// a dependency, and the shapes checked here are one line each.

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const WORKFLOWS = [".github/workflows/ci.yml", ".github/workflows/nightly.yml"];
const ACTIONS = readdirSync(join(ROOT, ".github/actions")).map(
  (name) => `.github/actions/${name}/action.yml`,
);

/** Each job's block under `jobs:`, keyed by its id. */
function jobs(workflow: string): Record<string, string> {
  const body = workflow.split(/^jobs:\s*$/m)[1] ?? "";
  const blocks = body.split(/^ {2}(?=[\w-]+:\s*$)/m).filter((b) => b.trim());
  return Object.fromEntries(
    blocks.map((block) => [block.slice(0, block.indexOf(":")), block]),
  );
}

describe("workflows", () => {
  it.each(WORKFLOWS)("R6: every job in %s has a timeout-minutes", (path) => {
    const found = jobs(read(path));
    expect(Object.keys(found).length).toBeGreaterThan(0);
    for (const [id, block] of Object.entries(found)) {
      expect(block, `${path} job ${id}`).toMatch(/^ {4}timeout-minutes: \d+/m);
    }
  });

  it("R7: the nightly's Playwright cache key differs per browser", () => {
    const keys = read(".github/workflows/nightly.yml").match(/^\s+key: .*$/gm);
    expect(keys).not.toBeNull();
    for (const key of keys ?? []) {
      expect(key).toContain("matrix.browser");
    }
  });

  it.each([...WORKFLOWS, ...ACTIONS])(
    "R8: every non-local action in %s is pinned to a commit SHA",
    (path) => {
      const uses = read(path).match(/uses: [^\s#]+/g) ?? [];
      for (const use of uses.filter((u) => !u.startsWith("uses: ./"))) {
        expect(use, path).toMatch(/@[0-9a-f]{40}$/);
      }
    },
  );
});
