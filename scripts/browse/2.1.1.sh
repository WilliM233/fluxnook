#!/usr/bin/env bash
# Browse 2.1.1, The stub on PGlite (#100, #99). The stub in Chromium on this box,
# with no phone and no build yet; those are 2.1.2's, which carries the chapter's
# walk. Git Bash, from a clean tree, with nothing on ports 3000 or 4173. The stack
# isn't read by anything here: no reset, no sign-in, no fixtures. Run it as:
#   bash scripts/browse/2.1.1.sh
#
# Every check prints its name, what was expected, what came back, and pass or
# fail. A precondition that fails ends the run there with the summary. A step
# for your hands prints one action per line and waits for Enter. Every step
# is written to browse-results/2.1.1-steps.md before the first pause. The
# report is browse-results/2.1.1.txt; each test run keeps its own report beside
# it, stamped, so a second run overwrites none.

set -u
cd "$(dirname "$0")/../.." || exit 1

PREVIEW=http://localhost:4173
APP=http://localhost:3000
BRANCH=chapter/2.1-shell-and-builds
REPORT=browse-results/2.1.1.txt
STEPS=browse-results/2.1.1-steps.md
RUN=$(date '+%Y%m%d-%H%M%S')
# Read from the file, so the walk asks for what the page should print.
VERSION=$(grep -m1 '"version"' package.json | cut -d'"' -f4)

mkdir -p browse-results
# A rerun never overwrites a kept report (House Rules step 7): L's walk keeps the
# Binder's run that section 5 cites.
[ -s "$REPORT" ] && cp "$REPORT" "browse-results/2.1.1-before-$RUN.txt"
: >"$REPORT"
checks=0
failed=0

say() { printf '%s\n' "$*" | tee -a "$REPORT"; }

summary() {
  say ""
  say "$checks checks, $failed failed"
}

check() { # name, expected, actual
  checks=$((checks + 1))
  local result=pass
  if [ "$2" != "$3" ]; then
    result=fail
    failed=$((failed + 1))
  fi
  say "$1: expected $2, actual $3, $result"
}

# A check the rest of the run stands on: a fail ends the run here.
require() { # name, expected, actual
  check "$@"
  if [ "$2" != "$3" ]; then
    say "Stopped: the checks after this one need it."
    summary
    exit 1
  fi
}

measured() { say "$1: measured $2 (not asserted)"; }

# A step for your hands: its lines, then a wait for Enter.
by_hand() { # step function
  say ""
  "$@" | tee -a "$REPORT"
  printf 'Press Enter when it is done. '
  read -r _
  say ""
}

block() {
  echo ""
  echo '```text'
  "$@"
  echo '```'
}

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# A test run's report is kept whole, under this run's stamp; its name is the argument.
kept() { echo "browse-results/2.1.1-$RUN-$1.txt"; }

# Whether a kept report's summary says exactly this, like "5 passed".
says() { # report, words
  grep -qE "^ +$2( |\$)" "$1" && echo found || echo missing
}

has() { # report, words
  grep -qF "$2" "$1" && echo found || echo missing
}

step_server() {
  echo "Step 1 of 5: the stub's server"
  echo "In another terminal, from the repo root:"
  echo "  npm run device:preview"
  echo "Leave it running."
}

step_open() {
  echo "Step 2 of 5: the page"
  echo "Open a new incognito window in Chrome or Edge (Ctrl+Shift+N)."
  echo "Go to: $PREVIEW"
  echo "The first line reads:"
  echo "  14 migrations · 22 tables"
  echo "The version under it reads:"
  echo "  $VERSION"
  echo "Under the Shelf name field, nothing is listed."
  echo "The ground is near-black violet."
}

step_add() {
  echo "Step 3 of 5: a shelf"
  echo "Type in Shelf name:"
  echo "  King"
  echo "Click Add."
  echo "One shelf is listed:"
  echo "  King"
  echo "The field is empty, with the cursor in it."
}

step_reload() {
  echo "Step 4 of 5: it stays"
  echo "Reload the page."
  echo "The first line still reads:"
  echo "  14 migrations · 22 tables"
  echo "One shelf is listed:"
  echo "  King"
  echo "Close the incognito window."
}

step_stop() {
  echo "Step 5 of 5: stop the server"
  echo "In its terminal, Ctrl+C."
}

{
  echo "# Browse 2.1.1, the steps for your hands"
  echo ""
  echo "Five: the server's start, three on the page, its stop."
  echo "L's hands walk once, at 2.1.2. This is the Binder's report until then."
  for step in step_server step_open step_add step_reload step_stop; do
    block "$step"
  done
} >"$STEPS"

say "Browse 2.1.1, The stub on PGlite"
say "at $(git log -1 --oneline), $(date '+%Y-%m-%d %H:%M')"
say "The steps for your hands are in $STEPS."
say ""

# 0. Where the walk starts; each of these ends the run when it fails
require "tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"
require "the branch" "$BRANCH" "$(git branch --show-current)"
require "port 3000 free" 000 "$(code "$APP/")"
require "port 4173 free" 000 "$(code "$PREVIEW/")"
measured "version in package.json" "$VERSION"

# 1. A2: all 14 through the device's own list, on PGlite in Node
R=$(kept a2-migrate)
npx vitest run tests/unit/device-migrate.test.ts --reporter=verbose >"$R" 2>&1
check "A2 the migration test, exit" 0 "$?"
check "A2 14 migrations applied, 22 tables" found "$(has "$R" '14 migrations applied, 22 tables')"
check "A2 no migration edited" "" "$(git diff --stat origin/dev -- supabase)"

# 2. A3 and A7: the device person and the shelf add, as functions
R=$(kept a7-shelves)
npx vitest run tests/unit/device-shelves.test.ts --reporter=verbose >"$R" 2>&1
check "A7 the shelf tests, exit" 0 "$?"

# 3. A4a and A7: the page in Chromium, which builds and serves itself and stops
R=$(kept a7-e2e)
npx playwright test tests/e2e/device-stub.spec.ts --reporter=list >"$R" 2>&1
check "A7 the stub's e2e, exit" 0 "$?"
check "A7 the stub's e2e, 5 passed" found "$(says "$R" '5 passed')"

# 4. The build the hands look at
require "port 4173 free again" 000 "$(code "$PREVIEW/")"
npm run device:build >"$(kept device-build)" 2>&1
require "device:build, exit" 0 "$?"

# 5. The hands, in Chromium
by_hand step_server
require "preview up" 200 "$(code "$PREVIEW/")"
by_hand step_open
by_hand step_add
by_hand step_reload
by_hand step_stop
require "preview down" 000 "$(code "$PREVIEW/")"

# 6. Nothing left behind
check "tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"

summary
[ "$failed" -eq 0 ]
