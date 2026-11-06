#!/usr/bin/env bash
# Browse 1.8.1, Chapter 1.8's exit (#96, #95). Volume 1's close-out: this script
# carries A2's Firefox runs, A3's Nightly and A4's two reds, and the hands walk
# Firefox once, five minutes. Git Bash, from a clean tree, with the local stack up
# and the dev server stopped. Run it as:
#   BROWSE_EMAIL=<your address> bash scripts/browse/1.8.1.sh
#
# Every check prints its name, what was expected, what came back, and pass or
# fail. A precondition that fails ends the run there with the summary. A step
# for your hands prints one action per line and waits for Enter. Every step
# is written to browse-results/1.8.1-steps.md before the first pause. The
# report is browse-results/1.8.1.txt; each e2e keeps its own report beside it,
# stamped, so a second run overwrites none.

set -u
cd "$(dirname "$0")/../.." || exit 1

APP=http://localhost:3000
BRANCH=chapter/1.8-close-out
REPORT=browse-results/1.8.1.txt
STEPS=browse-results/1.8.1-steps.md
RUN=$(date '+%Y%m%d-%H%M%S')
HOOK=src/components/ui/sheet-hold.ts
STARS_SPEC=tests/e2e/journal-sheets.spec.ts
TICKS_SPEC=tests/e2e/series-ticks.spec.ts

mkdir -p browse-results
# A rerun never overwrites a kept report (House Rules step 7): L's walk keeps the
# Binder's run that section 5 cites.
[ -s "$REPORT" ] && cp "$REPORT" "browse-results/1.8.1-before-$RUN.txt"
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

# One SQL statement against the local database; the bare result, no tag.
P() { docker exec supabase_db_fluxnook psql -U postgres -tAc "$1" | tr -d '\r' | head -1; }

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# An e2e's report is kept whole, under this run's stamp; its name is the argument.
kept() { echo "browse-results/1.8.1-$RUN-$1.txt"; }

# Whether a kept report's summary says exactly this, like "42 passed".
says() { # report, words
  grep -qE "^ +$2( |\$)" "$1" && echo found || echo missing
}

# A mutant goes back on any exit, so a Ctrl+C can't leave the tree mutated.
MUTATED=""
KEEP=$(mktemp)
restore() {
  [ -n "$MUTATED" ] && cp "$KEEP" "$MUTATED"
  MUTATED=""
}
trap 'restore; rm -f "$KEEP"' EXIT
trap 'exit 130' INT TERM

# The file copied aside and the copy checked, before anything touches it.
set_aside() { # file
  cp "$1" "$KEEP" && cmp "$1" "$KEEP" && MUTATED=$1 && echo saved
}

# A4 one: the hold's rule reads busy as false; `tried` is left alone.
mutate_hook() {
  sed -i 's/const held = busy;/const held = false \&\& busy;/' "$HOOK"
}

# A4 two: the wait comes off, so the reload follows the last star at once.
mutate_wait() {
  local from to
  from=$(grep -n "client state; only the page's refresh" "$STARS_SPEC" | cut -d: -f1)
  to=$(awk -v from="$from" 'NR > from && /await page\.reload\(\);/ { print NR; exit }' "$STARS_SPEC")
  sed -i "${from},$((to - 1))d" "$STARS_SPEC"
}

EMAIL=${BROWSE_EMAIL:-}
if [ -z "$EMAIL" ]; then
  printf 'Your address, to sign in with: '
  read -r EMAIL
fi

step_server() {
  echo "Step 1 of 6: the dev server"
  echo "In another terminal, from the repo root:"
  echo "  npm run dev"
  echo "Leave it running."
}

step_open() {
  echo "Step 2 of 6: Carrie, in Firefox"
  echo "Open Firefox. If you have none, in another terminal:"
  echo "  npx playwright open --browser=firefox $APP/"
  echo "Sign in as $EMAIL."
  echo "The link is the newest mail at http://127.0.0.1:54324"
  echo "Open: $APP/items/$C"
  echo "The Journal section reads:"
  echo "  Nothing logged yet. Log a read and the journal starts here."
}

step_log() {
  echo "Step 3 of 6: Log a read"
  echo "Click Log a read."
  echo "Click the LEFT half of the fourth star."
  echo "Beside the stars:"
  echo "  3.5"
  echo "Click Log it."
  echo "The sheet closes. The Journal heading reads:"
  echo "  1 read · last finished at ★ 3.5"
}

step_card() {
  echo "Step 4 of 6: the card's stars"
  echo "On the card, click the LEFT half of the fifth star."
  echo "Four and a half stars are filled. The heading reads:"
  echo "  1 read · last finished at ★ 4.5"
}

step_typed() {
  echo "Step 5 of 6: words held"
  echo "On the card, click Add an entry."
  echo "Type three words in Entry."
  echo "Press Escape. The sheet stays."
  echo "Click outside the sheet. It stays."
  echo "Click Cancel. It closes."
  echo "No entry on the card."
}

step_stop() {
  echo "Step 6 of 6: stop the server"
  echo "In its terminal, Ctrl+C."
}

say "Browse 1.8.1, Chapter 1.8's exit"
say "at $(git log -1 --oneline), $(date '+%Y-%m-%d %H:%M')"
say "The steps for your hands are in $STEPS once the fixtures load."
say ""

# 0. Where the walk starts; each of these ends the run when it fails
require "tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"
require "stack up" 0 "$(npx supabase status >/dev/null 2>&1; echo $?)"
require "dev server down" 000 "$(code "$APP/")"

