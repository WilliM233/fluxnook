#!/usr/bin/env bash
# Browse 1.7.2, ticks and marks (#90). The hands: the 1984 run through its
# sheet on live Comic Vine, #1 and #33 ticked and #33 let go, It's ISBN with the
# box on, Carrie's ISBN read back. The script makes what those read (Carrie's
# printing and copy), reads the shelf's marks, times the TMNT page, and runs
# A14's two tick reds. L's hands walk once, at 1.7.3's exit Browse; this one is
# the Binder's run. Git Bash, from a clean tree, with the local stack up and the
# dev server stopped. Run it as:
#   BROWSE_EMAIL=<your address> bash scripts/browse/1.7.2.sh
#
# Every check prints its name, what was expected, what came back, and pass or
# fail. A precondition that fails ends the run there with the summary. A step
# for your hands prints one action per line and waits for Enter. Every step
# is written to browse-results/1.7.2-steps.md before the first pause. The
# report is browse-results/1.7.2.txt.

set -u
cd "$(dirname "$0")/../.." || exit 1

APP=http://localhost:3000
MAILPIT=http://127.0.0.1:54324
REPORT=browse-results/1.7.2.txt
STEPS=browse-results/1.7.2-steps.md
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

# How many of a test id a page renders: the attribute as HTML writes it is in
# the HTML only, never in the payload, so the count is the elements.
count_of() { grep -o "data-testid=\"$1\"" <<<"$2" | wc -l | tr -d ' '; }

# The boxes the server sends disabled (pick 3).
disabled_boxes() { grep -oE '<input[^>]*data-testid="tick"[^>]*disabled=""' <<<"$1" | wc -l | tr -d ' '; }

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

# ---- The steps for your hands. Each prints one action per line.

step_server() {
  echo "Step 1, by hand: the dev server"
  echo ""
  echo "In another terminal, start it:"
  echo "    npm run dev"
  echo ""
  echo "Wait for Ready."
}

step_run() {
  echo "Step 2, by hand: the 1984 run, through its sheet"
  echo ""
  echo "In the browser, sign in at $APP with:"
  echo "    $EMAIL"
  echo "(the link is the newest mail in Mailpit, $MAILPIT)"
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
}

step_one() {
  echo "Step 3, by hand: tick #1"
  echo ""
  echo "#1's box is empty. Under it:"
  echo "    via Ultimate Collection 1"
  echo "Tick it. It reads:"
  echo "    Owned $DOT Floppy"
  echo "    also via Ultimate Collection 1"
  echo "The heading doesn't move."
}

step_tick_33() {
  echo "Step 4, by hand: tick #33"
  echo ""
  echo "#33 has no via line. Tick it. It reads:"
  echo "    Owned $DOT Floppy"
  echo "The heading reads:"
  echo "    you hold 34, 33 of them via a collection"
}

step_untick_33() {
  echo "Step 5, by hand: let #33 go"
  echo ""
  echo "Untick #33. No confirm. The box is empty."
  echo "The heading reads:"
  echo "    you hold 33, 33 of them via a collection"
  echo "Under Collected in, Ultimate Collection 1 to 5 each end:"
  echo "    Your copy"
}

step_it() {
  echo "Step 6, by hand: It's ISBN, with the box on"
  echo ""
  echo "Open $APP/search and type:"
  echo "    $IT_ISBN"
  echo "The box reads and I own it, and it's off."
  echo "Tick it."
  echo "Click Add this edition."
  echo "It's page opens. Editions reads:"
  echo "    1 in the catalog $DOT you hold 1"
  echo "Under the paperback:"
  echo "    Your copy"
}

step_carrie() {
  echo "Step 7, by hand: Carrie's ISBN, a printing you hold"
  echo ""
  echo "Open $APP/search and type:"
  echo "    $CARRIE_ISBN"
  echo "The card reads:"
  echo "    This edition is in your catalog"
  echo "    In your collection"
  echo "The box is ticked and disabled."
}

