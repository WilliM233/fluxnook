#!/usr/bin/env bash
# Browse 1.6.1, one open read (#82): TMNT #1's fixture read on a fresh load,
# Carrie's reads and entries posted through the API and read back on its
# page in A5's order, and A12's first eight reds with two sessions. Git
# Bash, from a clean tree, with the local stack up and the dev server
# stopped. Run it as:
#   BROWSE_EMAIL=<your address> bash scripts/browse/1.6.1.sh
#
# Every check prints its name, what was expected, what came back, and pass or
# fail. A precondition that fails ends the run there with the summary. A step
# for your hands prints one action per line and waits for Enter. Every step
# is written to browse-results/1.6.1-steps.md before the first pause. The
# report is browse-results/1.6.1.txt. The clicks are 1.6.2's and the exit
# Browse's (1.6.3); this one is the routes and the page as it reads.

set -u
cd "$(dirname "$0")/../.." || exit 1

APP=http://localhost:3000
MAILPIT=http://127.0.0.1:54324
REPORT=browse-results/1.6.1.txt
STEPS=browse-results/1.6.1-steps.md
# A middle dot and a star, as bytes: a literal one in an argument to a
# Windows program reaches it in the console's code page, not UTF-8 (1.5.1).
DOT=$(printf '\302\267')
STAR=$(printf '\342\230\205')
TODAY=$(date +%F)
TODAY_LONG=$(date '+%-d %B %Y')

mkdir -p browse-results
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

# A step for your hands: its lines, then a wait for Enter.
by_hand() { # step function, then its arguments
  say ""
  "$@" | tee -a "$REPORT"
  printf 'Press Enter when it is done. '
  read -r _
  say ""
}

# One SQL statement against the local database; the bare result.
P() { docker exec supabase_db_fluxnook psql -U postgres -tAc "$1" | tr -d '\r'; }

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# Whether a page holds a line: the HTML carries it twice (once rendered,
# once in Next's payload), so presence is the check, not a count.
has() { grep -qF -- "$1" <<<"$2" && echo found || echo missing; }

# Whether the first of two lines comes first on the page, by byte offset.
before() { # first, second, page
  local a b
  a=$(grep -b -o -m1 -F -- "$1" <<<"$3" | head -1 | cut -d: -f1)
  b=$(grep -b -o -m1 -F -- "$2" <<<"$3" | head -1 | cut -d: -f1)
  [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ] && echo yes || echo no
}

# The newest mail to an address, as Mailpit's id; empty when there is none.
newest_mail() {
  curl -s "$MAILPIT/api/v1/search?query=to:$1" |
    node.exe -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s).messages.find(m=>m.To.some(t=>t.Address===process.argv[1]));console.log(m?m.ID:"")})' "$1" |
    tr -d '\r'
}

# Signs in by magic link into a cookie jar; prints where the link landed.
# Mailpit keeps mail across a db reset, so only a mail newer than the ask
# is taken.
sign_in() {
  local email=$1 jar=$2 before id="" link
  : >"$jar"
  before=$(newest_mail "$email")
  curl -s -c "$jar" -b "$jar" -o /dev/null -X POST "$APP/api/v1/auth/magic-link" \
    -H 'content-type: application/json' -d "{\"email\":\"$email\"}"
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    id=$(newest_mail "$email")
    [ -n "$id" ] && [ "$id" != "$before" ] && break
    id=""
    sleep 1
  done
  [ -z "$id" ] && { echo "no new mail to $email"; return; }
  link=$(curl -s "$MAILPIT/api/v1/message/$id" |
    node.exe -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).Text.match(/http\S+verify\?[^\s)]+/)[0]))' |
    tr -d '\r')
  curl -s -c "$jar" -b "$jar" -L -o /dev/null -w '%{url_effective}' "$link"
}

# A JSON call as a jar; prints the status, keeps the body in $OUT. The body
# goes in on stdin, so nothing in it passes through an argument.
call() { # jar, method, path, body (may be empty)
  if [ -n "${4:-}" ]; then
    printf '%s' "$4" | curl -s -b "$1" -o "$OUT" -w '%{http_code}' -X "$2" \
      "$APP$3" -H 'content-type: application/json' --data-binary @-
  else
    curl -s -b "$1" -o "$OUT" -w '%{http_code}' -X "$2" "$APP$3"
  fi
}

