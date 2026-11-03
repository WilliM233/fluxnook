#!/usr/bin/env bash
# Browse 1.6.2, the sheet and the stars (#83): TMNT #1's star, Carrie (1974)
# logged through the sheet with its entries added, edited and deleted, a
# second read open and the 409 on the sheet, Edit to Done, Carrie (1976)
# watched, and the first read deleted with its two entries. The clicks are
# yours; after each, the script reads what they wrote and what the page
# shows. Git Bash, from a clean tree, with the local stack up and the dev
# server stopped. Run it as:
#   BROWSE_EMAIL=<your address> bash scripts/browse/1.6.2.sh
#
# Every check prints its name, what was expected, what came back, and pass or
# fail. A precondition that fails ends the run there with the summary. A step
# for your hands prints one action per line and waits for Enter. Every step
# is written to browse-results/1.6.2-steps.md before the first pause. The
# report is browse-results/1.6.2.txt.

set -u
cd "$(dirname "$0")/../.." || exit 1

APP=http://localhost:3000
MAILPIT=http://127.0.0.1:54324
REPORT=browse-results/1.6.2.txt
STEPS=browse-results/1.6.2-steps.md
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
by_hand() { # step function
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

page() { curl -s -b "$JAR" "$APP/items/$1"; }

# The Browse account's rows, so no other account's ever move a count.
mine() { P "$(printf '%s' "$1" | sed "s/MINE/o.owner = (select id from auth.users where email = '$EMAIL')/")"; }

tally() { # label, reads, entries, starred
  check "$1 reads" "$2" "$(mine "select count(*) from occurrences o where MINE")"
  check "$1 entries" "$3" "$(mine "select count(*) from journal_entries j join occurrences o on o.id = j.occurrence where MINE")"
  check "$1 starred" "$4" "$(mine "select count(*) from occurrences o where MINE and o.stars is not null")"
}

open_on() { mine "select count(*) from occurrences o where MINE and o.item = '$1' and o.status = 'in_progress'"; }

# ---- The steps for your hands. Each prints one action per line.

WEEKEND="Finished in a weekend. The epistolary pieces are the trick: the town is testifying before the thing has happened."
SHOWER="The shower scene lands harder knowing where it goes."

step_server() {
  echo "Step 1, by hand: the dev server"
  echo ""
  echo "In another terminal, start it:"
  echo "    npm run dev"
  echo ""
  echo "Wait for Ready."
}

step_tmnt() {
  echo "Step 2, by hand: TMNT #1's star"
  echo ""
  echo "In the browser, sign in at $APP with:"
  echo "    $EMAIL"
  echo "(the link is the newest mail in Mailpit, $MAILPIT)"
  echo ""
  echo "Open:"
  echo "    $APP/items/$T"
  echo "The Journal reads:"
  echo "    1 read"
  echo "One card: Done, no dates, five empty stars."
  echo ""
  echo "Click the right half of the fourth star."
  echo "Four stars fill. The heading reads:"
  echo "    1 read $DOT last finished at $STAR 4"
  echo "Reload. Four stars still."
}

step_log() {
  echo "Step 3, by hand: log a read of Carrie"
  echo ""
  echo "Open:"
  echo "    $APP/items/$C"
  echo "The Journal reads:"
  echo "    Nothing logged yet. Log a read and the journal starts here."
  echo ""
  echo "Click Log a read. The sheet:"
  echo "    Log a read of Carrie"
  echo "Done is pressed. Started is empty. Finished is today. No stars, no Clear."
  echo ""
  echo "Started: type"
  echo "    2026-10-28"
  echo "Click the left half of the fifth star. Beside it:"
  echo "    4.5"
  echo "and Clear."
  echo "The first entry: type"
  echo "    $WEEKEND"
  echo "Where in it: Page, and the place"
  echo "    112"
  echo "Click Log it. The sheet closes."
  echo ""
  echo "The card: Done, four and a half stars, the dates"
  echo "    28 October 2026 to $TODAY_LONG"
  echo "the entry dated today with the pill"
  echo "    p. 112"
  echo "The heading:"
  echo "    1 read $DOT last finished at $STAR 4.5"
}

step_add() {
  echo "Step 4, by hand: Add an entry"
  echo ""
  echo "On the card, click Add an entry. The sheet:"
  echo "    Add an entry"
  echo "Written reads now. Where in it is Page, with no place."
  echo ""
  echo "The entry: type"
  echo "    $SHOWER"
  echo "Click Save."
  echo ""
  echo "Two entries. The new one is first, with no pill."
}

step_throwaway() {
  echo "Step 5, by hand: an entry added, edited and deleted"
  echo ""
  echo "Click Add an entry. The entry:"
  echo "    A note to delete."
  echo "Where in it: Page, and the place"
  echo "    7"
  echo "Click Save. Three entries; the first has the pill"
  echo "    p. 7"
  echo ""
  echo "Click Edit on that entry. The sheet:"
  echo "    Edit entry"
  echo "with its text, Page and 7."
  echo "Change the text to:"
  echo "    A note to delete, edited."
  echo "Clear the 7. Click Save."
  echo "The first entry reads the new text, with no pill."
  echo ""
  echo "Click Delete on that entry. The confirm:"
  echo "    Delete this entry?"
  echo "Click Delete. Two entries; the shower one first."
}

step_reading() {
  echo "Step 6, by hand: a second read, open"
  echo ""
  echo "Click Log a read. Click Reading."
  echo "Finished empties and greys."
  echo "Started: today. No stars. Click Log it."
  echo ""
  echo "A second card at the top:"
  echo "    Reading"
  echo "    Started $TODAY_LONG"
  echo "with five empty stars. The heading:"
  echo "    2 reads $DOT last finished at $STAR 4.5 $DOT reading now"
}

step_conflict() {
  echo "Step 7, by hand: the 409 on the sheet"
  echo ""
  echo "Click Log a read. Click Reading. Click Log it."
  echo "The sheet stays open, with the line:"
  echo "    You're already reading this. Finish or abandon that read first."
  echo ""
  echo "Click Cancel."
}

step_edit() {
  echo "Step 8, by hand: Edit to Done"
  echo ""
  echo "On the Reading card, click Edit. The sheet:"
  echo "    Edit this read"
  echo "Reading is pressed; Started is today; Finished is empty and greyed; no stars."
  echo ""
  echo "Click Done. Finished wakes with today. Click Save."
  echo ""
  echo "Both cards read Done. The top one's dates:"
  echo "    $TODAY_LONG"
  echo "The lower one's:"
  echo "    28 October 2026 to $TODAY_LONG"
  echo "with its two entries. The heading:"
  echo "    2 reads"
}

step_watch() {
  echo "Step 9, by hand: Carrie (1976), a watch"
  echo ""
  echo "Open:"
  echo "    $APP/items/$F"
  echo "The button reads Log a watch, and the Journal:"
  echo "    Nothing logged yet. Log a watch and the journal starts here."
  echo ""
  echo "Click Log a watch. The sheet:"
  echo "    Log a watch of Carrie"
  echo "Where it stands: Watching, Done, Abandoned; Done pressed."
  echo "No Where in it under the entry."
  echo ""
  echo "Click the fourth star, whole. Beside it:"
  echo "    4"
  echo "Press the left arrow once. Beside it:"
  echo "    3.5"
  echo "Click Log it."
  echo ""
  echo "One card: Done, $TODAY_LONG, three and a half stars. The heading:"
  echo "    1 watch $DOT last finished at $STAR 3.5"
}

step_delete() {
  echo "Step 10, by hand: delete the first read of Carrie"
  echo ""
  echo "Open:"
  echo "    $APP/items/$C"
  echo "On the lower card (28 October 2026 to $TODAY_LONG, two entries), click Delete."
  echo "The confirm:"
  echo "    Delete this read and its 2 entries?"
  echo "Click Delete."
  echo ""
  echo "One card: Done, $TODAY_LONG, empty stars. The heading:"
  echo "    1 read"
}

step_stop() {
  echo "Step 11, by hand: stop the dev server"
  echo ""
  echo "Ctrl+C in its terminal. The reset that follows ends every session."
}

EMAIL=${BROWSE_EMAIL:-}
if [ -z "$EMAIL" ]; then
  printf 'The address to sign in with: '
  read -r EMAIL
fi
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

block() {
  echo ""
  echo '```text'
  "$@"
  echo '```'
}

say "Browse 1.6.2, the sheet and the stars"
say "at $(git log -1 --oneline), $(date '+%Y-%m-%d %H:%M'), today $TODAY"
say "The steps for your hands are in $STEPS once the fixtures load."
say ""

# 0. Where the walk starts; each of these ends the run when it fails
require "tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"
require "stack up" 0 "$(npx supabase status >/dev/null 2>&1; echo $?)"
require "dev server down before the reset" 000 "$(code "$APP/")"
require "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"

# The steps name the works by id, which the load makes, and the load needs
# your account, which a sign-in makes. GoTrue makes it here without the dev
# server, by sending you a link, so every step is written before the first
# pause. The link it sends is spare; sign in from the one you ask for.
API=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '\r')
KEY=$(grep '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' .env.local | cut -d= -f2- | tr -d '\r')
require "your account made" 200 "$(printf '{"email":"%s","create_user":true}' "$EMAIL" |
  curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/v1/otp" \
    -H "apikey: $KEY" -H 'content-type: application/json' --data-binary @-)"
