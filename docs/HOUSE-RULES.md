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

| Seat | Who | Model | Does one thing |
|---|---|---|---|
| Nookkeeper | Product owner; the Cowork project session | Fable | Spec and feasibility, plan review, PR review, sign-off, runs the Afterword. Cannot write to GitHub |
| Cartographer | Architect subagent (`.claude/agents/cartographer.md`) | Fable | Census of what exists, the plan, the Stop-for-L list. Never writes app code |
| Binder | Claude Code main session (`CLAUDE.md`) | Opus | Opens the chapter issue, builds the plan step by step, spawns the other agents one at a time, opens the PR. Never merges or closes |
| Raccoon | QA subagent, fresh context (`.claude/agents/raccoon.md`) | Opus; Fable when the spec's QA model line says so | Diff vs plan, the Rummage, the failing tests. Never fixes what it finds |
| Scribe | Docs subagent, fresh context (`.claude/agents/scribe.md`) | Sonnet | README, docs, the release note. Reads the diff and the plan, never the Binder's summary |
| L | The human | | Opens the chapter branch, design calls, Stop-for-L answers, the Browse, PR review, CI check, the merge. First commit and last click |

The model is set in each agent file's frontmatter. The spec's **QA model** line is Fable when the chapter opens a door: auth, visibility, migrations on content tables, import or export, anything that can lose or expose a person's data. Otherwise Opus.

Subagents run one at a time, never concurrently. Five seats is the ceiling until an Afterword says a sixth is being skipped by hand.

## A chapter's life

