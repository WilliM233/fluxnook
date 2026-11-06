#!/usr/bin/env bash
# Browse 1.6.3, the journal and the shelf (#84): the chapter's exit Browse,
# one consolidated pass (L, 2026-11-03). The hands touch each feature once:
# TMNT #1's fixture read and a star on its card; Carrie (1974) logged with a
# first entry and stars, an entry added, a second read open, the 409 on the
# sheet, Edit to Done; the shelf's star line, Done's offer once with Log and
# once with Not now; the Journal page with its Older link; an entry edited
# and one deleted there; a read deleted with its entries. The script posts
# what nothing needs to feel (Carrie (1976)'s watch, 48 filler entries for
# the Older link) and runs A12's nine reds. Git Bash, from a clean tree,
# with the local stack up and the dev server stopped. Run it as:
#   BROWSE_EMAIL=<your address> bash scripts/browse/1.6.3.sh
#
# Every check prints its name, what was expected, what came back, and pass or
# fail. A precondition that fails ends the run there with the summary. A step
# for your hands prints one action per line and waits for Enter. Every step
# is written to browse-results/1.6.3-steps.md before the first pause. The
# report is browse-results/1.6.3.txt.

set -u
cd "$(dirname "$0")/../.." || exit 1

APP=http://localhost:3000
MAILPIT=http://127.0.0.1:54324
REPORT=browse-results/1.6.3.txt
STEPS=browse-results/1.6.3-steps.md
# A middle dot and a star, as bytes: a literal one in an argument to a
# Windows program reaches it in the console's code page, not UTF-8 (1.5.1).
DOT=$(printf '\302\267')
STAR=$(printf '\342\230\205')
TODAY=$(date +%F)
TODAY_LONG=$(date '+%-d %B %Y')
TODAY_SHORT=$(date '+%-d %B')

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

measured() { say "$1: measured $2 (not asserted)"; }

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

# A page's text with the tags taken out, for a line whose star is its own
# span (the shelf's line, a Journal row's state): "11 works · ★ 4.5 from 1
# rated" is three nodes in the HTML and one line to a reader.
text() {
  sed -e 's/<[^>]*>//g' -e "s/&#x27;/'/g" -e 's/&quot;/"/g' -e 's/&amp;/\&/g' <<<"$1"
}

# Whether the first of two lines comes first on the page, by byte offset.
before() { # first, second, page
  local a b
  a=$(grep -b -o -m1 -F -- "$1" <<<"$3" | head -1 | cut -d: -f1)
  b=$(grep -b -o -m1 -F -- "$2" <<<"$3" | head -1 | cut -d: -f1)
  [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ] && echo yes || echo no
}

# How many rendered Journal rows a page holds: the attribute is in the HTML
# only, never in the payload, so the count is the rows.
rows_on() { grep -o 'data-testid="journal-row"' <<<"$1" | wc -l | tr -d ' '; }

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

get() { curl -s -b "$JAR_A" "$APP$1"; }
item() { get "/items/$1"; }
shelf() { get "/shelves/$1"; }

# The Browse account's rows, so no other account's ever move a count.
mine() { P "$(printf '%s' "$1" | sed "s/MINE/o.owner = (select id from auth.users where email = '$EMAIL')/")"; }

tally() { # label, reads, entries, starred
  check "$1 reads" "$2" "$(mine "select count(*) from occurrences o where MINE")"
  check "$1 entries" "$3" "$(mine "select count(*) from journal_entries j join occurrences o on o.id = j.occurrence where MINE")"
  check "$1 starred" "$4" "$(mine "select count(*) from occurrences o where MINE and o.stars is not null")"
}

done_count() { P "select count(*) from shelf_entries where status = 'done'"; }
open_on() { mine "select count(*) from occurrences o where MINE and o.item = '$1' and o.status = 'in_progress'"; }
entries_on() { mine "select count(*) from journal_entries j join occurrences o on o.id = j.occurrence where MINE and o.item = '$1'"; }

# ---- The steps for your hands. Each prints one action per line.

