# Fluxnook House Rules

How a chapter gets built. One copy lives here; the Nookkeeper's seat mirrors it as a skill. When a rule changes, edit this file, add a History line, and update the skill. The Afterword is the only process that may change this file, and it must.

## Vocabulary

| Word | Means |
|---|---|
| Volume | A milestone. One GitHub milestone, one `dev` to `main` merge, one tag |
| Chapter | One run of the pipeline. One GitHub issue, one branch, one PR, one squash commit |
| Plan | The chapter's file at `docs/plans/<vol>.<n>-<slug>.md`, sections 0 to 5 |
| Rummage | The Raccoon's attack list; every line becomes a test that is seen red, then green |
| Browse | L's hands-on walk through the chapter as a user, before sign-off |
| Afterword | The three-line retro on the issue before it closes |
| Stop-for-L | A design question the Cartographer found that only L can answer |

## Seats

| Seat | Who | Does one thing |
|---|---|---|
| Nookkeeper | Product owner; the Cowork project session | Spec and feasibility, plan review, PR review, sign-off, runs the Afterword |
| Cartographer | Architect subagent (`.claude/agents/cartographer.md`) | Census of what exists, the plan, the Stop-for-L list. Never writes app code |
| Binder | Claude Code main session (`CLAUDE.md`) | Builds the plan step by step, spawns the other agents one at a time, opens the PR |
| Raccoon | QA subagent, fresh context (`.claude/agents/raccoon.md`) | Diff vs plan, the Rummage, the failing tests. Never fixes what it finds |
| Scribe | Docs subagent, fresh context (`.claude/agents/scribe.md`) | README, docs, the release note. Reads the diff and the plan, never the Binder's summary |
| L | The human | Design calls, Stop-for-L answers, the Browse, PR review, the merge |

Subagents run one at a time, never concurrently. Five seats is the ceiling until an Afterword says a sixth is being skipped by hand.

## A chapter's life

0. **Pick.** The next chapter in the open Volume on the Roadmap. Design talk between L and the Nookkeeper; every call lands in the Roadmap's Calls list with its reason.
1. **Spec.** Nookkeeper writes Plan sections 0 and 1 (spec, acceptance lines, feasibility read against the repo, Hands line, Browse line) and opens the issue. The issue body is the spec; the plan file is the working copy.
2. **Map.** Binder spawns the Cartographer on the issue. Cartographer writes sections 2 and 3 (census, steps with observables) and the Stop-for-L list. L answers Stop-for-L; Nookkeeper reviews the plan against the spec: every call kept, no scope added, observables match acceptance lines. Reply is `Approved` or a list of changes tied to spec lines. The Cartographer is re-engaged only to restructure.
3. **Build.** Binder works the steps on `chapter/<vol>.<n>-<slug>` off `dev`. Each step ends at its observable. A side find is a Deferrals line on the plan, never a step.
4. **Rummage.** Binder spawns the Raccoon with the diff and the plan. Raccoon writes section 4: findings (blocking, should, note) and the Rummage. Blocking findings are fixed in the chapter. Every Rummage line becomes a test; Binder watches each fail before it passes.
5. **Scribe.** Binder spawns the Scribe with the diff and the plan. Scribe updates README and docs that the chapter changed, and drafts `docs/releases/<vol>.<n>.md`. Accuracy over verbosity: if a sentence can't be checked against the diff, it goes.
6. **PR.** Binder opens the PR into `dev` with the template filled. CI must be green.
7. **Browse.** L runs the chapter by hand along the Browse line in the plan. Anything that breaks in the Browse is a blocking finding and goes back to step 3.
8. **Review and sign-off.** Nookkeeper and L both read the PR. Nookkeeper checks the handoff against the plan, not memory: every step landed or has a named deviation, every Rummage line seen red then green, every Defer has a trigger, docs match the diff. Reply is `Signed off`, `Signed off with notes` (notes filed to Deferrals or Roadmap now), or `Not yet` with gaps in step order.
9. **Merge.** L squash-merges. Subject is the chapter's conventional-commit line, 60 characters or fewer.
10. **Afterword.** Before the issue closes, three lines on it: what worked, what didn't, what changes. A process change edits this file; a knowledge change edits a skill in `.claude/skills/`. If neither file changed, the Afterword isn't done.

## Git

- `main` is the released product. `dev` is the open Volume. Neither takes a direct push.
- Chapter branches: `chapter/<vol>.<n>-<slug>`, off `dev`, squash-merged by PR.
- Volume close: PR `dev` to `main`, merge commit, tag `v<major>.<vol>`. Volume 0 tags `v0.0`, alpha `v0.1`, beta `v0.2`, 1.0 `v1.0`.
- A `test` branch is added only when a test environment exists that previews don't cover. Until then, Vercel preview per PR is the test environment.
- Conventional commits: `feat`, `fix`, `chore`, `docs`, `ci`, `test`, `refactor`. Scope is the area (`shelves`, `providers/tmdb`, `schema`). Body says why, not what.
- No commit without a chapter. Hotfixes are a one-step chapter with a Browse line.

## Tests and CI

- Every PR: Biome, typecheck, Vitest, Drizzle migration check, Playwright smoke suite. Full Playwright nightly on `dev`.
- Supabase local runs in CI; e2e hits a real Postgres, never a mock.
- A Rummage test that can't be made to fail first is a finding against the test, not a pass.
- Fixtures are the acceptance data: the King path and the TMNT Mirage tab live in `supabase/seed` from Volume 0 Chapter 3 and every later chapter is accepted against them.

## Plan file

`docs/plans/TEMPLATE.md` is the shape. Sections: 0 Spec · 1 Feasibility · 2 Census · 3 Steps · 4 Rummage and findings · 5 Handoff. Deferrals and History at the bottom. The file is the record; chat is not.

## Pilot rule

At each sign-off the Nookkeeper answers two questions in one line each, filed on this file's History: did the Cartographer's plan need corrections? Did the Raccoon find something the Binder missed? Two clean chapters in a row on a question trims that gate (the Cartographer's plan is approved on sight; the Raccoon runs only its Rummage). One hit restores it. This is what keeps the ceremony proportional to the project.

## Whimsy

Names are the vocabulary above and nothing is renamed to sound serious. Release notes are written for the people who'll use the nook, in plain words. The Raccoon's findings may be a little smug. The Scribe's may not.

## History

- 2026-10-16 Created from the Flux Labs pipeline for the Volume 0 restart. Added the Scribe seat, the Browse, the Afterword, and the two-branch git model.
