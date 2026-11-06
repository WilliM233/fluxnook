#!/usr/bin/env bash
# Browse 1.7.1, copies (#89). The hands: Carrie's ISBN through the match sheet,
# the paperback owned on the sheet, the hardcover made, removed and owned again
# with one click, the 1976 film on Blu-ray. The script reads the fixture's own
# five first (TMNT #1's via, the backup's hop) and runs A14's nine API reds and
# the two rows of one printing. L's hands walk once, at 1.7.3's exit Browse;
# this one is the Binder's run. Git Bash, from a clean tree, with the local
# stack up and the dev server stopped. Run it as:
#   BROWSE_EMAIL=<your address> bash scripts/browse/1.7.1.sh
#
# Every check prints its name, what was expected, what came back, and pass or
# fail. A precondition that fails ends the run there with the summary. A step
# for your hands prints one action per line and waits for Enter. Every step
# is written to browse-results/1.7.1-steps.md before the first pause. The
# report is browse-results/1.7.1.txt.

set -u
cd "$(dirname "$0")/../.." || exit 1

APP=http://localhost:3000
MAILPIT=http://127.0.0.1:54324
REPORT=browse-results/1.7.1.txt
STEPS=browse-results/1.7.1-steps.md
ISBN=978-0-307-74366-4
# A middle dot, as bytes: a literal one in an argument to a Windows program
# reaches it in the console's code page, not UTF-8 (1.5.1).
DOT=$(printf '\302\267')
NOTE="The one with the Sissy Spacek cover."
TOMORROW=$(date -d tomorrow +%F)

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

# How many copy lines a page renders: the attribute is in the HTML only, never
# in the payload, so the count is the lines.
lines_on() { grep -o 'data-testid="copy"' <<<"$1" | wc -l | tr -d ' '; }

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

# A value from the last call's body by a dotted path ("id", "error.fields.note").
field() {
  node.exe -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let v=JSON.parse(s);for(const k of process.argv[1].split("."))v=v==null?v:v[k];console.log(v===undefined?"(none)":typeof v==="object"?JSON.stringify(v):v)})' "$1" <"$OUT" |
    tr -d '\r'
}

as_a() { curl -s -b "$JAR_A" "$APP$1"; }
as_b() { curl -s -b "$JAR_B" "$APP$1"; }

# The Browse account's rows, so no other account's ever move a count.
copies_of() { P "select count(*) from copies c join auth.users u on u.id = c.owner where u.email = '$1'"; }