# A value from the last call's body by a dotted path ("id", "error.fields.stars").
field() {
  node.exe -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let v=JSON.parse(s);for(const k of process.argv[1].split("."))v=v==null?v:v[k];console.log(v===undefined?"(none)":v)})' "$1" <"$OUT" |
    tr -d '\r'
}

page() { curl -s -b "$1" "$APP/items/$2"; }

# The Browse account's reads and entries, so another account's rows (the
# race test's) never move a count.
mine() { P "$(printf '%s' "$1" | sed "s/MINE/o.owner = (select id from auth.users where email = '$EMAIL')/")"; }

tally() { # label, reads, entries, starred
  check "$1 reads" "$2" "$(mine "select count(*) from occurrences o where MINE")"
  check "$1 entries" "$3" "$(mine "select count(*) from journal_entries j join occurrences o on o.id = j.occurrence where MINE")"
  check "$1 starred" "$4" "$(mine "select count(*) from occurrences o where MINE and o.stars is not null")"
}

# ---- The steps for your hands. Each prints one action per line.

step_server() {
  echo "Step 1, by hand: the dev server"
  echo ""
  echo "In another terminal, start it:"
  echo "    npm run dev"
  echo ""
  echo "Wait for Ready."
}

step_stop() {
  echo "Step 2, by hand: stop the dev server"
  echo ""
  echo "Ctrl+C in its terminal. The reset that follows ends every session."
}

EMAIL=${BROWSE_EMAIL:-}
if [ -z "$EMAIL" ]; then
  printf 'The address to sign in with: '
  read -r EMAIL
fi
STRANGER="stranger-$RANDOM$RANDOM@example.com"
JAR_A=$(mktemp)
JAR_B=$(mktemp)
OUT=$(mktemp)
trap 'rm -f "$JAR_A" "$JAR_B" "$OUT"' EXIT

block() {
  echo ""
  echo '```text'
  "$@"
  echo '```'
}

{
  echo "# Browse 1.6.1, the steps for your hands"
  echo ""
  echo "Two: start the dev server, and stop it at the end. Everything between is curl."
  block step_server
  block step_stop
} >"$STEPS"

say "Browse 1.6.1, one open read"
say "at $(git log -1 --oneline), $(date '+%Y-%m-%d %H:%M'), today $TODAY"
say "The steps for your hands are in $STEPS."
say ""

# 0. Where the walk starts; each of these ends the run when it fails
require "tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"
require "stack up" 0 "$(npx supabase status >/dev/null 2>&1; echo $?)"
require "dev server down before the reset" 000 "$(code "$APP/")"
require "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"
require "the one-open-read index" 1 "$(P "select count(*) from pg_indexes where indexname = 'occurrences_one_open'")"

by_hand step_server
require "dev server up" 200 "$(code "$APP/")"

require "you signed in" "$APP/nook" "$(sign_in "$EMAIL" "$JAR_A")"
require "a stranger signed in" "$APP/nook" "$(sign_in "$STRANGER" "$JAR_B")"
require "fixtures:load" 0 "$(npm run fixtures:load -- --user "$EMAIL" >/dev/null 2>&1; echo $?)"

tally "loaded:" 26 0 0
check "loaded: done" 26 "$(mine "select count(*) from occurrences o where MINE and o.status = 'done'")"
check "loaded: one created_at" 1 "$(mine "select count(distinct o.created_at) from occurrences o where MINE")"
check "loaded: journal_entries, everyone's" 0 "$(P 'select count(*) from journal_entries')"

T=$(P "select item from item_sources where source = 'manual' and key = 'tmnt-mirage-v1-1'")
C=$(P "select item from item_sources where source = 'manual' and key = 'carrie-1974'")
F=$(P "select item from item_sources where source = 'letterboxd' and key = '20ZQ'")
S=$(P "select item from item_sources where source = 'manual' and key = 'salems-lot-1975'")
EMPTY="Nothing logged yet. Log a read and the journal starts here."

# 1. TMNT #1's fixture read, as you and as the stranger
check "1. TMNT #1 as you" 200 "$(code -b "$JAR_A" "$APP/items/$T")"
PAGE=$(page "$JAR_A" "$T")
check "1. the heading" found "$(has ">1 read<" "$PAGE")"
check "1. one Done card" found "$(has ">Done<" "$PAGE")"
check "1. its stars" found "$(has 'aria-label="Unrated"' "$PAGE")"
check "1. no Started" missing "$(has "Started " "$PAGE")"
check "1. no Finished" missing "$(has "Finished " "$PAGE")"
check "1. Journal before On your shelves" yes "$(before 'id="journal"' 'id="shelves"' "$PAGE")"
check "1. TMNT #1 as the stranger" 200 "$(code -b "$JAR_B" "$APP/items/$T")"
check "1. the stranger sees no read" found "$(has "$EMPTY" "$(page "$JAR_B" "$T")")"