WEEKEND="Finished in a weekend. The epistolary pieces are the trick: the town is testifying before the thing has happened."
SHOWER="The shower scene lands harder knowing where it goes."
CHORUS=" King writes the girls as a chorus, not as villains, and that is the mercy of the book."
BEN="Ben Mears comes home."

step_server() {
  echo "Step 1, by hand: the dev server"
  echo ""
  echo "In another terminal, start it:"
  echo "    npm run dev"
  echo ""
  echo "Wait for Ready."
}

step_tmnt() {
  echo "Step 2, by hand: TMNT #1's fixture read, and a star"
  echo ""
  echo "In the browser, sign in at $APP with:"
  echo "    $EMAIL"
  echo "(the link is the newest mail in Mailpit, $MAILPIT)"
  echo ""
  echo "The header reads Search, Nook, Journal."
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
  echo "Step 3, by hand: log a read of Carrie, with a first entry"
  echo ""
  echo "Open:"
  echo "    $APP/items/$C"
  echo "The Journal reads:"
  echo "    Nothing logged yet. Log a read and the journal starts here."
  echo ""
  echo "Click Log a read. The sheet:"
  echo "    Log a read of Carrie"
  echo "Done is pressed. Finished is today."
  echo ""
  echo "Started: type"
  echo "    2026-10-28"
  echo "Click the left half of the fifth star. Beside it:"
  echo "    4.5"
  echo "The first entry: type"
  echo "    $WEEKEND"
  echo "Where in it: Page, and the place"
  echo "    112"
  echo "Click Log it. The sheet closes."
  echo ""
  echo "The card: Done, four and a half stars, the dates"
  echo "    28 October 2026 to $TODAY_LONG"
  echo "the entry with the pill"
  echo "    p. 112"
  echo "The heading:"
  echo "    1 read $DOT last finished at $STAR 4.5"
}

step_add() {
  echo "Step 4, by hand: add an entry"
  echo ""
  echo "On the card, click Add an entry. The entry: type"
  echo "    $SHOWER"
  echo "Leave the place empty. Click Save."
  echo ""
  echo "Two entries. The new one is first, with no pill."
}

step_reading() {
  echo "Step 5, by hand: a second read, open"
  echo ""
  echo "Click Log a read. Click Reading."
  echo "Finished empties and greys."
  echo "Started: today. No stars. Click Log it."
  echo ""
  echo "A second card at the top:"
  echo "    Reading"
  echo "The heading:"
  echo "    2 reads $DOT last finished at $STAR 4.5 $DOT reading now"
}

step_conflict() {
  echo "Step 6, by hand: the 409 on the sheet"
  echo ""
  echo "Click Log a read. Click Reading. Click Log it."
  echo "The sheet stays open, with the line:"
  echo "    You're already reading this. Finish or abandon that read first."
  echo ""
  echo "Click Cancel."
}

step_edit() {
  echo "Step 7, by hand: edit the open read to Done"
  echo ""
  echo "On the Reading card, click Edit. The sheet:"
  echo "    Edit this read"
  echo "Click Done. Finished wakes with today. Click Save."
  echo ""
  echo "Both cards read Done. The top one, still first, has one date:"
  echo "    $TODAY_LONG"
  echo "The heading:"
  echo "    2 reads"
}

step_offer() {
  echo "Step 8, by hand: the shelf's stars, and Done's offer, Log"
  echo ""
  echo "Open:"
  echo "    $APP/shelves/$K"
  echo "The line under the name:"
  echo "    11 works $DOT $STAR 4.5 from 1 rated"
  echo "Row 1, Carrie, after its second line:"
  echo "    $STAR 4.5"
  echo "    read twice"
  echo ""
  echo "On row 2, Salem's Lot, click Done."
  echo "Under its control, where Remove was:"
  echo "    Read it?"
  echo "    Log a read"
  echo "    Not now"
  echo ""
  echo "Click Log a read. The sheet:"
  echo "    Log a read of Salem's Lot"
  echo "Done is pressed. Finished is today."
  echo "Click the right half of the fifth star. Beside it:"
  echo "    5"
  echo "The first entry: type"
  echo "    $BEN"
  echo "Where in it: Chapter, and the place"
  echo "    1"
  echo "Click Log it. The sheet closes."
  echo ""
  echo "Row 2 prints:"
  echo "    $STAR 5"
  echo "Remove is back under its control. The line:"
  echo "    11 works $DOT 1 done $DOT $STAR 4.8 from 2 rated"
}