tally() { # label, copies, editions
  check "$1 your copies" "$2" "$(copies_of "$EMAIL")"
  check "$1 editions" "$3" "$(P 'select count(*) from editions')"
  check "$1 items" 454 "$(P 'select count(*) from items')"
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

step_isbn() {
  echo "Step 2, by hand: Carrie's ISBN, through the match sheet"
  echo ""
  echo "In the browser, sign in at $APP with:"
  echo "    $EMAIL"
  echo "(the link is the newest mail in Mailpit, $MAILPIT)"
  echo ""
  echo "Open $APP/search and type:"
  echo "    $ISBN"
  echo "The card shows Paperback."
  echo "Click Add this edition."
  echo "The sheet reads:"
  echo "    Looks like one you have"
  echo "Click:"
  echo "    Same, add the Open Library details to it"
  echo "Carrie's page opens. Editions reads:"
  echo "    1 in the catalog $DOT none yours"
}

step_paperback() {
  echo "Step 3, by hand: own the paperback, through the sheet"
  echo ""
  echo "Click Own a copy."
  echo "Format lists, in order:"
  echo "    Paperback $DOT Anchor Books, 2011"
  echo "    a rule"
  echo "    Hardcover"
  echo "    Ebook"
  echo "    Audiobook"
  echo "Keep the paperback."
  echo "Condition: Good."
  echo "Acquired: 2019-03-12."
  echo "Note:"
  echo "    $NOTE"
  echo "Click Add it. Under the paperback:"
  echo "    Your copy"
  echo "    Good $DOT since 12 March 2019"
  echo "    $NOTE"
  echo "The heading reads:"
  echo "    1 in the catalog $DOT you hold 1"
}

step_hardcover() {
  echo "Step 4, by hand: a format the catalog lacks"
  echo ""
  echo "Click Own a copy."
  echo "Format: Hardcover."
  echo "Click Add it. A Hardcover row, with Your copy alone under it."
  echo "The heading reads:"
  echo "    2 in the catalog $DOT you hold 2"
}

step_remove() {
  echo "Step 5, by hand: let the hardcover's copy go"
  echo ""
  echo "On the hardcover's line, click Remove."
  echo "The sheet reads:"
  echo "    Let go of this copy?"
  echo "Click Remove."
  echo "The Hardcover row stays and ends in I own this."
  echo "The heading reads:"
  echo "    2 in the catalog $DOT you hold 1"
}

step_own_this() {
  echo "Step 6, by hand: one click"
  echo ""
  echo "On the Hardcover row, click I own this."
  echo "No sheet. Your copy alone under it."
  echo "The heading reads:"
  echo "    2 in the catalog $DOT you hold 2"
}

step_film() {
  echo "Step 7, by hand: a film has printings too"
  echo ""
  echo "Open:"
  echo "    $APP/items/$F"
  echo "Editions reads:"
  echo "    None in the catalog yet."
  echo "Click Own a copy."
  echo "Format lists DVD, Blu-ray, 4K, Digital."
  echo "Format: Blu-ray."
  echo "Condition: Fine."
  echo "Click Add it. A Blu-ray row. Under it:"
  echo "    Your copy"
  echo "    Fine"
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

say "Browse 1.7.1, copies"
say "at $(git log -1 --oneline), $(date '+%Y-%m-%d %H:%M')"
say "The steps for your hands are in $STEPS once the fixtures load."
say ""

# 0. Where the walk starts; each of these ends the run when it fails
require "tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"
require "stack up" 0 "$(npx supabase status >/dev/null 2>&1; echo $?)"
require "dev server down before the reset" 000 "$(code "$APP/")"
require "Open Library reachable" 302 "$(code -A 'Fluxnook dev' https://openlibrary.org/isbn/9780307743664.json)"
require "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"

# The steps name the works by id, which the load makes, and the load needs your
# account, which a sign-in makes. GoTrue makes it here without the dev server,
# by sending you a link, so every step is written before the first pause (1.6.2
# D9). The link it sends is spare; sign in from the one you ask for.
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
U=$(work manual tmnt-ultimate-collection-1)
K=$(work manual tmnt-mirage-backup-you-had-to-be-there)

{
  echo "# Browse 1.7.1, the steps for your hands"
  echo ""
  echo "Eight: the dev server's start, six in the browser, its stop."
  for step in step_server step_isbn step_paperback step_hardcover step_remove \
    step_own_this step_film step_stop; do
    block "$step"
  done
} >"$STEPS"

# 1. The load, by the database
tally "loaded:" 5 5
check "loaded: copies with a condition" 0 "$(P 'select count(*) from copies where condition is not null')"
check "loaded: the check" 1 "$(P "select count(*) from pg_constraint where conname = 'copies_condition'")"

by_hand step_server
require "dev server up" 200 "$(code "$APP/")"
require "the script's own session" "$APP/nook" "$(sign_in "$EMAIL" "$JAR_A")"
require "a stranger's session" "$APP/nook" "$(sign_in "$STRANGER" "$JAR_B")"

# 2. The fixture's five as the pages read them (A13 in part)
PAGE=$(text "$(as_a "/items/$T")")
check "TMNT #1: the via line" found "$(has "Owned via Ultimate Collection 1 (Hardcover)" "$PAGE")"
check "TMNT #1: the row's Your copy" found "$(has "Your copy" "$PAGE")"
check "TMNT #1: the note" found "$(has "One you hold covers this issue." "$PAGE")"
check "TMNT #1: the old sentence" missing "$(has "comes with the collection chapter" "$PAGE")"
PAGE=$(text "$(as_b "/items/$T")")
check "TMNT #1 as a stranger: I own this" found "$(has "I own this" "$PAGE")"
check "TMNT #1 as a stranger: no via" missing "$(has "Owned via" "$PAGE")"
check "TMNT #1 as a stranger: no copy" missing "$(has "Your copy" "$PAGE")"
PAGE=$(text "$(as_a "/items/$K")")
check "the backup: its sentence" found "$(has "A backup story is owned through the comic it's printed in." "$PAGE")"
check "the backup: its host" found "$(has "Yours via All is Revealed (Hardcover)" "$PAGE")"
check "the backup: no Own a copy" missing "$(has "Own a copy" "$PAGE")"
check "the backup as a stranger: no host" missing "$(has "Yours via" "$(text "$(as_b "/items/$K")")")"
check "Ultimate Collection 1: the heading" found "$(has "1 in the catalog $DOT you hold 1" "$(text "$(as_a "/items/$U")")")"
check "Ultimate Collection 1 as a stranger" found "$(has "1 in the catalog $DOT none yours" "$(text "$(as_b "/items/$U")")")"
PAGE=$(text "$(as_a "/items/$C")")
check "Carrie: none yet" found "$(has "None in the catalog yet." "$PAGE")"
check "Carrie: Own a copy" found "$(has "Own a copy" "$PAGE")"
PAGE=$(text "$(as_a "/items/$F")")
check "the 1976 film: none yet" found "$(has "None in the catalog yet." "$PAGE")"
check "the 1976 film: Own a copy" found "$(has "Own a copy" "$PAGE")"

# 3. A4 on the fixture
check "GET TMNT #1" 200 "$(call "$JAR_A" GET "/api/v1/copies?item=$T")"
check "GET TMNT #1: held" '[]' "$(field held)"
check "GET TMNT #1: the via's title" "Ultimate Collection 1" "$(field via.0.title)"
check "GET TMNT #1: the via's format" hardcover "$(field via.0.format)"
call "$JAR_A" GET "/api/v1/copies?item=$U" >/dev/null
check "GET Ultimate Collection 1: held" hardcover "$(field held.0.format)"
call "$JAR_A" GET "/api/v1/copies?item=$K" >/dev/null
check "GET the backup: the via's title" "Ultimate Collection 1" "$(field via.0.title)"
check "GET off a uuid" 400 "$(call "$JAR_A" GET "/api/v1/copies?item=nope")"
check "GET with no cookie" 401 "$(code "$APP/api/v1/copies?item=$T")"

# 4. The walk
by_hand step_isbn
tally "after Carrie's ISBN:" 5 6
check "the printing's work is Carrie" "$C" "$(P "select e.item from editions e join edition_sources s on s.edition = e.id where s.source = 'isbn' and s.key = '9780307743664'")"
PAGE=$(text "$(as_a "/items/$C")")
check "Carrie's heading" found "$(has "1 in the catalog $DOT none yours" "$PAGE")"
check "Carrie's printing, live from Open Library" found "$(has "Anchor Books" "$PAGE")"
check "Carrie's I own this" found "$(has "I own this" "$PAGE")"

by_hand step_paperback
tally "after the paperback:" 6 6
PB=$(P "select e.id from editions e where e.item = '$C' and e.format = 'paperback'")
PC=$(P "select id from copies where edition = '$PB'")
check "the copy's condition" good "$(P "select condition from copies where id = '$PC'")"
check "the copy's day" 2019-03-12 "$(P "select acquired_on from copies where id = '$PC'")"
HTML=$(as_a "/items/$C")
PAGE=$(text "$HTML")
check "Carrie's heading" found "$(has "1 in the catalog $DOT you hold 1" "$PAGE")"
check "the copy's line" found "$(has "Good $DOT since 12 March 2019" "$PAGE")"
check "the copy's note" found "$(has "$NOTE" "$PAGE")"

by_hand step_hardcover
tally "after the hardcover:" 7 7
HC=$(P "select id from editions where item = '$C' and format = 'hardcover'")
check "the made printing's other columns" "|||" "$(P "select title, publisher, pages, released_on from editions where id = '$HC'")"
check "the made printing's sources" 0 "$(P "select count(*) from edition_sources where edition = '$HC'")"
HTML=$(as_a "/items/$C")
check "Carrie's heading" found "$(has "2 in the catalog $DOT you hold 2" "$(text "$HTML")")"
check "Carrie's copy lines" 2 "$(lines_on "$HTML")"

by_hand step_remove
tally "after Remove:" 6 7
HTML=$(as_a "/items/$C")
check "Carrie's heading" found "$(has "2 in the catalog $DOT you hold 1" "$(text "$HTML")")"
check "Carrie's copy lines" 1 "$(lines_on "$HTML")"
check "the hardcover's I own this" found "$(has "I own this" "$(text "$HTML")")"

by_hand step_own_this
tally "after I own this:" 7 7
HTML=$(as_a "/items/$C")
check "Carrie's heading" found "$(has "2 in the catalog $DOT you hold 2" "$(text "$HTML")")"
check "Carrie's copy lines" 2 "$(lines_on "$HTML")"

by_hand step_film
tally "after the film:" 8 8
check "the film's printing" blu-ray "$(P "select format from editions where item = '$F'")"
check "the film's copy" "fine|" "$(P "select c.condition, c.acquired_on from copies c join editions e on e.id = c.edition where e.item = '$F'")"
PAGE=$(text "$(as_a "/items/$F")")
check "the film's heading" found "$(has "1 in the catalog $DOT you hold 1" "$PAGE")"
check "the film's row" found "$(has "Blu-ray" "$PAGE")"
check "the film's copy line" found "$(has "Your copy" "$PAGE")"
check "the film's condition" found "$(has "Fine" "$PAGE")"

# 5. A14's nine API reds, each leaving the count where it was
holds() { check "$1: your copies" 8 "$(copies_of "$EMAIL")"; }

check "red 1, dvd on a book" 400 "$(call "$JAR_A" POST /api/v1/copies "{\"item\":\"$C\",\"format\":\"dvd\"}")"
check "red 1, its sentence" "A book comes as paperback, hardcover, ebook or audiobook." "$(field error.fields.format)"
holds "red 1"
check "red 2, mint" 400 "$(call "$JAR_A" POST /api/v1/copies "{\"edition\":\"$PB\",\"condition\":\"mint\"}")"
check "red 2, its sentence" "A condition is new, fine, good, fair or poor." "$(field error.fields.condition)"
holds "red 2"
check "red 3, tomorrow" 400 "$(call "$JAR_A" POST /api/v1/copies "{\"edition\":\"$PB\",\"acquiredOn\":\"$TOMORROW\"}")"
check "red 3, its sentence" "A day you'll have it isn't a day you have it." "$(field error.fields.acquiredOn)"
holds "red 3"
check "red 4, February 30th" 400 "$(call "$JAR_A" POST /api/v1/copies "{\"edition\":\"$PB\",\"acquiredOn\":\"2026-02-30\"}")"
check "red 4, its field" "A date as YYYY-MM-DD." "$(field error.fields.acquiredOn)"
holds "red 4"
LONG=$(printf 'x%.0s' $(seq 1 2001))
check "red 5, 2,001 characters" 400 "$(call "$JAR_A" POST /api/v1/copies "{\"edition\":\"$PB\",\"note\":\"$LONG\"}")"
check "red 5, its sentence" "At most 2,000 characters." "$(field error.fields.note)"
holds "red 5"
SECOND=$(P "insert into editions (item, format) values ('$C', 'hardcover') returning id")
check "red 6, a second hardcover" 9 "$(P 'select count(*) from editions')"
check "red 6, two printings" 409 "$(call "$JAR_A" POST /api/v1/copies "{\"item\":\"$C\",\"format\":\"hardcover\"}")"
check "red 6, its sentence" "This work has 2 hardcover printings in the catalog. Pick one on its page." "$(field error.message)"
holds "red 6"
P "delete from editions where id = '$SECOND'" >/dev/null
check "red 6, the row gone" 8 "$(P 'select count(*) from editions')"
check "red 7, a backup" 400 "$(call "$JAR_A" POST /api/v1/copies "{\"item\":\"$K\",\"format\":\"floppy\"}")"
check "red 7, its sentence" "A backup story is owned through the comic it's printed in." "$(field error.fields.item)"
holds "red 7"
check "red 8, a stranger's PATCH" 404 "$(call "$JAR_B" PATCH "/api/v1/copies/$PC" '{"note":"mine"}')"
check "red 8, a stranger's DELETE" 404 "$(call "$JAR_B" DELETE "/api/v1/copies/$PC")"
check "red 8, the note unchanged" "$NOTE" "$(P "select note from copies where id = '$PC'")"
holds "red 8"
check "red 9, a stranger's GET of Carrie" 200 "$(call "$JAR_B" GET "/api/v1/copies?item=$C")"
check "red 9, empty" '{"held":[],"via":[]}' "$(cat "$OUT")"
call "$JAR_B" GET "/api/v1/copies?item=$T" >/dev/null
check "red 9, empty on TMNT #1" '{"held":[],"via":[]}' "$(cat "$OUT")"
holds "red 9"

# 6. Two rows of one printing, and a PATCH
check "a second copy of the paperback" 201 "$(call "$JAR_A" POST /api/v1/copies "{\"edition\":\"$PB\"}")"
TWO=$(field id)
check "two rows" 9 "$(copies_of "$EMAIL")"
HTML=$(as_a "/items/$C")
check "Carrie's heading" found "$(has "2 in the catalog $DOT you hold 3" "$(text "$HTML")")"
check "Carrie's copy lines" 3 "$(lines_on "$HTML")"
check "DELETE it" 204 "$(call "$JAR_A" DELETE "/api/v1/copies/$TWO")"
check "one row" 8 "$(copies_of "$EMAIL")"
check "Carrie's heading" found "$(has "2 in the catalog $DOT you hold 2" "$(text "$(as_a "/items/$C")")")"

check "PATCH to fair" 200 "$(call "$JAR_A" PATCH "/api/v1/copies/$PC" '{"condition":"fair"}')"
check "its answer" fair "$(field condition)"
check "its version" yes "$([ -n "$(field updatedAt)" ] && [ "$(field updatedAt)" != "(none)" ] && echo yes || echo no)"
check "the page" found "$(has "Fair $DOT since 12 March 2019" "$(text "$(as_a "/items/$C")")")"
check "PATCH back to good" 200 "$(call "$JAR_A" PATCH "/api/v1/copies/$PC" '{"condition":"good"}')"
check "PATCH nothing" 400 "$(call "$JAR_A" PATCH "/api/v1/copies/$PC" '{}')"
check "its sentence" "Nothing to change." "$(field error.fields.form)"
check "POST with no cookie" 401 "$(code -X POST "$APP/api/v1/copies" -H 'content-type: application/json' -d '{}')"
check "POST off JSON" 415 "$(code -b "$JAR_A" -X POST "$APP/api/v1/copies" -H 'content-type: text/plain' -d 'x')"

# 7. The count block
check "your copies" 8 "$(copies_of "$EMAIL")"
check "a stranger's copies" 0 "$(copies_of "$STRANGER")"
check "the five manual printings' copies" 5 "$(P "select count(*) from copies c join edition_sources s on s.edition = c.edition where s.source = 'manual'")"
check "editions" 8 "$(P 'select count(*) from editions')"
check "items" 454 "$(P 'select count(*) from items')"

# 8. A5 on a fresh account beside this one
check "test:db collection-owned" 0 "$(npm run test:db -- tests/db/collection-owned.test.ts >/dev/null 2>&1; echo $?)"

# 9. Back to a clean database, so test:db starts from nothing
by_hand step_stop
require "dev server down" 000 "$(code "$APP/")"
check "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"

summary
[ "$failed" -eq 0 ]