require "your account" 1 "$(P "select count(*) from auth.users where email = '$EMAIL'")"
require "fixtures:load" 0 "$(npm run fixtures:load -- --user "$EMAIL" >/dev/null 2>&1; echo $?)"

T=$(P "select item from item_sources where source = 'manual' and key = 'tmnt-mirage-v1-1'")
C=$(P "select item from item_sources where source = 'manual' and key = 'carrie-1974'")
F=$(P "select item from item_sources where source = 'letterboxd' and key = '20ZQ'")

{
  echo "# Browse 1.6.2, the steps for your hands"
  echo ""
  echo "Eleven: the dev server's start, nine in the browser, its stop."
  for step in step_server step_tmnt step_log step_add step_throwaway \
    step_reading step_conflict step_edit step_watch step_delete step_stop; do
    block "$step"
  done
} >"$STEPS"

tally "loaded:" 26 0 0
check "loaded: journal_entries, everyone's" 0 "$(P 'select count(*) from journal_entries')"

by_hand step_server
require "dev server up" 200 "$(code "$APP/")"
require "the script's own session" "$APP/nook" "$(sign_in "$EMAIL" "$JAR")"

# 2. TMNT #1's star
by_hand step_tmnt
check "2. TMNT #1's stars" 4.0 "$(mine "select o.stars from occurrences o where MINE and o.item = '$T'")"
PAGE=$(page "$T")
check "2. the card's stars" found "$(has "aria-label=\"$STAR 4\"" "$PAGE")"
check "2. the heading" found "$(has ">1 read $DOT last finished at $STAR 4<" "$PAGE")"
tally "2." 26 0 1

