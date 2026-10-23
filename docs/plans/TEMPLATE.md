# Plan: <vol>.<n> <Chapter title>

Issue: #<n> · Branch: `chapter/<vol>.<n>-<slug>` · Volume: <Volume name>

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

## 3. Steps (Cartographer)

### Step 1: <does>
- Touches:
- Observable:
- Tests:

### Step 2: …

**Stop-for-L**
- Q1 … Options: a) … costs … b) … costs …

## 4. Rummage and findings (Raccoon)

**Findings**
- [blocking] file:line …
- [should] file:line …
- [note] …

**Rummage**
- R1 … → `tests/…` (seen red: <sha or date>, green: <sha or date>)
- R2 …

## 5. Handoff (Binder)

- Steps: landed / deviations, each named
- Rummage: every line with its test and red-then-green
- Deferrals: each with a trigger
- Docs: files the Scribe changed; release note path
- PR: #<n>

## Deferrals

- <date> … Trigger: …

## History

- <date> Nookkeeper: sections 0-1, issue #<n>
- <date> Cartographer: sections 2-3, N steps, M Stop-for-L
- <date> Nookkeeper: Approved / changes
- <date> Raccoon: B blocking, S should, N note, R rummage
- <date> Scribe: …
- <date> Nookkeeper: Signed off …
- <date> Afterword: worked … / didn't … / changes …
