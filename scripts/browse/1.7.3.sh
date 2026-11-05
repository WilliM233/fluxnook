#!/usr/bin/env bash
# Browse 1.7.3, the chapter's exit (#91, #88). One pass: the hands touch each
# feature of Chapter 1.7 once, for its feel; this script carries every count and
# A14's eleven reds. Git Bash, from a clean tree, with the local stack up and the
# dev server stopped. Run it as:
#   BROWSE_EMAIL=<your address> bash scripts/browse/1.7.3.sh
#
# Every check prints its name, what was expected, what came back, and pass or
# fail. A precondition that fails ends the run there with the summary. A step
# for your hands prints one action per line and waits for Enter. Every step
# is written to browse-results/1.7.3-steps.md before the first pause. The
# report is browse-results/1.7.3.txt.

set -u
cd "$(dirname "$0")/../.." || exit 1

APP=http://localhost:3000
MAILPIT=http://127.0.0.1:54324
REPORT=browse-results/1.7.3.txt
STEPS=browse-results/1.7.3-steps.md
CARRIE_ISBN=978-0-307-74366-4
IT_ISBN=978-1-5011-4297-0
# A middle dot, as bytes: a literal one in an argument to a Windows program
# reaches it in the console's code page, not UTF-8 (1.5.1).
DOT=$(printf '\302\267')

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

# One SQL statement against the local database; the bare result, no tag.
P() { docker exec supabase_db_fluxnook psql -U postgres -tAc "$1" | tr -d '\r' | head -1; }

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# Whether a page holds a line: the HTML carries it twice (once rendered,
# once in Next's payload), so presence is the check, not a count.
has() { grep -qF -- "$1" <<<"$2" && echo found || echo missing; }

# A page's text with the tags taken out; an apostrophe comes as an entity.
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

# How many of a test id a page renders: the attribute as HTML writes it is in
# the HTML only, never in the payload, so the count is the elements.
count_of() { grep -o "data-testid=\"$1\"" <<<"$2" | wc -l | tr -d ' '; }

# A row by its work, the same way: the attribute's HTML form is the HTML's alone.
rows_of() { grep -o "data-item=\"$1\"" <<<"$2" | wc -l | tr -d ' '; }

# The boxes the server sends disabled (1.7.2 pick 3).
disabled_boxes() { grep -oE '<input[^>]*data-testid="tick"[^>]*disabled=""' <<<"$1" | wc -l | tr -d ' '; }

# A row's second line, exactly, as the elements read it.
lines_reading() { # the line, page
  grep -oF -- "data-testid=\"row-line\" class=\"min-w-0 text-[15px] text-muted-foreground\">$1<" <<<"$2" | wc -l | tr -d ' '
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

# A value from the last call's body by a dotted path ("id", "held.0.editionId").
field() {
  node.exe -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let v=JSON.parse(s);for(const k of process.argv[1].split("."))v=v==null?v:v[k];console.log(v===undefined?"(none)":typeof v==="object"?JSON.stringify(v):v)})' "$1" <"$OUT" |
    tr -d '\r'
}

as_a() { curl -s -b "$JAR_A" "$APP$1"; }
as_b() { curl -s -b "$JAR_B" "$APP$1"; }

# The Browse account's rows, so no other account's ever move a count.
copies_of() { P "select count(*) from copies c join auth.users u on u.id = c.owner where u.email = '$1'"; }

tally() { # label, copies, editions, items, series
  check "$1 your copies" "$2" "$(copies_of "$EMAIL")"
  check "$1 editions" "$3" "$(P 'select count(*) from editions')"
  check "$1 items" "$4" "$(P 'select count(*) from items')"
  check "$1 series" "$5" "$(P 'select count(*) from series')"
}

# Collection's lede and its button, in one read.
reads() { # label, n, m, s
  local page
  page=$(text "$(as_a /collection)")
  check "$1 the lede" found "$(has "$2 copies of $3 works, newest first. 38 more works are yours through what they collect." "$page")"
  check "$1 Shopping's button" found "$(has "Shopping $DOT $4 to find" "$page")"
}

# The series heading, as the page reads, with the walk's N.
holding_line() { # h
  printf '%s in the catalog, in cover-date order %s you hold %s, 33 of them via a collection' "$N" "$DOT" "$1"
}

series_reads() { # label, h
  local page
  page=$(as_a "/series/$S")
  check "$1 the heading" found "$(has "$(holding_line "$2")" "$(text "$page")")"
  check "$1 via lines" 33 "$(count_of tile-via "$page")"
}

marks() { # label, n
  check "$1 the TMNT shelf's marks" "$2" "$(count_of shelf-mark "$(as_a "/shelves/$TMNT")")"
}