step_not_now() {
  echo "Step 9, by hand: Done's offer, Not now"
  echo ""
  echo "On row 3, The Shining, click Done. The offer shows."
  echo "Click Not now. Remove is back."
  echo ""
  echo "The line:"
  echo "    11 works $DOT 2 done $DOT $STAR 4.8 from 2 rated"
}

step_journal() {
  echo "Step 10, by hand: the Journal page, and Older"
  echo ""
  echo "Click Journal in the header. The line under the title:"
  echo "    51 entries across 2 works, newest first."
  echo ""
  echo "Under today's label ($TODAY_LONG), three rows:"
  echo "    Salem's Lot, with the pill Ch. 1 and the state"
  echo "        Done, $TODAY_SHORT $DOT $STAR 5"
  echo "    Carrie, the shower entry, then the p. 112 entry, each"
  echo "        Done, $TODAY_SHORT $DOT $STAR 4.5"
  echo "Each title is a link to its page."
  echo ""
  echo "Below, a label per day over the filler:"
  echo "    9 March 2019"
  echo "    ...down to..."
  echo "    26 February 2019"
  echo "Four rows a day, each the time it was written:"
  for t in 18 17 16 15; do
    echo "    $(date -d "2019-03-09T$t:00:00Z" +%H:%M)"
  done
  echo "50 rows in all. At the foot:"
  echo "    Older entries"
  echo "    50 a page, by date written."
  echo ""
  echo "Click Older entries. The address ends:"
  echo "    ?before=2019-02-26T16:00:00.000000Z,<filler 47's id, printed above>"
  echo "One row: Filler 48 of 48, under 26 February 2019. No Older entries."
}

step_journal_edit() {
  echo "Step 11, by hand: edit an entry and delete one, on the Journal"
  echo ""
  echo "Click Journal in the header again."
  echo ""
  echo "On the shower entry's row, click Edit. The sheet:"
  echo "    Edit entry"
  echo "At the end of the text, add:"
  echo "   $CHORUS"
  echo "Where in it: Page, and the place"
  echo "    24"
  echo "Click Save. The row reads both sentences, the pill"
  echo "    p. 24"
  echo "and sits where it was."
  echo ""
  echo "On Salem's Lot's row, click Delete. The confirm:"
  echo "    Delete this entry?"
  echo "Click Delete. The line:"
  echo "    50 entries across 1 work, newest first."
}

step_delete() {
  echo "Step 12, by hand: delete Carrie's first read and its entries"
  echo ""
  echo "Open:"
  echo "    $APP/items/$C"
  echo "On the lower card (28 October 2026 to $TODAY_LONG), click Delete."
  echo "The confirm:"
  echo "    Delete this read and its 50 entries?"
  echo "Click Delete."
  echo ""
  echo "One card: Done, $TODAY_LONG, empty stars. The heading:"
  echo "    1 read"
  echo "The Journal page:"
  echo "    Nothing written yet. Open a work, log a read or a watch, and write the first line."
}

step_stop() {
  echo "Step 13, by hand: stop the dev server"
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

say "Browse 1.6.3, the journal and the shelf (the chapter's exit)"
say "at $(git log -1 --oneline), $(date '+%Y-%m-%d %H:%M'), today $TODAY"
say "The steps for your hands are in $STEPS once the fixtures load."
say ""

# 0. Where the walk starts; each of these ends the run when it fails
require "tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"
require "stack up" 0 "$(npx supabase status >/dev/null 2>&1; echo $?)"
require "dev server down before the reset" 000 "$(code "$APP/")"
require "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"

# The steps name the works and shelves by id, which the load makes, and the
# load needs your account, which a sign-in makes. GoTrue makes it here
# without the dev server, by sending you a link, so every step is written
# before the first pause (1.6.2 D9). The link it sends is spare; sign in
# from the one you ask for.
API=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '\r')
KEY=$(grep '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' .env.local | cut -d= -f2- | tr -d '\r')
require "your account made" 200 "$(printf '{"email":"%s","create_user":true}' "$EMAIL" |
  curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/v1/otp" \
    -H "apikey: $KEY" -H 'content-type: application/json' --data-binary @-)"