# 2. Four stars on the fixture read
TREAD=$(mine "select o.id from occurrences o where MINE and o.item = '$T'")
check "2. PATCH stars 4" 200 "$(call "$JAR_A" PATCH "/api/v1/occurrences/$TREAD" '{"stars":4}')"
check "2. its stars" 4 "$(field stars)"
PAGE=$(page "$JAR_A" "$T")
check "2. the card's stars" found "$(has "aria-label=\"$STAR 4\"" "$PAGE")"
check "2. the heading" found "$(has ">1 read $DOT last finished at $STAR 4<" "$PAGE")"
tally "2." 26 0 1

# 3. Carrie: nothing, then a done read with its first entry
check "3. Carrie empty" found "$(has "$EMPTY" "$(page "$JAR_A" "$C")")"
WEEKEND="Finished in a weekend. The epistolary pieces are the trick: the town is testifying before the thing has happened."
check "3. POST a read with an entry" 201 "$(call "$JAR_A" POST /api/v1/occurrences "{\"item\":\"$C\",\"status\":\"done\",\"startedOn\":\"2026-10-28\",\"finishedOn\":\"$TODAY\",\"stars\":4.5,\"entry\":{\"body\":\"$WEEKEND\",\"anchorKind\":\"page\",\"anchorValue\":\"112\"}}")"
R1=$(field id)
check "3. an entryId came back" yes "$([ "$(field entryId)" != "(none)" ] && echo yes || echo no)"
tally "3." 27 1 2
PAGE=$(page "$JAR_A" "$C")
check "3. the heading" found "$(has ">1 read $DOT last finished at $STAR 4.5<" "$PAGE")"
check "3. the dates" found "$(has ">28 October 2026 to $TODAY_LONG<" "$PAGE")"
check "3. the stars" found "$(has "aria-label=\"$STAR 4.5\"" "$PAGE")"
check "3. the pill" found "$(has ">p. 112<" "$PAGE")"
check "3. the entry" found "$(has "$WEEKEND" "$PAGE")"

# 4. A second entry, newest first
SHOWER="The shower scene lands harder knowing where it goes."
check "4. POST an entry" 201 "$(call "$JAR_A" POST "/api/v1/occurrences/$R1/entries" "{\"body\":\"$SHOWER\"}")"
tally "4." 27 2 2
check "4. the new entry first" yes "$(before "$SHOWER" "$WEEKEND" "$(page "$JAR_A" "$C")")"

# 5. A second read, open
check "5. POST a Reading" 201 "$(call "$JAR_A" POST /api/v1/occurrences "{\"item\":\"$C\",\"status\":\"in_progress\",\"startedOn\":\"$TODAY\"}")"
R2=$(field id)
tally "5." 28 2 2
PAGE=$(page "$JAR_A" "$C")
check "5. the heading" found "$(has ">2 reads $DOT last finished at $STAR 4.5 $DOT reading now<" "$PAGE")"
check "5. the Reading card first" yes "$(before ">Reading<" "28 October 2026 to" "$PAGE")"
check "5. its dates" found "$(has ">Started $TODAY_LONG<" "$PAGE")"

# 6. A12's first eight reds, each followed by what it must leave alone
check "red 1, a second Reading" 409 "$(call "$JAR_A" POST /api/v1/occurrences "{\"item\":\"$C\",\"status\":\"in_progress\",\"startedOn\":\"$TODAY\"}")"
check "red 1, its sentence" "You're already reading this. Finish or abandon that read first." "$(field error.message)"
check "red 1, open reads of Carrie" 1 "$(mine "select count(*) from occurrences o where MINE and o.item = '$C' and o.status = 'in_progress'")"

check "red 2, stars 4.3" 400 "$(call "$JAR_A" PATCH "/api/v1/occurrences/$R1" '{"stars":4.3}')"
check "red 2, at stars" "Stars go in half steps from 0.5 to 5." "$(field error.fields.stars)"
check "red 2, the read's stars" 4.5 "$(P "select stars from occurrences where id = '$R1'")"