shopping_line() { # label, line
  check "$1 Shopping reads" found "$(has "$2" "$(text "$(as_a /collection/shopping)")")"
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

step_carrie_isbn() {
  echo "Step 2, by hand: Carrie's ISBN, with the box off"
  echo ""
  echo "In the browser, sign in at $APP with:"
  echo "    $EMAIL"
  echo "(the link is the newest mail in Mailpit, $MAILPIT)"
  echo ""
  echo "Open $APP/search and type:"
  echo "    $CARRIE_ISBN"
  echo "The card shows Paperback. The box and I own it is off."
  echo "Click Add this edition."
  echo "The sheet reads:"
  echo "    Looks like one you have"
  echo "Click:"
  echo "    Same, add the Open Library details to it"
  echo "Carrie's page opens. Editions reads:"
  echo "    1 in the catalog $DOT none yours"
}

step_own_this() {
  echo "Step 3, by hand: I own this"
  echo ""
  echo "On the paperback, click I own this. No sheet."
  echo "Under it:"
  echo "    Your copy"
  echo "The heading reads:"
  echo "    1 in the catalog $DOT you hold 1"
}

step_remove() {
  echo "Step 4, by hand: Remove"
  echo ""
  echo "On that line, click Remove. The sheet reads:"
  echo "    Let go of this copy?"
  echo "    The printing stays in the catalog."
  echo "Click Remove."
  echo "The row stays and ends in I own this. The heading reads:"
  echo "    1 in the catalog $DOT none yours"
}

step_own_copy() {
  echo "Step 5, by hand: Own a copy, the sheet"
  echo ""
  echo "Click Own a copy. Format lists:"
  echo "    Paperback $DOT Anchor Books, 2011"
  echo "    a rule"
  echo "    Hardcover"
  echo "    Ebook"
  echo "    Audiobook"
  echo "Keep the paperback."
  echo "Condition: Good"
  echo "Acquired: 2019-03-12"
  echo "Note:"
  echo "    The one with the Sissy Spacek cover."
  echo "Click Add it."
  echo "Under the paperback:"
  echo "    Your copy"
  echo "    Good $DOT since 12 March 2019"
  echo "    The one with the Sissy Spacek cover."
  echo "The heading reads:"
  echo "    1 in the catalog $DOT you hold 1"
}

step_film() {
  echo "Step 6, by hand: the film, a printing the catalog lacks"
  echo ""
  echo "Open:"
  echo "    $APP/items/$F"
  echo "Editions reads:"
  echo "    None in the catalog yet."
  echo "Click Own a copy. Format lists:"
  echo "    DVD"
  echo "    Blu-ray"
  echo "    4K"
  echo "    Digital"
  echo "Blu-ray."
  echo "Condition: Fine"
  echo "Click Add it."
  echo "A Blu-ray row, and under it:"
  echo "    Your copy"
  echo "    Fine"
  echo "The heading reads:"
  echo "    1 in the catalog $DOT you hold 1"
}

step_run() {
  echo "Step 7, by hand: the 1984 run, through its sheet"
  echo ""
  echo "Open:"
  echo "    $APP/search?q=teenage mutant ninja turtles"
  echo "Click Comics."
  echo "On the 1984 row (Mirage), click Add."
  echo "The sheet reads:"
  echo "    Is this one already in your catalog?"
  echo "Single issues is picked."
  echo "Click:"
  echo "    Same, add Comic Vine's details to it"
  echo "The series page opens, with a tile per issue: stub 62, live measured."
  echo "The heading ends:"
  echo "    you hold 33, 33 of them via a collection"
}

step_one() {
  echo "Step 8, by hand: tick #1, then its page"
  echo ""
  echo "#1's box is empty. Under it:"
  echo "    via Ultimate Collection 1"
  echo "Tick it. It reads:"
  echo "    Owned $DOT Floppy"
  echo "    also via Ultimate Collection 1"
  echo "The heading doesn't move."
  echo "Click #1's title. Under the facts:"
  echo "    Owned via Ultimate Collection 1 (Hardcover)"
  echo "Under Collected in, Ultimate Collection 1 ends:"
  echo "    Your copy"
  echo "Go back."
}

step_tick_33() {
  echo "Step 9, by hand: tick #33"
  echo ""
  echo "#33 has no via line. Tick it. It reads:"
  echo "    Owned $DOT Floppy"
  echo "The heading ends:"
  echo "    you hold 34, 33 of them via a collection"
  echo "How the run of ticks feels goes under the Browse."
}

step_untick_33() {
  echo "Step 10, by hand: let #33 go, and see the row it leaves"
  echo ""
  echo "Untick #33. No confirm. The box is empty."
  echo "The heading ends:"
  echo "    you hold 33, 33 of them via a collection"
  echo "Under Collected in, Ultimate Collection 1 to 5 each end:"
  echo "    Your copy"
  echo "Click #33's title. Editions reads:"
  echo "    1 in the catalog $DOT none yours"
  echo "A Floppy row ending in I own this. This is Q1's row: say under the"
  echo "Browse if it reads as noise."
}

step_digital() {
  echo "Step 11, for your eyes: an issue held only as digital"
  echo ""
  echo "The script has just posted a digital copy of #34."
  echo "Go back to the series page, and reload."
  echo "#34's box is empty, labelled:"
  echo "    Owned"
  echo "The heading ends:"
  echo "    you hold 34, 33 of them via a collection"
  echo "Say under the Browse if that reads wrong. The script takes the copy back."
}

step_it() {
  echo "Step 12, by hand: It's ISBN, with the box on"
  echo ""
  echo "Open $APP/search and type:"
  echo "    $IT_ISBN"
  echo "Tick and I own it."
  echo "Click Add this edition."
  echo "It's page opens. Editions reads:"
  echo "    1 in the catalog $DOT you hold 1"
  echo "Under the paperback:"
  echo "    Your copy"
}

step_card() {
  echo "Step 13, by hand: Carrie's ISBN, a printing you hold"
  echo ""
  echo "Open $APP/search and type:"
  echo "    $CARRIE_ISBN"
  echo "The card reads:"
  echo "    This edition is in your catalog"
  echo "    In your collection"
  echo "The box is ticked and disabled."
}

step_collection() {
  echo "Step 14, by hand: Collection"
  echo ""
  echo "Click Collection in the header, after Journal."
  echo "    Your collection"
  echo "    9 copies of 9 works, newest first. 38 more works are yours through what they collect."
  echo "At the right:"
  echo "    Shopping $DOT 312 to find"
  echo "Nine rows: It first, TMNT #1 next, the five hardcovers last, each"
  echo "reading Hardcover $DOT covers 7 issues or covers 8."
  echo "Click Comics: six rows."
  echo "Click Films: one."
  echo "Click Books: two."
  echo "Click TV:"
  echo "    Nothing here yet."
  echo "Click All."
}

step_edit() {
  echo "Step 15, by hand: Edit on a row"
  echo ""
  echo "On the Blu-ray's row, click Edit."
  echo "The sheet reads Edit this copy, with Format as text."
  echo "Note:"
  echo "    The Arrow disc."
  echo "Click Save. The row's third line reads:"
  echo "    Fine $DOT The Arrow disc."
}

step_shopping() {
  echo "Step 16, by hand: Shopping"
  echo ""
  echo "Click Shopping $DOT 312 to find."
  echo "    312 works on your shelves you don't hold a copy of, by shelf."
  echo "TMNT, the Mirage run:"
  echo "    242 of 326 to find"
  echo "    section labels"
  echo "    at its foot, 47 backups left out: you'd buy what they're printed in."
  echo "Stephen King Watch List:"
  echo "    60 of 61 to find, and no 1976 Carrie"
  echo "Stephen King, publication order:"
  echo "    10 of 11 to find, and no 1974 Carrie"
  echo "Under that last shelf, on Salem's Lot (1975), click I own this."
  echo "    Own a copy of Salem's Lot"
  echo "Paperback is first. Click Add it."
  echo "The row leaves. That shelf reads:"
  echo "    9 of 11 to find"
  echo "The lede reads:"
  echo "    311 works"
}

step_nook() {
  echo "Step 17, by hand: the nook and the shelf"
  echo ""
  echo "Click Nook. The three cards read:"
  echo "    326 works $DOT 14 sections $DOT 38 owned"
  echo "    61 works $DOT 1 owned $DOT from Letterboxd"
  echo "    11 works $DOT 2 owned $DOT from Letterboxd"
  echo "Open TMNT, the Mirage run. #1's row reads:"
  echo "    owned $DOT via Ultimate Collection 1"
  echo "#33's prints nothing."
}

step_older() {
  echo "Step 18, by hand: Older copies"
  echo ""
  echo "The script has filled your collection to 51."
  echo "Open $APP/collection"
  echo "    51 copies of 10 works, newest first."
  echo "Older copies is at the foot. Click it."
  echo "One row, a hardcover, and no Older copies."
  echo "The script takes the filler back."
}

step_stop() {
  echo "Step 19, by hand: stop the dev server"
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

say "Browse 1.7.3, the chapter's exit"
say "at $(git log -1 --oneline), $(date '+%Y-%m-%d %H:%M')"
say "The steps for your hands are in $STEPS once the fixtures load."
say ""

# 0. Where the walk starts; each of these ends the run when it fails
require "tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"
require "stack up" 0 "$(npx supabase status >/dev/null 2>&1; echo $?)"
require "dev server down before the reset" 000 "$(code "$APP/")"
require "Open Library reachable" 302 "$(code -A 'Fluxnook dev' https://openlibrary.org/isbn/9780307743664.json)"
require "the Comic Vine key" 1 "$(grep -c '^COMICVINE_API_KEY=.' .env.local)"
# The key rides the query string by Comic Vine's design; only the status prints.
require "Comic Vine reachable" 200 "$(code -A 'Fluxnook dev' "https://comicvine.gamespot.com/api/volume/4050-20281/?format=json&field_list=id&api_key=$(grep '^COMICVINE_API_KEY=' .env.local | cut -d= -f2- | tr -d '\r')")"
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

work() { P "select item from item_sources where source = '$1' and key = '$2'"; }
shelf() { P "select s.id from shelves s join auth.users u on u.id = s.owner where u.email = '$EMAIL' and s.name = '$1'"; }
T1=$(work manual tmnt-mirage-v1-1)
T33=$(work manual tmnt-mirage-v1-33)
T34=$(work manual tmnt-mirage-v1-34)
K=$(work manual tmnt-mirage-backup-you-had-to-be-there)
U=$(work manual tmnt-ultimate-collection-1)
C=$(work manual carrie-1974)
F=$(work letterboxd 20ZQ)
SL=$(work manual salems-lot-1975)
TMNT=$(shelf "TMNT, the Mirage run")
WATCH=$(shelf "Stephen King Watch List")
KING=$(shelf "Stephen King, publication order")
ACCOUNT=$(P "select id from auth.users where email = '$EMAIL'")

{
  echo "# Browse 1.7.3, the steps for your hands"
  echo ""
  echo "Nineteen: the dev server's start, seventeen in the browser, its stop."
  echo "This is the chapter's walk, once. What differs goes under the PR's Browse."
  for step in step_server step_carrie_isbn step_own_this step_remove step_own_copy \
    step_film step_run step_one step_tick_33 step_untick_33 step_digital step_it \
    step_card step_collection step_edit step_shopping step_nook step_older step_stop; do
    block "$step"
  done
} >"$STEPS"

# 1. The load, by the database
tally "loaded:" 5 5 454 0
check "the condition check" 1 "$(P "select count(*) from pg_constraint where conname = 'copies_condition'")"

by_hand step_server
require "dev server up" 200 "$(code "$APP/")"
require "the script's own session" "$APP/nook" "$(sign_in "$EMAIL" "$JAR_A")"
require "a stranger's session" "$APP/nook" "$(sign_in "$STRANGER" "$JAR_B")"

# 2. The load, by the pages (A13)
reads "loaded:" 5 5 314
PAGE=$(as_a /collection)
check "Collection: rows" 5 "$(count_of collection-row "$PAGE")"
check "Collection: covering 8" 2 "$(lines_reading "Hardcover $DOT covers 8 issues" "$PAGE")"
check "Collection: covering 7" 3 "$(lines_reading "Hardcover $DOT covers 7 issues" "$PAGE")"
check "Collection: no third lines" 0 "$(count_of row-third "$PAGE")"
check "Collection: the closing line" found "$(has "A copy is a thing you hold: one printing, one format, its condition and where it came from." "$(text "$PAGE")")"

PAGE=$(as_a /collection/shopping)
PLAIN=$(text "$PAGE")
check "Shopping: the lede" found "$(has "314 works on your shelves you don't hold a copy of, by shelf. A work on two shelves is listed once, under the first." "$PLAIN")"
check "Shopping: rows" 314 "$(count_of shopping-row "$PAGE")"
check "Shopping: TMNT" found "$(has "242 of 326 to find" "$PLAIN")"
check "Shopping: the Watch List" found "$(has "61 of 61 to find" "$PLAIN")"
check "Shopping: Stephen King" found "$(has "11 of 11 to find" "$PLAIN")"
check "Shopping: the backups" found "$(has "47 backups left out: you'd buy what they're printed in." "$PLAIN")"
check "Shopping: TMNT before the Watch List" yes "$(before "TMNT, the Mirage run" "Stephen King Watch List" "$PLAIN")"
check "Shopping: the Watch List before Stephen King" yes "$(before "Stephen King Watch List" "Stephen King, publication order" "$PLAIN")"
check "Shopping: the word it doesn't use" 0 "$(grep -ci wishlist <<<"$PAGE")"
check "Shopping: the back link" found "$(has "Back to your collection" "$PLAIN")"
check "Shopping: no Also on, no work is on two shelves" missing "$(has "Also on" "$PLAIN")"
measured "Shopping, warm: seconds and bytes (the row's printings Deferral's trigger is 1 s)" "$(curl -s -b "$JAR_A" -o /dev/null -w '%{time_total} %{size_download}' "$APP/collection/shopping")"

PAGE=$(as_a /nook)
check "the header: Journal before Collection" yes "$(before 'href="/journal"' 'href="/collection"' "$PAGE")"
PLAIN=$(text "$PAGE")
check "the nook: TMNT's card" found "$(has "326 works $DOT 14 sections $DOT 38 owned" "$PLAIN")"
check "the nook: the Watch List's card" found "$(has "61 works $DOT from Letterboxd" "$PLAIN")"
check "the nook: Stephen King's card" found "$(has "11 works $DOT from Letterboxd" "$PLAIN")"

as_a "/shelves/$TMNT" >/dev/null
# Five, since `next dev` answers in two modes, about 0.18 s and about 0.42 s, and
# one sample can read either (1.7.2 D7).
for hit in 1 2 3 4 5; do
  measured "the TMNT shelf, warm, hit $hit: seconds and bytes (the index Deferral's trigger is 0.5 s, the 1.6 Deferral's 1 s)" "$(curl -s -b "$JAR_A" -o /dev/null -w '%{time_total} %{size_download}' "$APP/shelves/$TMNT")"
done
marks "loaded:" 38
check "TMNT as a stranger" 404 "$(code -b "$JAR_B" "$APP/shelves/$TMNT")"

PLAIN=$(text "$(as_a "/items/$T1")")
check "TMNT #1: the via line" found "$(has "Owned via Ultimate Collection 1 (Hardcover)" "$PLAIN")"
check "TMNT #1: Collected in" found "$(has "Your copy" "$PLAIN")"
PLAIN=$(text "$(as_b "/items/$T1")")
check "TMNT #1 as a stranger: no via line" missing "$(has "Owned via" "$PLAIN")"
check "TMNT #1 as a stranger: I own this" found "$(has "I own this" "$PLAIN")"
check "the backup's section" found "$(has "Yours via All is Revealed (Hardcover)" "$(text "$(as_a "/items/$K")")")"
check "Carrie: no printing" found "$(has "None in the catalog yet." "$(text "$(as_a "/items/$C")")")"
check "the film: no printing" found "$(has "None in the catalog yet." "$(text "$(as_a "/items/$F")")")"

# The owner rule and the empties, as a stranger
PAGE=$(as_b /collection)
PLAIN=$(text "$PAGE")
check "a stranger's Collection" found "$(has "Nothing held yet. Own a copy from a work's page, or tick a run on its series page." "$PLAIN")"
check "a stranger's rows" 0 "$(count_of collection-row "$PAGE")"
check "a stranger's button" found "$(has "Shopping $DOT 0 to find" "$PLAIN")"
PAGE=$(as_b /collection/shopping)
PLAIN=$(text "$PAGE")
check "a stranger's Shopping" found "$(has "No shelves yet, so nothing to find." "$PLAIN")"
check "a stranger's Shopping rows" 0 "$(count_of shopping-row "$PAGE")"
check "a stranger sees no TMNT" missing "$(has "TMNT" "$PLAIN")"

# What the address bar can ask
check "a bad type" 404 "$(code -b "$JAR_A" "$APP/collection?type=nope")"
check "a bad before" 404 "$(code -b "$JAR_A" "$APP/collection?before=nope")"
check "a repeated type" 404 "$(code -b "$JAR_A" "$APP/collection?type=book&type=film")"
check "Collection with no cookie" 307 "$(code "$APP/collection")"
check "Shopping with no cookie" 307 "$(code "$APP/collection/shopping")"

# 3. Carrie's ISBN, the box off: it attaches and owns nothing
by_hand step_carrie_isbn

tally "after Carrie's ISBN:" 5 6 454 0
PB=$(P "select edition from edition_sources where source = 'isbn' and key = '9780307743664'")
check "the printing is Carrie's" "$C" "$(P "select item from editions where id = '$PB'")"
PLAIN=$(text "$(as_a "/items/$C")")
check "Carrie: the heading" found "$(has "1 in the catalog $DOT none yours" "$PLAIN")"
check "Carrie: the publisher (live)" found "$(has "Anchor Books" "$PLAIN")"
check "Carrie: I own this" found "$(has "I own this" "$PLAIN")"
reads "after Carrie's ISBN:" 5 5 314

# 4. I own this
by_hand step_own_this

tally "after I own this:" 6 6 454 0
PAGE=$(as_a "/items/$C")
check "Carrie: you hold 1" found "$(has "1 in the catalog $DOT you hold 1" "$(text "$PAGE")")"
check "Carrie: the copy's line" 1 "$(count_of copy "$PAGE")"
reads "after I own this:" 6 6 313
shopping_line "after I own this:" "10 of 11 to find"

# 5. Remove: the row stays
by_hand step_remove

tally "after Remove:" 5 6 454 0
PAGE=$(as_a "/items/$C")
PLAIN=$(text "$PAGE")
check "Carrie: none yours" found "$(has "1 in the catalog $DOT none yours" "$PLAIN")"
check "Carrie: no line" 0 "$(count_of copy "$PAGE")"
check "Carrie: I own this again" found "$(has "I own this" "$PLAIN")"
reads "after Remove:" 5 5 314

# 6. Own a copy, the printing known
by_hand step_own_copy

tally "after Own a copy:" 6 6 454 0
PC=$(P "select id from copies where owner = '$ACCOUNT' and edition = '$PB'")
check "the copy" "good|2019-03-12" "$(P "select condition, acquired_on from copies where id = '$PC'")"
PLAIN=$(text "$(as_a "/items/$C")")
check "Carrie: the line" found "$(has "Good $DOT since 12 March 2019" "$PLAIN")"
check "Carrie: the note" found "$(has "The one with the Sissy Spacek cover." "$PLAIN")"
reads "after Own a copy:" 6 6 313

# 7. The film: a format the catalog lacks makes a printing
by_hand step_film

tally "after the film:" 7 7 454 0
check "the film's printing" blu-ray "$(P "select format from editions where item = '$F'")"
check "the film's printing has no source" 0 "$(P "select count(*) from edition_sources s join editions e on e.id = s.edition where e.item = '$F'")"
check "the film's copy" "fine|null" "$(P "select c.condition, coalesce(c.acquired_on::text, 'null') from copies c join editions e on e.id = c.edition where e.item = '$F' and c.owner = '$ACCOUNT'")"
PLAIN=$(text "$(as_a "/items/$F")")
check "the film: Blu-ray" found "$(has "Blu-ray" "$PLAIN")"
check "the film: Fine" found "$(has "Fine" "$PLAIN")"
reads "after the film:" 7 7 312
shopping_line "after the film:" "60 of 61 to find"

# 8. The run, on live Comic Vine
by_hand step_run

S=$(P "select series from series_sources where source = 'comicvine' and key = 'volume/20281'")
N=$(P "select count(*) from item_comics where series_id = '$S'")
measured "the 1984 run's issues, live (stub 62)" "$N"
tally "after the run:" 7 7 $((454 + N - 62)) 1
PAGE=$(as_a "/series/$S")
PLAIN=$(text "$PAGE")
check "the heading" found "$(has "$(holding_line 33)" "$PLAIN")"
check "the boxes" "$N" "$(count_of tick "$PAGE")"
check "the boxes the server sends disabled" "$N" "$(disabled_boxes "$PAGE")"
check "via lines" 33 "$(count_of tile-via "$PAGE")"
check "no also via yet" missing "$(has "also via" "$PLAIN")"
check "Your copy" found "$(has "Your copy" "$PLAIN")"
PAGE=$(as_b "/series/$S")
PLAIN=$(text "$PAGE")
check "a stranger: the heading's count" found "$(has "$N in the catalog, in cover-date order" "$PLAIN")"
check "a stranger: no holding" missing "$(has "$DOT you hold" "$PLAIN")"
check "a stranger: no via lines" 0 "$(count_of tile-via "$PAGE")"

# 9. Tick #1: a work held and via counts once
by_hand step_one

tally "after #1:" 8 8 $((454 + N - 62)) 1
check "#1's printing" floppy "$(P "select format from editions where item = '$T1'")"
check "#1's printing has no source" 0 "$(P "select count(*) from edition_sources s join editions e on e.id = s.edition where e.item = '$T1'")"
check "#1's copy" "null|private" "$(P "select coalesce(c.condition, 'null'), c.visibility from copies c join editions e on e.id = c.edition where e.item = '$T1' and c.owner = '$ACCOUNT'")"
series_reads "after #1:" 33
check "after #1: also via" found "$(has "also via Ultimate Collection 1" "$(text "$(as_a "/series/$S")")")"
reads "after #1:" 8 8 312

# 10. Tick #33: no via, so the holding moves
by_hand step_tick_33

tally "after #33:" 9 9 $((454 + N - 62)) 1
series_reads "after #33:" 34
marks "after #33:" 39
check "after #33: the nook" found "$(has "326 works $DOT 14 sections $DOT 39 owned" "$(text "$(as_a /nook)")")"
reads "after #33:" 9 9 311
shopping_line "after #33:" "241 of 326 to find"

# 11. Untick #33: bare, so no confirm; the printing stays (Q1 a, A3)
by_hand step_untick_33

tally "after the untick:" 8 9 $((454 + N - 62)) 1
series_reads "after the untick:" 33
marks "after the untick:" 38
check "after the untick: the nook" found "$(has "326 works $DOT 14 sections $DOT 38 owned" "$(text "$(as_a /nook)")")"
reads "after the untick:" 8 8 312
PLAIN=$(text "$(as_a "/items/$T33")")
check "#33's Editions" found "$(has "1 in the catalog $DOT none yours" "$PLAIN")"
check "#33's I own this" found "$(has "I own this" "$PLAIN")"

# 12. For your eyes: an issue held only as digital (1.7.2 Rummage N5)
check "#34 as digital" 201 "$(call "$JAR_A" POST /api/v1/copies "{\"item\":\"$T34\",\"format\":\"digital\"}")"
D34=$(field id)
by_hand step_digital

PAGE=$(as_a "/series/$S")
check "the digital #34: the heading" found "$(has "$(holding_line 34)" "$(text "$PAGE")")"
check "the digital #34: every box" "$N" "$(count_of tick "$PAGE")"
reads "the digital #34:" 9 9 311
check "the digital #34 taken back" 204 "$(call "$JAR_A" DELETE "/api/v1/copies/$D34")"
P "delete from editions where item = '$T34' and format = 'digital'" >/dev/null
tally "after the digital #34:" 8 9 $((454 + N - 62)) 1
series_reads "after the digital #34:" 33
reads "after the digital #34:" 8 8 312

# 13. It's ISBN with the box on
by_hand step_it

tally "after It:" 9 10 $((455 + N - 62)) 1
IT_ED=$(P "select edition from edition_sources where source = 'isbn' and key = '9781501142970'")
IT=$(P "select item from editions where id = '$IT_ED'")
check "It's printing" paperback "$(P "select format from editions where id = '$IT_ED'")"
check "It's copy" "null|t" "$(P "select coalesce(c.condition, 'null'), u.email = '$EMAIL' from copies c join auth.users u on u.id = c.owner where c.edition = '$IT_ED'")"
PLAIN=$(text "$(as_a "/items/$IT")")
check "It's Editions" found "$(has "1 in the catalog $DOT you hold 1" "$PLAIN")"
check "It's line" found "$(has "Your copy" "$PLAIN")"
check "It's publisher" found "$(has "Scribner" "$PLAIN")"
reads "after It:" 9 9 312

# 14. Carrie's ISBN read back. The card is the hands'; A4 is what it reads
by_hand step_card

check "A4 on Carrie" 200 "$(call "$JAR_A" GET "/api/v1/copies?item=$C")"
check "you hold one" 1 "$(field held.length)"
check "of that printing" "$PB" "$(field held.0.editionId)"
call "$JAR_B" GET "/api/v1/copies?item=$C" >/dev/null
check "A4 on Carrie, as a stranger" '{"held":[],"via":[]}' "$(cat "$OUT")"

# 15. Collection
by_hand step_collection

PAGE=$(as_a /collection)
PLAIN=$(text "$PAGE")
check "Collection: rows" 9 "$(count_of collection-row "$PAGE")"
check "Collection: It before #1" yes "$(before "data-item=\"$IT\"" "data-item=\"$T1\"" "$PAGE")"
check "Collection: #1 before the hardcovers" yes "$(before "data-item=\"$T1\"" "data-item=\"$U\"" "$PAGE")"
check "Collection: the film's line" found "$(has "Blu-ray $DOT 1976" "$PLAIN")"
check "Collection: Carrie's line (live)" found "$(has "Paperback $DOT Anchor Books $DOT 2011" "$PLAIN")"
check "Collection: #1's line" found "$(has "Floppy $DOT 1984 $DOT Teenage Mutant Ninja Turtles (Mirage) Vol. 1 $DOT #1" "$PLAIN")"
check "Collection: Carrie's third line" found "$(has "Good $DOT since 12 March 2019 $DOT The one with the Sissy Spacek cover." "$PLAIN")"
PAGE=$(as_a '/collection?type=comic')
check "Comics" 6 "$(count_of collection-row "$PAGE")"
check "Comics: the lede stays" found "$(has "9 copies of 9 works, newest first." "$(text "$PAGE")")"
check "Films" 1 "$(count_of collection-row "$(as_a '/collection?type=film')")"
check "Books" 2 "$(count_of collection-row "$(as_a '/collection?type=book')")"
PAGE=$(as_a '/collection?type=tv')
check "TV" 0 "$(count_of collection-row "$PAGE")"
check "TV: what it says" found "$(has "Nothing here yet." "$(text "$PAGE")")"