require "your account" 1 "$(P "select count(*) from auth.users where email = '$EMAIL'")"
require "fixtures:load" 0 "$(npm run fixtures:load -- --user "$EMAIL" >/dev/null 2>&1; echo $?)"

work() { P "select item from item_sources where source = '$1' and key = '$2'"; }
T=$(work manual tmnt-mirage-v1-1)
C=$(work manual carrie-1974)
F=$(work letterboxd 20ZQ)
S=$(work manual salems-lot-1975)
H=$(work manual the-shining-1977)
X=$(work manual the-stand-1978)
shelf_named() { P "select s.id from shelves s join auth.users u on u.id = s.owner where u.email = '$EMAIL' and s.name = '$1'"; }
K=$(shelf_named "Stephen King, publication order")
W=$(shelf_named "Stephen King Watch List")
M=$(shelf_named "TMNT, the Mirage run")

{
  echo "# Browse 1.6.3, the steps for your hands"
  echo ""
  echo "Thirteen: the dev server's start, eleven in the browser, its stop."
  for step in step_server step_tmnt step_log step_add step_reading \
    step_conflict step_edit step_offer step_not_now step_journal \
    step_journal_edit step_delete step_stop; do
    block "$step"
  done
} >"$STEPS"

tally "loaded:" 26 0 0
check "loaded: journal_entries, everyone's" 0 "$(P 'select count(*) from journal_entries')"
check "loaded: shelf entries done" 0 "$(done_count)"

by_hand step_server
require "dev server up" 200 "$(code "$APP/")"
require "the script's own session" "$APP/nook" "$(sign_in "$EMAIL" "$JAR_A")"
require "a stranger's session" "$APP/nook" "$(sign_in "$STRANGER" "$JAR_B")"

# The fresh load as the pages read it (A11): no star part, an empty journal,
# Journal in the header.
TMNT_PAGE=$(shelf "$M")
check "loaded: the TMNT line" found "$(has "326 works $DOT 14 sections" "$(text "$TMNT_PAGE")")"
check "loaded: no star part on it" missing "$(has "rated" "$(text "$TMNT_PAGE")")"
JOURNAL=$(get /journal)
check "loaded: the journal's empty sentence" found "$(has ">Nothing written yet. Open a work, log a read or a watch, and write the first line.<" "$JOURNAL")"
check "loaded: the journal's rows" 0 "$(rows_on "$JOURNAL")"
check "loaded: Journal in the header" found "$(has 'href="/journal"' "$(get /nook)")"

# 2. TMNT #1's star
by_hand step_tmnt
check "2. TMNT #1's stars" 4.0 "$(mine "select o.stars from occurrences o where MINE and o.item = '$T'")"
PAGE=$(item "$T")
check "2. the card's stars" found "$(has "aria-label=\"$STAR 4\"" "$PAGE")"
check "2. the heading" found "$(has ">1 read $DOT last finished at $STAR 4<" "$PAGE")"
tally "2." 26 0 1