# 3. Carrie logged through the sheet, with its first entry
by_hand step_log
tally "3." 27 1 2
check "3. Started" 2026-10-28 "$(mine "select o.started_on from occurrences o where MINE and o.item = '$C'")"
check "3. Finished" "$TODAY" "$(mine "select o.finished_on from occurrences o where MINE and o.item = '$C'")"
PAGE=$(page "$C")
check "3. the heading" found "$(has ">1 read $DOT last finished at $STAR 4.5<" "$PAGE")"
check "3. the dates" found "$(has ">28 October 2026 to $TODAY_LONG<" "$PAGE")"
check "3. the stars" found "$(has "aria-label=\"$STAR 4.5\"" "$PAGE")"
check "3. the pill" found "$(has ">p. 112<" "$PAGE")"
check "3. the entry" found "$(has "$WEEKEND" "$PAGE")"

# 4. A second entry, newest first
by_hand step_add
tally "4." 27 2 2
check "4. the new entry first" yes "$(before "$SHOWER" "$WEEKEND" "$(page "$C")")"
check "4. no pill on it" null "$(mine "select coalesce(j.anchor_kind, 'null') from journal_entries j join occurrences o on o.id = j.occurrence where MINE and j.body = '$SHOWER'")"

# 5. An entry added, edited and deleted
by_hand step_throwaway
tally "5." 27 2 2
check "5. the note is gone" missing "$(has "A note to delete" "$(page "$C")")"
check "5. Carrie's entries, newest first" "$SHOWER|$WEEKEND" "$(mine "select string_agg(j.body, '|' order by j.written_at desc) from journal_entries j join occurrences o on o.id = j.occurrence where MINE and o.item = '$C'")"