# 16. Edit on a row
by_hand step_edit

check "after Edit: the third line" found "$(has "Fine $DOT The Arrow disc." "$(text "$(as_a /collection)")")"
tally "after Edit:" 9 10 $((455 + N - 62)) 1

# 17. Shopping: I own this on a row
by_hand step_shopping

tally "after Shopping:" 10 11 $((455 + N - 62)) 1
check "Salem's Lot's printing" "paperback|0" "$(P "select e.format, (select count(*) from edition_sources s where s.edition = e.id) from editions e where e.item = '$SL'")"
PAGE=$(as_a /collection/shopping)
PLAIN=$(text "$PAGE")
check "Shopping: the lede" found "$(has "311 works on your shelves" "$PLAIN")"
check "Shopping: Stephen King" found "$(has "9 of 11 to find" "$PLAIN")"
check "Shopping: the Watch List" found "$(has "60 of 61 to find" "$PLAIN")"
check "Shopping: TMNT" found "$(has "242 of 326 to find" "$PLAIN")"
check "Shopping: rows" 311 "$(count_of shopping-row "$PAGE")"
check "Shopping: Salem's Lot has left" 0 "$(rows_of "$SL" "$PAGE")"
check "Shopping: the 1976 Carrie has left" 0 "$(rows_of "$F" "$PAGE")"
check "Shopping: the 1974 Carrie has left" 0 "$(rows_of "$C" "$PAGE")"
C2002=$(P "select id from items where type = 'film' and title = 'Carrie' and extract(year from released_on) = 2002")
C2013=$(P "select id from items where type = 'film' and title = 'Carrie' and extract(year from released_on) = 2013")
check "Shopping: the 2002 Carrie stays" 1 "$(rows_of "$C2002" "$PAGE")"
check "Shopping: the 2013 Carrie stays" 1 "$(rows_of "$C2013" "$PAGE")"
reads "after Shopping:" 10 10 311