# 3. Carrie logged through the sheet, with its first entry
by_hand step_log
tally "3." 27 1 2
R1=$(mine "select o.id from occurrences o where MINE and o.item = '$C'")
check "3. Started" 2026-10-28 "$(P "select started_on from occurrences where id = '$R1'")"
check "3. Finished" "$TODAY" "$(P "select finished_on from occurrences where id = '$R1'")"
check "3. stars" 4.5 "$(P "select stars from occurrences where id = '$R1'")"
PAGE=$(item "$C")
check "3. the heading" found "$(has ">1 read $DOT last finished at $STAR 4.5<" "$PAGE")"
check "3. the dates" found "$(has ">28 October 2026 to $TODAY_LONG<" "$PAGE")"
check "3. the card's stars" found "$(has "aria-label=\"$STAR 4.5\"" "$PAGE")"
check "3. the pill" found "$(has ">p. 112<" "$PAGE")"
check "3. the entry" found "$(has "$WEEKEND" "$PAGE")"

# 4. A second entry, newest first
by_hand step_add
tally "4." 27 2 2
check "4. the new entry first" yes "$(before "$SHOWER" "$WEEKEND" "$(item "$C")")"
check "4. no pill on it" null "$(P "select coalesce(anchor_kind, 'null') from journal_entries where occurrence = '$R1' and body = '$SHOWER'")"
E_SHOWER=$(P "select id from journal_entries where occurrence = '$R1' and body = '$SHOWER'")
SHOWER_AT=$(P "select written_at from journal_entries where id = '$E_SHOWER'")

# 5. A second read, open
by_hand step_reading
tally "5." 28 2 2
check "5. one open read of Carrie" 1 "$(open_on "$C")"
check "5. its Finished, null" null "$(mine "select coalesce(o.finished_on::text, 'null') from occurrences o where MINE and o.item = '$C' and o.status = 'in_progress'")"
check "5. its Started" "$TODAY" "$(mine "select o.started_on from occurrences o where MINE and o.item = '$C' and o.status = 'in_progress'")"
PAGE=$(item "$C")
check "5. the heading" found "$(has ">2 reads $DOT last finished at $STAR 4.5 $DOT reading now<" "$PAGE")"
check "5. the Reading card first" yes "$(before ">Reading<" "28 October 2026 to" "$PAGE")"
check "5. its dates" found "$(has ">Started $TODAY_LONG<" "$PAGE")"

# 6. The 409 on the sheet wrote nothing
by_hand step_conflict
tally "6." 28 2 2
check "6. still one open read of Carrie" 1 "$(open_on "$C")"

# 7. Edit to Done
by_hand step_edit
check "7. open reads" 0 "$(mine "select count(*) from occurrences o where MINE and o.status = 'in_progress'")"
PAGE=$(item "$C")
check "7. the heading" found "$(has ">2 reads<" "$PAGE")"
check "7. no reading now" missing "$(has "reading now" "$PAGE")"
check "7. no last finished at" missing "$(has "last finished at" "$PAGE")"
check "7. the same-day read first, one date" yes "$(before ">$TODAY_LONG<" "28 October 2026 to" "$PAGE")"
tally "7." 28 2 2

# 8 (the script's). Carrie (1976), a watch posted through the route
check "8. Carrie (1976)'s watch" 201 "$(call "$JAR_A" POST /api/v1/occurrences "{\"item\":\"$F\",\"status\":\"done\",\"finishedOn\":\"$TODAY\",\"stars\":3.5}")"
tally "8." 29 2 3
PAGE=$(item "$F")
check "8. its heading" found "$(has ">1 watch $DOT last finished at $STAR 3.5<" "$PAGE")"
check "8. its button" found "$(has ">Log a watch<" "$PAGE")"

# 9. The shelf's stars, Done's offer, Log
check "9. before: the publication-order line" found "$(has "11 works $DOT $STAR 4.5 from 1 rated" "$(text "$(shelf "$K")")")"
by_hand step_offer
tally "9." 30 3 4
check "9. shelf entries done" 1 "$(done_count)"
R3=$(mine "select o.id from occurrences o where MINE and o.item = '$S'")
check "9. Salem's Lot's read" "done,5.0,$TODAY,null" "$(P "select status || ',' || stars || ',' || finished_on || ',' || coalesce(started_on::text, 'null') from occurrences where id = '$R3'")"
check "9. its entry" "chapter,1,$BEN" "$(P "select anchor_kind || ',' || anchor_value || ',' || body from journal_entries where occurrence = '$R3'")"
KING=$(shelf "$K")
check "9. the line" found "$(has "11 works $DOT 1 done $DOT $STAR 4.8 from 2 rated" "$(text "$KING")")"
check "9. Salem's Lot's row" found "$(has ">$STAR 5<" "$KING")"
check "9. Carrie's row" found "$(has ">$STAR 4.5<" "$KING")"
check "9. read twice" found "$(has ">read twice<" "$KING")"