0. **Pick.** The next chapter in the open Volume on the Roadmap. Design talk between L and the Nookkeeper; every call lands in the Roadmap's Calls list with its reason. L opens `chapter/<vol>.<n>-<slug>` off `dev` before the Nookkeeper writes the plan.
1. **Spec.** Nookkeeper writes Plan sections 0 and 1 (spec, acceptance lines, feasibility read against the repo, Hands line, Browse line) into `docs/plans/` on the chapter branch, in L's checkout; the plan and the Roadmap edits are the branch's first commit, `docs: ch <vol>.<n> spec`, pushed by L. The repo copy of every standing doc is the one that counts; the project's copies are read-only mirrors synced from `dev`. The Binder opens the issue from the plan at its next session start: body is section 0 plus a link to the plan, milestone is the Volume, label `chapter`; then writes the number into the plan header. No agent is spawned for a chapter without an open issue.
2. **Map.** Binder spawns the Cartographer on the issue. Cartographer writes sections 2 and 3 (census, steps with observables) and the Stop-for-L list. L answers Stop-for-L; Nookkeeper reviews the plan against the spec: every call kept, no scope added, observables match acceptance lines. Reply is `Approved` or a list of changes tied to spec lines. The Cartographer is re-engaged only to restructure.
3. **Build.** Binder works the steps on `chapter/<vol>.<n>-<slug>` off `dev`. Each step ends at its observable. The Binder stops only for a Stop-for-L, a deviation that needs a call, or a red it can't fix inside the plan; otherwise it runs the steps through to the handoff, and the Nookkeeper reviews section 5, not each step. The PR may open as a draft as soon as a workflow needs an event to run on. A side find is a Deferrals line on the plan, never a step.
4. **Rummage.** Binder spawns the Raccoon with the diff and the plan. Raccoon writes section 4: findings (blocking, should, note) and the Rummage. Blocking findings are fixed in the chapter. Every Rummage line becomes a test; Binder watches each fail before it passes.
5. **Scribe.** Binder spawns the Scribe with the diff and the plan. Scribe updates README and docs that the chapter changed, and drafts `docs/releases/<vol>.<n>.md`. Accuracy over verbosity: if a sentence can't be checked against the diff, it goes.
6. **PR.** Binder marks the PR into `dev` ready with the template filled, `Closes #<issue>` (the Afterword is the branch's last commit, so closing on merge is right; a closing keyword is also what links the PR in the issue's Development panel). CI must be green. Whenever section 0 changes, the Binder updates the issue body in the same commit; the issue is the spec. The Binder comments on the issue at each seat handoff (plan approved, Rummage done, PR ready) so the issue reads as the chapter's log.
7. **Browse.** L runs the chapter by hand along the Browse line in the plan. Anything that breaks in the Browse is a blocking finding and goes back to step 3.
8. **Review and sign-off.** Nookkeeper and L both read the PR. Nookkeeper checks the handoff against the plan, not memory: every step landed or has a named deviation, every Rummage line seen red then green, every Defer has a trigger, docs match the diff. Reply is `Signed off`, `Signed off with notes` (notes filed to Deferrals or Roadmap now), or `Not yet` with gaps in step order.
9. **Afterword.** Three lines on the issue: what worked, what didn't, what changes. A process change edits this file; a knowledge change edits a skill in `.claude/skills/`; stale standing docs the chapter's seats couldn't touch are fixed here too. Those edits are the last commit on the chapter branch, `docs: ch <vol>.<n> afterword`, so they ride the PR. If no file changed, the Afterword isn't done.
10. **Merge.** L checks CI, squash-merges (subject is the chapter's conventional-commit line, 60 characters or fewer), pulls `dev`, tags the squash commit. The issue closes itself.

## Git

- `main` is the released product. `dev` is the open Volume. Neither takes a direct push.
- Chapter branches: `chapter/<vol>.<n>-<slug>`, off `dev`, squash-merged by PR.
- Volume close: PR `dev` to `main`, merge commit, tag `v0.<vol>.0`. Volume 0 is `v0.0.0`, alpha `v0.1.0`, beta `v0.2.0`, 1.0 `v1.0.0`.
- Chapter merge into `dev`: tag `v0.<vol>.0-ch.<n>` on the squash commit, so every chapter has a version. Pre-release suffix keeps them ordered before the Volume close.
- Hotfix on `main`: patch bump, `v0.<vol>.1`, `v0.<vol>.2`, then merged back to `dev`.
- `package.json` version is the current tag; the Scribe bumps it in the chapter that earns it.
- A `test` branch is added only when a test environment exists that previews don't cover. Until then, Vercel preview per PR is the test environment.
- Conventional commits: `feat`, `fix`, `chore`, `docs`, `ci`, `test`, `refactor`. Scope is the area (`shelves`, `providers/tmdb`, `schema`). Body says why, not what.
- No commit without a chapter. Hotfixes are a one-step chapter with a Browse line.
- A chapter with no PR (Chapter 0.1 was one) is tagged by hand on its commit.
- The Nookkeeper's seat cannot write to GitHub. The Binder opens issues and PRs; L merges PRs and closes issues; anything else (labels, milestones, protection) is a command block the Nookkeeper hands L. The Nookkeeper never reports a GitHub write as done until L or the Binder confirms it.

## Tests and CI

- Every PR: Biome, typecheck, Vitest, Drizzle migration check, Playwright smoke suite. Full Playwright nightly on `dev`.
- Supabase local runs in CI; e2e hits a real Postgres, never a mock.
- A Rummage test that can't be made to fail first is a finding against the test, not a pass.
- Fixtures are the acceptance data: the King path and the TMNT Mirage tab live in `supabase/seed` as data files from Volume 0 Chapters 4 to 6 (one chapter per media type) and every later chapter is accepted against them.

## Plan file

`docs/plans/TEMPLATE.md` is the shape. Sections: 0 Spec · 1 Feasibility · 2 Census · 3 Steps · 4 Rummage and findings · 5 Handoff. Deferrals and History at the bottom. The file is the record; chat is not.

## Pilot rule

At each sign-off the Nookkeeper answers two questions in one line each, filed on this file's History: did the Cartographer's plan need corrections? Did the Raccoon find something the Binder missed? Two clean chapters in a row on a question trims that gate (the Cartographer's plan is approved on sight; the Raccoon runs only its Rummage). One hit restores it. This is what keeps the ceremony proportional to the project.

## Whimsy

Names are the vocabulary above and nothing is renamed to sound serious. Release notes are written for the people who'll use the nook, in plain words. The Raccoon's findings may be a little smug. The Scribe's may not.

## History

- 2026-10-22 Ch 0.4 Afterword. Worked: the plan approved on sight cost nothing, the Binder's two deviations from it were improvements; the Raccoon's B1 and B2 were real data bugs (a repeated film lost its second row, a blank Year built as 0); no dependency for a 60-line CSV reader. Didn't: the Binder piped lint through `tail` and `grep` and reported a green it never saw, red on CI once; the raw CSV's CRLF turned to LF on the dev box after a `git checkout --`, which read as an edit. Changes: CLAUDE.md says every gate is read unpiped; the raw README says what git does to line endings on a Windows checkout. Pilot: Cartographer's plan needed no PO corrections (3 clean, stays approved on sight); Raccoon found something the Binder missed (gate stays)

- 2026-10-22 Ch 0.3 Afterword. Worked: six named checks on every PR from the first push; the Raccoon's B1 caught a `db:check` that passed a rename; one `signedIn` fixture for every later chapter. Didn't: the spec cited a House Rules line that existed only in the project copy (A9, dropped at plan review); the Binder stopped at every step for a relay nobody needed; the apt mirror stalled `--with-deps` on 4 of 6 e2e runs. Changes: L opens the branch and makes the first commit (steps 0, 1); repo copies are the ones that count; the Binder stops only for a call (step 3); draft PR allowed; `Closes` in the PR and the issue closes itself (steps 6, 10); the issue is the chapter's log; fixtures line names Chapters 4 to 6; `migrations` skill names `npm run db:check`. Pilot: Cartographer's plan needed no PO corrections (2 clean: approved on sight from Ch 0.4); Raccoon found something the Binder missed (gate stays)

- 2026-10-16 Ch 0.2 Afterword. Worked: the census settled six things the feasibility read guessed at; the Raccoon found a blocking login-CSRF with file and line; the Scribe caught a flaky test and a wrong comment. Didn't: the QA model wasn't chosen at spec time; the Scribe's brief forbade the History line it was told to write; the org-level CLAUDE.md contradicted the House Rules; two standing docs went stale with no seat allowed to fix them; `Closes` in the PR template would have shut the issue before the Afterword. Changes: model per seat and the QA model line; Afterword edits ride the PR as its last commit; `Refs` in the PR template; the Binder keeps the issue body in sync; the Scribe may append to a plan's History. Pilot: Cartographer's plan needed no PO corrections (1 clean); Raccoon found something the Binder missed (gate stays)

- 2026-10-16 The Binder opens the chapter issue from the plan file (Ch 0.2, caught by the Binder before spawning). Merging and closing stay with L

- 2026-10-16 Ch 0.1 Afterword. Worked: one script for the reset, protection rejected a real push. Didn't: PO seat has no GitHub write, three command blocks assumed a main checkout. Changes: the two Git lines above; .gitattributes committed. Pilot: no Cartographer or Raccoon this chapter, no score

- 2026-10-16 Semver: chapters are pre-release tags on dev, Volume close is the minor, hotfixes are the patch
- 2026-10-16 Created from the Flux Labs pipeline for the Volume 0 restart. Added the Scribe seat, the Browse, the Afterword, and the two-branch git model.