# 18. The nook and the shelf
by_hand step_nook

PLAIN=$(text "$(as_a /nook)")
check "the nook: TMNT's card" found "$(has "326 works $DOT 14 sections $DOT 38 owned" "$PLAIN")"
check "the nook: the Watch List's card" found "$(has "61 works $DOT 1 owned $DOT from Letterboxd" "$PLAIN")"
check "the nook: Stephen King's card" found "$(has "11 works $DOT 2 owned $DOT from Letterboxd" "$PLAIN")"
PAGE=$(as_a "/shelves/$TMNT")
check "TMNT: #1's mark" found "$(has "owned $DOT via Ultimate Collection 1" "$(text "$PAGE")")"
check "TMNT: the marks" 38 "$(count_of shelf-mark "$PAGE")"
check "Stephen King: the marks" 2 "$(count_of shelf-mark "$(as_a "/shelves/$KING")")"
check "the Watch List: the marks" 1 "$(count_of shelf-mark "$(as_a "/shelves/$WATCH")")"

# 19. The count block
count_block() { # label
  tally "$1" 10 11 $((455 + N - 62)) 1
  check "$1 a stranger's copies" 0 "$(copies_of "$STRANGER")"
  check "$1 the five manual printings' copies" 5 "$(P "select count(*) from copies c join edition_sources s on s.edition = c.edition where s.source = 'manual'")"
  check "$1 printings with no source: the Blu-ray's, #1's, #33's, Salem's Lot's" 4 "$(P 'select count(*) from editions where id not in (select edition from edition_sources)')"
  reads "$1" 10 10 311
}
count_block "the count block:"

