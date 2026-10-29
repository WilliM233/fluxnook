# Plan: <vol>.<n> <Chapter title>

Issue: #<n> · Branch: `chapter/<vol>.<n>-<slug>` (carries the spec, Run 1 and the first Signature) · Volume: <Volume name>

Signatures: <vol>.<n>.1 <name> (#<n>, `docs/plans/<vol>.<n>.1-<slug>.md`) · <vol>.<n>.2 … (filled by the Binder in Run 1)

## 0. Spec (Nookkeeper)

**What this chapter delivers.** Two or three sentences a user would understand.

**Acceptance.** Each line observable by L in the Browse.
- A1 …
- A2 …

**Calls this chapter depends on.** Roadmap calls by date, quoted.

**Hands.** `team runs it` or the step numbers L builds by paste.

**Browse.** What L does by hand before sign-off, as a short script: open this, do that, see this.

**QA model.** `Opus` or `Fable`. Fable when the chapter opens a door: auth, visibility, migrations on content tables, import or export, anything that can lose or expose a person's data.

**Out of scope.** Named so the Cartographer doesn't plan it and the Raccoon doesn't flag its absence.

## 1. Feasibility (Nookkeeper)

What exists, what doesn't, what the risk is. File and line where it matters. Provider limits, data gaps, anything that could make an acceptance line impossible as written.

## 2. Census (Cartographer)

What's there today that this chapter touches. File and line. Corrections to section 1 quoted.

## The Cut (Cartographer, Run 1)

One Signature is a valid cut. Measured on new tables, new screens, provider calls and acceptance lines; never a quota. Every acceptance line owned exactly once; no Signature depends on a later one; the last carries the chapter's end-to-end Browse unless a line here says why not.

| Signature | Name, slug | Delivers | Owns | Leaves to the next |
|---|---|---|---|---|
| <vol>.<n>.1 | <name>, `<slug>` | one sentence | A1, A2, … | … |
| <vol>.<n>.2 | … | … | … | … |

Exit Browse: Signature <vol>.<n>.<s>.

Sections 3 to 5 live in each Signature's file, `docs/plans/<vol>.<n>.<s>-<slug>.md`, from `TEMPLATE-signature.md`.

## Deferrals

- <date> … Trigger: …

## History

- <date> Nookkeeper: sections 0-1, issue #<n>
- <date> Cartographer: section 2 and the cut, N Signatures
- <date> Nookkeeper: cut Approved / changes
- <date> Binder: Signature issues #<n>…, census corrections carried into section 0 (census)
- <date> Signature <vol>.<n>.<s> merged, v0.<vol>.0-ch.<n>.<s> (one line each)
- <date> Afterword: worked … / didn't … / changes …