# 10. Done's offer, Not now: the status stands, no read
by_hand step_not_now
check "10. shelf entries done" 2 "$(done_count)"
check "10. The Shining's reads" 0 "$(mine "select count(*) from occurrences o where MINE and o.item = '$H'")"
check "10. the line" found "$(has "11 works $DOT 2 done $DOT $STAR 4.8 from 2 rated" "$(text "$(shelf "$K")")")"
check "10. The Shining's page" found "$(has ">Nothing logged yet. Log a read and the journal starts here.<" "$(item "$H")")"
tally "10." 30 3 4

# 11 (the script's). The other two shelves' stars, then the filler
WATCH=$(shelf "$W")
check "11. the Watch List line" found "$(has "61 works $DOT $STAR 3.5 from 1 rated" "$(text "$WATCH")")"
check "11. Carrie (1976)'s row" found "$(has ">$STAR 3.5<" "$WATCH")"
TMNT_PAGE=$(shelf "$M")
check "11. the TMNT line" found "$(has "326 works $DOT 14 sections $DOT $STAR 4 from 1 rated" "$(text "$TMNT_PAGE")")"
check "11. TMNT #1's row" found "$(has ">$STAR 4<" "$TMNT_PAGE")"
N=$(P "select count(*) from shelf_entries where section = (select section from shelf_entries where shelf = '$M' and item = '$T')")
check "11. TMNT #1's section line" found "$(has "$N works $DOT $STAR 4 from 1 rated" "$(text "$TMNT_PAGE")")"
measured "11. TMNT page, seconds on a warm hit" "$(curl -s -o /dev/null -w '%{time_total}' -b "$JAR_A" "$APP/shelves/$M")"

# 48 entries on Carrie's first read, four a day from 9 March 2019 back to
# 26 February, so the Journal page has an Older link.
posted=0
for i in $(seq 1 48); do
  day=$(date -u -d "2019-03-09 -$(((i - 1) / 4)) days" +%F)
  hour=$((18 - (i - 1) % 4))
  status=$(call "$JAR_A" POST "/api/v1/occurrences/$R1/entries" "{\"body\":\"Filler $i of 48, here so the page has an Older link.\",\"writtenAt\":\"${day}T${hour}:00:00Z\"}")
  [ "$status" = 201 ] && posted=$((posted + 1))
done
check "11. filler entries answered 201" 48 "$posted"
tally "11." 30 51 4
E47=$(P "select id from journal_entries where occurrence = '$R1' and written_at = '2019-02-26T16:00:00Z'")
CURSOR="2019-02-26T16:00:00.000000Z,$E47"
JOURNAL=$(get /journal)
check "11. the lede" found "$(has ">51 entries across 2 works, newest first." "$JOURNAL")"
check "11. rows on the first page" 50 "$(rows_on "$JOURNAL")"
check "11. the Older link" found "$(grep -qE "href=\"/journal\?before=2019-02-26T16:00:00\.000000Z(,|%2C)$E47\"" <<<"$JOURNAL" && echo found || echo missing)"
check "11. Salem's Lot's entry first" yes "$(before ">Ch. 1<" "$SHOWER" "$JOURNAL")"
check "11. then the shower entry, then p. 112" yes "$(before "$SHOWER" ">p. 112<" "$JOURNAL")"
check "11. Salem's Lot's state" found "$(has "Done, $TODAY_SHORT $DOT $STAR 5" "$(text "$JOURNAL")")"
check "11. today's label" found "$(has ">$TODAY_LONG<" "$JOURNAL")"
check "11. the filler's first day" found "$(has ">9 March 2019<" "$JOURNAL")"
check "11. the filler's last day" found "$(has ">26 February 2019<" "$JOURNAL")"
check "11. the titles link their pages" found "$(has "href=\"/items/$S\"" "$JOURNAL")"
OLDER=$(get "/journal?before=$CURSOR")
check "11. the second page" 200 "$(code -b "$JAR_A" "$APP/journal?before=$CURSOR")"
check "11. its rows" 1 "$(rows_on "$OLDER")"
check "11. its row" found "$(has "Filler 48 of 48" "$OLDER")"
check "11. no Older on it" missing "$(has ">Older entries<" "$OLDER")"
check "11. a before that isn't a cursor" 404 "$(code -b "$JAR_A" "$APP/journal?before=yesterday")"
check "11. a cursor with no uuid" 404 "$(code -b "$JAR_A" "$APP/journal?before=2019-02-26T16:00:00.000000Z,not-a-uuid")"