# 20. Older copies: one statement, so the 41 share a created_at and the keyset's
# tie-break is what pages them
P "insert into copies (owner, edition, note) select '$ACCOUNT', '$PB', 'filler' from generate_series(1, 41)" >/dev/null
reads "with the filler:" 51 10 311
PAGE=$(as_a /collection)
check "with the filler: rows" 50 "$(count_of collection-row "$PAGE")"
check "with the filler: Older copies" found "$(has "Older copies" "$(text "$PAGE")")"
OLDER=$(grep -oE 'href="/collection\?before=[^"]*"' <<<"$PAGE" | head -1 | sed -e 's/^href="//' -e 's/"$//' -e 's/&amp;/\&/g')
PAGE=$(as_a "$OLDER")
check "behind Older copies: rows" 1 "$(count_of collection-row "$PAGE")"
check "behind Older copies: no more" missing "$(has "Older copies" "$(text "$PAGE")")"
by_hand step_older
P "delete from copies where owner = '$ACCOUNT' and note = 'filler'" >/dev/null
reads "the filler gone:" 10 10 311

# 21. A14's eleven reds, each with your copies as they were after it
after_red() { check "  your copies" 10 "$(copies_of "$EMAIL")"; }

check "A14 1: dvd on a book" 400 "$(call "$JAR_A" POST /api/v1/copies "{\"item\":\"$C\",\"format\":\"dvd\"}")"
check "  at format, naming the four" "A book comes as paperback, hardcover, ebook or audiobook." "$(field error.fields.format)"
after_red
check "A14 2: condition mint" 400 "$(call "$JAR_A" POST /api/v1/copies "{\"edition\":\"$PB\",\"condition\":\"mint\"}")"
check "  at condition" "A condition is new, fine, good, fair or poor." "$(field error.fields.condition)"
after_red
TOMORROW=$(date -d tomorrow +%F)
check "A14 3: tomorrow" 400 "$(call "$JAR_A" POST /api/v1/copies "{\"edition\":\"$PB\",\"acquiredOn\":\"$TOMORROW\"}")"
check "  its sentence" "A day you'll have it isn't a day you have it." "$(field error.fields.acquiredOn)"
after_red
check "A14 4: February 30th" 400 "$(call "$JAR_A" POST /api/v1/copies "{\"edition\":\"$PB\",\"acquiredOn\":\"2026-02-30\"}")"
check "  at acquiredOn" "A date as YYYY-MM-DD." "$(field error.fields.acquiredOn)"
after_red
LONG=$(printf 'x%.0s' $(seq 1 2001))
check "A14 5: 2,001 characters" 400 "$(call "$JAR_A" POST /api/v1/copies "{\"edition\":\"$PB\",\"note\":\"$LONG\"}")"
check "  at note" "At most 2,000 characters." "$(field error.fields.note)"
after_red
SECOND=$(P "insert into editions (item, format) values ('$C', 'paperback') returning id")
check "A14 6: two paperbacks" 409 "$(call "$JAR_A" POST /api/v1/copies "{\"item\":\"$C\",\"format\":\"paperback\"}")"
check "  its sentence" "This work has 2 paperback printings in the catalog. Pick one on its page." "$(field error.message)"
P "delete from editions where id = '$SECOND'" >/dev/null
check "  the row taken back" 11 "$(P 'select count(*) from editions')"
after_red
check "A14 7: a backup" 400 "$(call "$JAR_A" POST /api/v1/copies "{\"item\":\"$K\",\"format\":\"floppy\"}")"
check "  its sentence" "A backup story is owned through the comic it's printed in." "$(field error.fields.item)"
after_red
check "A14 8: PATCH a stranger's way" 404 "$(call "$JAR_B" PATCH "/api/v1/copies/$PC" '{"note":"mine"}')"
check "  DELETE a stranger's way" 404 "$(call "$JAR_B" DELETE "/api/v1/copies/$PC")"
check "  the note unchanged" "The one with the Sissy Spacek cover." "$(P "select note from copies where id = '$PC'")"
after_red
call "$JAR_B" GET "/api/v1/copies?item=$C" >/dev/null
check "A14 9: GET Carrie as a stranger" '{"held":[],"via":[]}' "$(cat "$OUT")"
call "$JAR_B" GET "/api/v1/copies?item=$T1" >/dev/null
check "  GET #1 as a stranger" '{"held":[],"via":[]}' "$(cat "$OUT")"
after_red
# 10 and 11, by Playwright: the spec calls no provider, and makes its own account
# and rows. Outside test-results, which Playwright empties.
check "A14 10 and 11: the tick's two" 0 "$(npx playwright test tests/e2e/series-ticks.spec.ts -g 'A14' >browse-results/1.7.3-a14.txt 2>&1; echo $?)"
check "  the report says so" 1 "$(grep -c '2 passed' browse-results/1.7.3-a14.txt)"
after_red