step_stop() {
  echo "Step 8, by hand: stop the dev server"
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

say "Browse 1.7.2, ticks and marks"
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
C=$(work manual carrie-1974)
TMNT=$(shelf "TMNT, the Mirage run")
KING=$(shelf "Stephen King, publication order")

{
  echo "# Browse 1.7.2, the steps for your hands"
  echo ""
  echo "Eight: the dev server's start, six in the browser, its stop."
  for step in step_server step_run step_one step_tick_33 step_untick_33 step_it \
    step_carrie step_stop; do
    block "$step"
  done
} >"$STEPS"

# 1. The load, by the database
tally "loaded:" 5 5 454 0

by_hand step_server
require "dev server up" 200 "$(code "$APP/")"
require "the script's own session" "$APP/nook" "$(sign_in "$EMAIL" "$JAR_A")"
require "a stranger's session" "$APP/nook" "$(sign_in "$STRANGER" "$JAR_B")"

# 2. The shelf's marks, and the TMNT page's warm hit (A12)
as_a "/shelves/$TMNT" >/dev/null
measured "the TMNT shelf, warm: seconds and bytes (0.177 s and 1,255,923 bytes at the census; the index Deferral's trigger is 0.5 s, the 1.6 Deferral's 1 s)" "$(curl -s -b "$JAR_A" -o /dev/null -w '%{time_total} %{size_download}' "$APP/shelves/$TMNT")"
PAGE=$(as_a "/shelves/$TMNT")
check "TMNT: the marks" 38 "$(count_of shelf-mark "$PAGE")"
for n in 1 2 3 4 5; do
  check "TMNT: via Ultimate Collection $n" found "$(has "via Ultimate Collection $n" "$(text "$PAGE")")"
done
check "TMNT: owned as a mark" 0 "$(grep -c 'data-testid="shelf-mark"[^>]*>owned<' <<<"$PAGE")"
check "TMNT as a stranger" 404 "$(code -b "$JAR_B" "$APP/shelves/$TMNT")"

# 3. The script makes what step 7 reads: Carrie's printing, and a copy of it
check "Carrie's ISBN looked up" 200 "$(call "$JAR_A" GET /api/v1/providers/openlibrary/isbn/9780307743664)"
KEY_PB=$(field edition.key)
check "Carrie's printing imported" 201 "$(call "$JAR_A" POST /api/v1/editions/import "{\"source\":\"openlibrary\",\"key\":\"$KEY_PB\",\"format\":\"paperback\",\"attachTo\":\"$C\"}")"
PB=$(field id)
check "her copy" 201 "$(call "$JAR_A" POST /api/v1/copies "{\"edition\":\"$PB\"}")"
tally "after Carrie:" 6 6 454 0
PAGE=$(as_a "/shelves/$KING")
check "the King shelf's mark" 1 "$(count_of shelf-mark "$PAGE")"
check "owned as a mark" 1 "$(grep -c 'data-testid="shelf-mark"[^>]*>owned<' <<<"$PAGE")"

# 4. The run, on live Comic Vine (C9's step 7)
by_hand step_run

S=$(P "select series from series_sources where source = 'comicvine' and key = 'volume/20281'")
N=$(P "select count(*) from item_comics where series_id = '$S'")
measured "the 1984 run's issues, live (stub 62)" "$N"
tally "after the run:" 6 6 $((454 + N - 62)) 1
PAGE=$(as_a "/series/$S")
check "the heading" found "$(has "$(holding_line 33)" "$(text "$PAGE")")"
check "the boxes" "$N" "$(count_of tick "$PAGE")"
check "the boxes the server sends disabled" "$N" "$(disabled_boxes "$PAGE")"
check "via lines" 33 "$(count_of tile-via "$PAGE")"
check "#1's via" found "$(has "via Ultimate Collection 1" "$(text "$PAGE")")"
check "no also via yet" missing "$(has "also via" "$(text "$PAGE")")"
check "the closing line" found "$(has "A tick makes a floppy of that issue yours; untick to let it go." "$(text "$PAGE")")"
check "Your copy" found "$(has "Your copy" "$(text "$PAGE")")"
check "no I own this: the five are held" missing "$(has "I own this" "$(text "$PAGE")")"
check "the old sentence" missing "$(has "comes with the collection chapter" "$PAGE")"
PAGE=$(as_b "/series/$S")
check "a stranger: the heading's count" found "$(has "$N in the catalog, in cover-date order" "$(text "$PAGE")")"
check "a stranger: no holding" missing "$(has "$DOT you hold" "$(text "$PAGE")")"
check "a stranger: no via lines" 0 "$(count_of tile-via "$PAGE")"
check "a stranger: no Your copy" missing "$(has "Your copy" "$(text "$PAGE")")"
check "a stranger: I own this" found "$(has "I own this" "$(text "$PAGE")")"

# 5. Tick #1: a work held and via counts once
by_hand step_one

tally "after #1:" 7 7 $((454 + N - 62)) 1
check "#1's printing" "floppy||||" "$(P "select format, title, publisher, pages, released_on from editions where item = '$T1' and format = 'floppy'")"
check "#1's printing has no source" 0 "$(P "select count(*) from edition_sources s join editions e on e.id = s.edition where e.item = '$T1'")"
check "#1's copy" "null||private" "$(P "select coalesce(c.condition, 'null'), c.note, c.visibility from copies c join editions e on e.id = c.edition where e.item = '$T1'")"
series_reads "after #1:" 33
PAGE=$(text "$(as_a "/series/$S")")
check "after #1: the label" found "$(has "Owned $DOT Floppy" "$PAGE")"
check "after #1: also via" found "$(has "also via Ultimate Collection 1" "$PAGE")"
PAGE=$(text "$(as_a "/items/$T1")")
check "#1's Editions" found "$(has "1 in the catalog $DOT you hold 1" "$PAGE")"
check "#1's via line" found "$(has "Owned via Ultimate Collection 1 (Hardcover)" "$PAGE")"
marks "after #1:" 38
check "after #1: its mark" found "$(has "owned $DOT via Ultimate Collection 1" "$(text "$(as_a "/shelves/$TMNT")")")"

# 6. Tick #33: no via, so the holding moves
by_hand step_tick_33

tally "after #33:" 8 8 $((454 + N - 62)) 1
series_reads "after #33:" 34
marks "after #33:" 39

# 7. Untick #33: bare, so no confirm; the printing stays (A3)
by_hand step_untick_33

tally "after the untick:" 7 8 $((454 + N - 62)) 1
series_reads "after the untick:" 33
marks "after the untick:" 38
PAGE=$(text "$(as_a "/items/$T33")")
check "#33's Editions" found "$(has "1 in the catalog $DOT none yours" "$PAGE")"
check "#33's I own this" found "$(has "I own this" "$PAGE")"

# 8. It's ISBN with the box on (C9's step 10)
by_hand step_it

tally "after It:" 8 9 $((455 + N - 62)) 1
IT_ED=$(P "select edition from edition_sources where source = 'isbn' and key = '9781501142970'")
IT=$(P "select item from editions where id = '$IT_ED'")
check "It's printing" paperback "$(P "select format from editions where id = '$IT_ED'")"
check "It's copy" "null|t" "$(P "select coalesce(c.condition, 'null'), u.email = '$EMAIL' from copies c join auth.users u on u.id = c.owner where c.edition = '$IT_ED'")"
PAGE=$(text "$(as_a "/items/$IT")")
check "It's Editions" found "$(has "1 in the catalog $DOT you hold 1" "$PAGE")"
check "It's line" found "$(has "Your copy" "$PAGE")"
check "It's publisher" found "$(has "Scribner" "$PAGE")"

# 9. Carrie's ISBN read back (C9's step 11). The card is the hands'; A4 is what it reads
by_hand step_carrie

check "A4 on Carrie" 200 "$(call "$JAR_A" GET "/api/v1/copies?item=$C")"
check "you hold one" 1 "$(field held.length)"
check "of that printing" "$PB" "$(field held.0.editionId)"
call "$JAR_B" GET "/api/v1/copies?item=$C" >/dev/null
check "A4 on Carrie, as a stranger" '{"held":[],"via":[]}' "$(cat "$OUT")"
tally "after Carrie's card:" 8 9 $((455 + N - 62)) 1

# 10. A14's two tick reds, by Playwright: the spec calls no provider, and makes
# its own account and rows. Outside test-results, which Playwright empties.
check "A14's two reds" 0 "$(npx playwright test tests/e2e/series-ticks.spec.ts -g 'A14' >browse-results/1.7.2-a14.txt 2>&1; echo $?)"
check "the report says so" 1 "$(grep -c '2 passed' browse-results/1.7.2-a14.txt)"

# 11. The count block
tally "the count block:" 8 9 $((455 + N - 62)) 1
check "a stranger's copies" 0 "$(copies_of "$STRANGER")"
check "the five manual printings' copies" 5 "$(P "select count(*) from copies c join edition_sources s on s.edition = c.edition where s.source = 'manual'")"
check "printings with no source: #1's and #33's floppies" 2 "$(P 'select count(*) from editions where id not in (select edition from edition_sources)')"

# 12. Back to a clean database, so test:db starts from nothing
by_hand step_stop
require "dev server down" 000 "$(code "$APP/")"
check "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"

summary
[ "$failed" -eq 0 ]