# 12. The Journal page by hand
say ""
say "Step 10's Older address, measured: $APP/journal?before=$CURSOR"
by_hand step_journal
tally "12." 30 51 4

# 13. An entry edited and one deleted, on the Journal
by_hand step_journal_edit
tally "13." 30 50 4
check "13. the shower entry's text" "$SHOWER$CHORUS" "$(P "select body from journal_entries where id = '$E_SHOWER'")"
check "13. its place" "page,24" "$(P "select anchor_kind || ',' || anchor_value from journal_entries where id = '$E_SHOWER'")"
check "13. its time, untouched" "$SHOWER_AT" "$(P "select written_at from journal_entries where id = '$E_SHOWER'")"
check "13. Salem's Lot's entries" 0 "$(entries_on "$S")"
JOURNAL=$(get /journal)
check "13. the lede" found "$(has ">50 entries across 1 work, newest first." "$JOURNAL")"
check "13. no Ben Mears" missing "$(has "$BEN" "$JOURNAL")"

# 14. Carrie's first read deleted, its 50 entries with it
by_hand step_delete
tally "14." 29 0 3
check "14. journal_entries, everyone's" 0 "$(P 'select count(*) from journal_entries')"
PAGE=$(item "$C")
check "14. the heading" found "$(has ">1 read<" "$PAGE")"
check "14. the card unrated" found "$(has 'aria-label="Unrated"' "$PAGE")"
check "14. no last finished at" missing "$(has "last finished at" "$PAGE")"
check "14. the deleted read's dates gone" missing "$(has "28 October 2026" "$PAGE")"
JOURNAL=$(get /journal)
check "14. the journal's empty sentence" found "$(has ">Nothing written yet. Open a work, log a read or a watch, and write the first line.<" "$JOURNAL")"
check "14. the journal's rows" 0 "$(rows_on "$JOURNAL")"
KING=$(shelf "$K")
check "14. the publication-order line" found "$(has "11 works $DOT 2 done $DOT $STAR 5 from 1 rated" "$(text "$KING")")"
check "14. no 4.5 on Carrie's row" missing "$(has ">$STAR 4.5<" "$KING")"
check "14. no read twice" missing "$(has ">read twice<" "$KING")"

# 15. The count block
block_of() { # label
  tally "$1" 29 0 3
  check "$1 the starred reads" "3.5,4.0,5.0" "$(mine "select string_agg(o.stars::text, ',' order by o.stars) from occurrences o where MINE and o.stars is not null")"
  check "$1 open" 0 "$(mine "select count(*) from occurrences o where MINE and o.status = 'in_progress'")"
  check "$1 shelf entries done" 2 "$(done_count)"
  check "$1 entries not on your reads" 0 "$(mine "select count(*) from journal_entries j join occurrences o on o.id = j.occurrence where not (MINE)")"
}
block_of "after the walk:"