# 22. Two copies of one printing are two rows; and the rest of A3's answers
check "a second copy of one printing" 201 "$(call "$JAR_A" POST /api/v1/copies "{\"edition\":\"$PB\"}")"
TWO=$(field id)
check "  your copies" 11 "$(copies_of "$EMAIL")"
PAGE=$(as_a "/items/$C")
check "  Carrie: you hold 2" found "$(has "1 in the catalog $DOT you hold 2" "$(text "$PAGE")")"
check "  Carrie: two lines" 2 "$(count_of copy "$PAGE")"
check "  taken back" 204 "$(call "$JAR_A" DELETE "/api/v1/copies/$TWO")"
check "  your copies again" 10 "$(copies_of "$EMAIL")"
check "an empty PATCH" 400 "$(call "$JAR_A" PATCH "/api/v1/copies/$PC" '{}')"
check "  its sentence" found "$(has "Nothing to change." "$(cat "$OUT")")"
check "POST with no cookie" 401 "$(code -X POST "$APP/api/v1/copies" -H 'content-type: application/json' -d '{}')"
check "POST off JSON" 415 "$(code -b "$JAR_A" -X POST "$APP/api/v1/copies" -H 'content-type: text/plain' -d 'x')"

# 23. The count block again, and back to a clean database, so test:db starts from nothing
count_block "the count block again:"

by_hand step_stop
require "dev server down" 000 "$(code "$APP/")"
check "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"
check "no account left" 0 "$(P 'select count(*) from auth.users')"

summary
[ "$failed" -eq 0 ]