check "red 3, Finished before Started" 400 "$(call "$JAR_A" POST /api/v1/occurrences "{\"item\":\"$F\",\"status\":\"done\",\"startedOn\":\"$TODAY\",\"finishedOn\":\"2026-10-28\"}")"
check "red 3, at finishedOn" "Finished can't be before Started." "$(field error.fields.finishedOn)"
check "red 3, reads" 28 "$(mine "select count(*) from occurrences o where MINE")"

check "red 4, a kind with no value" 400 "$(call "$JAR_A" POST "/api/v1/occurrences/$R1/entries" '{"body":"x","anchorKind":"page"}')"
check "red 4, at anchorValue" "Say where, or leave both out." "$(field error.fields.anchorValue)"
check "red 4, entries" 2 "$(mine "select count(*) from journal_entries j join occurrences o on o.id = j.occurrence where MINE")"

check "red 5, episode on a book" 400 "$(call "$JAR_A" POST "/api/v1/occurrences/$R1/entries" '{"body":"x","anchorKind":"episode","anchorValue":"S02E03"}')"
check "red 5, naming page and chapter" "A book takes page or chapter." "$(field error.fields.anchorKind)"
check "red 5, entries" 2 "$(mine "select count(*) from journal_entries j join occurrences o on o.id = j.occurrence where MINE")"

check "red 6, the stranger's PATCH" 404 "$(call "$JAR_B" PATCH "/api/v1/occurrences/$R1" '{"stars":1}')"
check "red 6, as not_found" not_found "$(field error.code)"
check "red 6, the stranger's DELETE" 404 "$(call "$JAR_B" DELETE "/api/v1/occurrences/$R1")"
check "red 6, the read and its stars" 4.5 "$(P "select stars from occurrences where id = '$R1'")"

check "red 7, the stranger's entry" 404 "$(call "$JAR_B" POST "/api/v1/occurrences/$R1/entries" '{"body":"mine"}')"
check "red 7, entries" 2 "$(mine "select count(*) from journal_entries j join occurrences o on o.id = j.occurrence where MINE")"

check "red 8, a read of Salem's Lot with an entry" 201 "$(call "$JAR_A" POST /api/v1/occurrences "{\"item\":\"$S\",\"status\":\"done\",\"stars\":5,\"entry\":{\"body\":\"Ben Mears comes home.\",\"anchorKind\":\"chapter\",\"anchorValue\":\"1\"}}")"
R3=$(field id)
tally "red 8, with one entry:" 29 3 3
check "red 8, a second entry" 201 "$(call "$JAR_A" POST "/api/v1/occurrences/$R3/entries" '{"body":"The Marsten House."}')"
tally "red 8, with two:" 29 4 3
check "red 8, DELETE the read" 204 "$(call "$JAR_A" DELETE "/api/v1/occurrences/$R3")"
check "red 8, its entries" 0 "$(P "select count(*) from journal_entries where occurrence = '$R3'")"
tally "red 8, after:" 28 2 2

check "the race: two Readings at once leave one (test:db)" 0 "$(npm run test:db -- tests/db/journal.test.ts -t 'at once' >/dev/null 2>&1; echo $?)"

# 7. The open read finished today
check "7. PATCH to Done, today" 200 "$(call "$JAR_A" PATCH "/api/v1/occurrences/$R2" "{\"status\":\"done\",\"finishedOn\":\"$TODAY\"}")"
PAGE=$(page "$JAR_A" "$C")
check "7. the heading" found "$(has ">2 reads<" "$PAGE")"
check "7. no reading now" missing "$(has "reading now" "$PAGE")"
check "7. no last finished at" missing "$(has "last finished at" "$PAGE")"
check "7. the same-day read shows its one date, first" yes "$(before ">$TODAY_LONG<" "28 October 2026 to" "$PAGE")"
check "7. open reads" 0 "$(mine "select count(*) from occurrences o where MINE and o.status = 'in_progress'")"

# 8. The count block
tally "after the walk:" 28 2 2
check "after the walk: open" 0 "$(mine "select count(*) from occurrences o where MINE and o.status = 'in_progress'")"
check "after the walk: entries not on your reads" 0 "$(mine "select count(*) from journal_entries j join occurrences o on o.id = j.occurrence where not (MINE)")"
check "after the walk: the starred reads" "4.0,4.5" "$(mine "select string_agg(o.stars::text, ',' order by o.stars) from occurrences o where MINE and o.stars is not null")"

# 9. Back to a clean database, so test:db starts from nothing
by_hand step_stop
require "dev server down" 000 "$(code "$APP/")"
check "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"

summary
[ "$failed" -eq 0 ]