# 16. A12's nine reds, each followed by what it must leave alone
check "red 1, a Reading read of Carrie" 201 "$(call "$JAR_A" POST /api/v1/occurrences "{\"item\":\"$C\",\"status\":\"in_progress\",\"startedOn\":\"$TODAY\"}")"
R9=$(field id)
check "red 1, a second Reading" 409 "$(call "$JAR_A" POST /api/v1/occurrences "{\"item\":\"$C\",\"status\":\"in_progress\",\"startedOn\":\"$TODAY\"}")"
check "red 1, its sentence" "You're already reading this. Finish or abandon that read first." "$(field error.message)"
check "red 1, open reads of Carrie" 1 "$(open_on "$C")"
check "red 1, reverted" 204 "$(call "$JAR_A" DELETE "/api/v1/occurrences/$R9")"
tally "red 1, after:" 29 0 3

check "red 2, stars 4.3" 400 "$(call "$JAR_A" PATCH "/api/v1/occurrences/$R3" '{"stars":4.3}')"
check "red 2, at stars" "Stars go in half steps from 0.5 to 5." "$(field error.fields.stars)"
check "red 2, the read's stars" 5.0 "$(P "select stars from occurrences where id = '$R3'")"

check "red 3, Finished before Started" 400 "$(call "$JAR_A" POST /api/v1/occurrences "{\"item\":\"$F\",\"status\":\"done\",\"startedOn\":\"$TODAY\",\"finishedOn\":\"2026-10-28\"}")"
check "red 3, at finishedOn" "Finished can't be before Started." "$(field error.fields.finishedOn)"
tally "red 3, after:" 29 0 3

check "red 4, a kind with no value" 400 "$(call "$JAR_A" POST "/api/v1/occurrences/$R3/entries" '{"body":"x","anchorKind":"page"}')"
check "red 4, at anchorValue" "Say where, or leave both out." "$(field error.fields.anchorValue)"
check "red 4, Salem's Lot's entries" 0 "$(entries_on "$S")"

check "red 5, episode on a book" 400 "$(call "$JAR_A" POST "/api/v1/occurrences/$R3/entries" '{"body":"x","anchorKind":"episode","anchorValue":"S02E03"}')"
check "red 5, naming page and chapter" "A book takes page or chapter." "$(field error.fields.anchorKind)"
check "red 5, Salem's Lot's entries" 0 "$(entries_on "$S")"

check "red 6, the stranger's PATCH" 404 "$(call "$JAR_B" PATCH "/api/v1/occurrences/$R3" '{"stars":1}')"
check "red 6, as not_found" not_found "$(field error.code)"
check "red 6, the stranger's DELETE" 404 "$(call "$JAR_B" DELETE "/api/v1/occurrences/$R3")"
check "red 6, the read and its stars" 5.0 "$(P "select stars from occurrences where id = '$R3'")"

check "red 7, the stranger's entry" 404 "$(call "$JAR_B" POST "/api/v1/occurrences/$R3/entries" '{"body":"mine"}')"
check "red 7, Salem's Lot's entries" 0 "$(entries_on "$S")"

check "red 8, a read of The Stand with an entry" 201 "$(call "$JAR_A" POST /api/v1/occurrences "{\"item\":\"$X\",\"status\":\"done\",\"entry\":{\"body\":\"one\"}}")"
R8=$(field id)
check "red 8, a second entry" 201 "$(call "$JAR_A" POST "/api/v1/occurrences/$R8/entries" '{"body":"two"}')"
tally "red 8, with two:" 30 2 3
check "red 8, DELETE the read" 204 "$(call "$JAR_A" DELETE "/api/v1/occurrences/$R8")"
check "red 8, its entries" 0 "$(P "select count(*) from journal_entries where occurrence = '$R8'")"

# The ninth is an e2e on its own account and shelf (Playwright reuses the
# dev server you started): the status route answered 500, no offer.
check "red 9, a refused Done offers nothing" 0 "$(npx playwright test tests/e2e/shelf-stars.spec.ts -g 'answered 500' >/dev/null 2>&1; echo $?)"

block_of "after the reds:"

# 17. Back to a clean database, so test:db starts from nothing
by_hand step_stop
require "dev server down" 000 "$(code "$APP/")"
check "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"

summary
[ "$failed" -eq 0 ]