# 6. A second read, open; Finished sent as null (L, 1.6.1 sign-off)
by_hand step_reading
tally "6." 28 2 2
check "6. one open read of Carrie" 1 "$(open_on "$C")"
check "6. its Finished, null" null "$(mine "select coalesce(o.finished_on::text, 'null') from occurrences o where MINE and o.item = '$C' and o.status = 'in_progress'")"
check "6. its Started" "$TODAY" "$(mine "select o.started_on from occurrences o where MINE and o.item = '$C' and o.status = 'in_progress'")"
PAGE=$(page "$C")
check "6. the heading" found "$(has ">2 reads $DOT last finished at $STAR 4.5 $DOT reading now<" "$PAGE")"
check "6. the Reading card first" yes "$(before ">Reading<" "28 October 2026 to" "$PAGE")"
check "6. its dates" found "$(has ">Started $TODAY_LONG<" "$PAGE")"

# 7. The 409 on the sheet wrote nothing
by_hand step_conflict
tally "7." 28 2 2
check "7. still one open read of Carrie" 1 "$(open_on "$C")"

# 8. Edit to Done
by_hand step_edit
check "8. open reads" 0 "$(mine "select count(*) from occurrences o where MINE and o.status = 'in_progress'")"
PAGE=$(page "$C")
check "8. the heading" found "$(has ">2 reads<" "$PAGE")"
check "8. no reading now" missing "$(has "reading now" "$PAGE")"
check "8. no last finished at" missing "$(has "last finished at" "$PAGE")"
check "8. the same-day read first, one date" yes "$(before ">$TODAY_LONG<" "28 October 2026 to" "$PAGE")"
tally "8." 28 2 2

# 9. Carrie (1976), a watch
by_hand step_watch
tally "9." 29 2 3
check "9. its stars" 3.5 "$(mine "select o.stars from occurrences o where MINE and o.item = '$F'")"
PAGE=$(page "$F")
check "9. the button" found "$(has ">Log a watch<" "$PAGE")"
check "9. the heading" found "$(has ">1 watch $DOT last finished at $STAR 3.5<" "$PAGE")"
check "9. the card's stars" found "$(has "aria-label=\"$STAR 3.5\"" "$PAGE")"

# 10. The first read deleted, its two entries with it
by_hand step_delete
tally "10." 28 0 2
PAGE=$(page "$C")
check "10. the heading" found "$(has ">1 read<" "$PAGE")"
check "10. no last finished at" missing "$(has "last finished at" "$PAGE")"
check "10. the card unrated" found "$(has 'aria-label="Unrated"' "$PAGE")"
check "10. the deleted read's dates gone" missing "$(has "28 October 2026" "$PAGE")"
check "10. journal_entries, everyone's" 0 "$(P 'select count(*) from journal_entries')"

# The count block
tally "after the walk:" 28 0 2
check "after the walk: open" 0 "$(mine "select count(*) from occurrences o where MINE and o.status = 'in_progress'")"
check "after the walk: the starred reads" "3.5,4.0" "$(mine "select string_agg(o.stars::text, ',' order by o.stars) from occurrences o where MINE and o.stars is not null")"
check "after the walk: shelf entries done" 0 "$(P "select count(*) from shelf_entries where status = 'done'")"
check "after the walk: entries not on your reads" 0 "$(mine "select count(*) from journal_entries j join occurrences o on o.id = j.occurrence where not (MINE)")"

# 11. Back to a clean database, so test:db starts from nothing
by_hand step_stop
require "dev server down" 000 "$(code "$APP/")"
check "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"

summary
[ "$failed" -eq 0 ]