# 1. A2 on this box: the two specs on Firefox, and the header's test
R=$(kept a2-firefox)
PLAYWRIGHT_ALL_BROWSERS=1 npx playwright test --project=firefox "$STARS_SPEC" "$TICKS_SPEC" --reporter=list >"$R" 2>&1
check "A2 Firefox, the two specs, exit" 0 "$?"
check "A2 Firefox, the two specs, 42 passed" found "$(says "$R" '42 passed')"
R=$(kept a2-header)
PLAYWRIGHT_ALL_BROWSERS=1 npx playwright test --project=firefox tests/e2e/shell.spec.ts -g "nowhere to break" --reporter=list >"$R" 2>&1
check "A2 Firefox, the long address, exit" 0 "$?"
check "A2 Firefox, the long address, 1 passed" found "$(says "$R" '1 passed')"
check "A2 the star itself never changed" "" "$(git diff --stat dev -- src/components/ui/star-control.tsx)"

# 2. A3: Nightly's word on this branch, and nothing since it but docs
LAST=$(gh run list --workflow=nightly.yml --branch "$BRANCH" --limit 1 --json conclusion,event,headSha,url --jq '.[0] | [.conclusion,.event,.headSha,.url] | @tsv' | tr -d '\r')
NIGHTLY=$(cut -f1 <<<"$LAST")
EVENT=$(cut -f2 <<<"$LAST")
SHA=$(cut -f3 <<<"$LAST")
measured "A3 the run" "$(cut -f4 <<<"$LAST") at $SHA"
check "A3 Nightly's conclusion" success "$NIGHTLY"
check "A3 it was the dispatch" workflow_dispatch "$EVENT"
check "A3 no code since its sha" "" "$(git diff --name-only "$SHA" HEAD -- src tests playwright.config.ts .github package.json package-lock.json)"

# 3. A4 one: the hold off the one place, every sheet red at once
HOLDS=(tests/e2e/sheet-hold.spec.ts tests/e2e/search.spec.ts tests/e2e/search-comics.spec.ts)
require "A4 one, the hook set aside" saved "$(set_aside "$HOOK")"
MUTATED=$HOOK
mutate_hook
R=$(kept a4-one-mutant)
npx playwright test -g "the hold:" "${HOLDS[@]}" --reporter=list >"$R" 2>&1
check "A4 one, the mutant, 13 failed" found "$(says "$R" '13 failed')"
restore
require "A4 one, restored, tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"
R=$(kept a4-one-restored)
npx playwright test -g "the hold:" "${HOLDS[@]}" --reporter=list >"$R" 2>&1
check "A4 one, restored, 13 passed" found "$(says "$R" '13 passed')"

# 4. A4 two: the wait off, red on the line Nightly was red on. How many of the
# five is the box's, so it is found, not counted.
require "A4 two, the spec set aside" saved "$(set_aside "$STARS_SPEC")"
MUTATED=$STARS_SPEC
mutate_wait
R=$(kept a4-two-mutant)
PLAYWRIGHT_ALL_BROWSERS=1 npx playwright test --project=firefox "$STARS_SPEC" -g "the left half of a star" --repeat-each=5 --reporter=list >"$R" 2>&1
check "A4 two, the mutant, exit not zero" not-zero "$([ "$?" -ne 0 ] && echo not-zero || echo zero)"
check "A4 two, NS_BINDING_ABORTED" found "$(grep -qF 'NS_BINDING_ABORTED' "$R" && echo found || echo missing)"
measured "A4 two, reds of five" "$(grep -cE '^ +x ' "$R")"
restore
require "A4 two, restored, tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"

# 5. The state the hands start from
require "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"
# The load needs your account, which a sign-in makes. GoTrue makes it here
# without the dev server, by sending you a link, so every step is written before
# the first pause (1.6.2 D9). The link it sends is spare; sign in from the one
# you ask for.
API=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '\r')
KEY=$(grep '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' .env.local | cut -d= -f2- | tr -d '\r')
require "your account made" 200 "$(printf '{"email":"%s","create_user":true}' "$EMAIL" |
  curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/v1/otp" \
    -H "apikey: $KEY" -H 'content-type: application/json' --data-binary @-)"
require "your account" 1 "$(P "select count(*) from auth.users where email = '$EMAIL'")"
require "fixtures:load" 0 "$(npm run fixtures:load -- --user "$EMAIL" >/dev/null 2>&1; echo $?)"

C=$(P "select item from item_sources where source = 'manual' and key = 'carrie-1974'")
reads() { P "select count(*) from occurrences where item = '$C'"; }
stars() { P "select stars from occurrences where item = '$C'"; }
entries() { P "select count(*) from journal_entries j join occurrences o on o.id = j.occurrence where o.item = '$C'"; }

{
  echo "# Browse 1.8.1, the steps for your hands"
  echo ""
  echo "Six: the dev server's start, four in Firefox, its stop."
  echo "This is the chapter's walk, once. What differs goes under the PR's Browse."
  for step in step_server step_open step_log step_card step_typed step_stop; do
    block "$step"
  done
} >"$STEPS"

check "Carrie has no read" 0 "$(reads)"
check "Carrie has no entry" 0 "$(entries)"

# 6. The hands, in Firefox
by_hand step_server
require "dev server up" 200 "$(code "$APP/")"
by_hand step_open
by_hand step_log
check "after Log it, reads" 1 "$(reads)"
check "after Log it, stars" 3.5 "$(stars)"
by_hand step_card
check "after the card's star, reads" 1 "$(reads)"
check "after the card's star, stars" 4.5 "$(stars)"
by_hand step_typed
check "after Cancel, entries" 0 "$(entries)"
by_hand step_stop
require "dev server down" 000 "$(code "$APP/")"

# 7. Back to a clean database, so test:db starts from nothing
check "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"
check "no account left" 0 "$(P 'select count(*) from auth.users')"
check "tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"

summary
[ "$failed" -eq 0 ]
