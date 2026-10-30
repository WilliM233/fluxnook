#!/usr/bin/env bash
# Browse 1.5.1, the rule every write keeps (#75). Git Bash, from a clean tree,
# with the local stack up. Run it as: bash scripts/browse/1.5.1.sh
#
# Every check prints its name, what was expected, what came back, and pass or
# fail. A step that isn't a command for this terminal (start the dev server,
# a walk in the browser) is printed as a numbered step and the script waits
# for Enter. The whole report lands in test-results/browse-1.5.1.txt for the
# PR. The address you sign in with: BROWSE_EMAIL, or the script asks.

set -u
cd "$(dirname "$0")/../.." || exit 1

APP=http://localhost:3000
MAILPIT=http://127.0.0.1:54324
REPORT=test-results/browse-1.5.1.txt
# A middle dot, as bytes: a literal one in an argument to a Windows program
# reaches it in the console's code page, not UTF-8 (1.5.1, step 5).
DOT=$(printf '\302\267')

mkdir -p test-results
: >"$REPORT"
checks=0
failed=0
step=0

say() { printf '%s\n' "$*" | tee -a "$REPORT"; }

check() { # name, expected, actual
  checks=$((checks + 1))
  local result=pass
  if [ "$2" != "$3" ]; then
    result=fail
    failed=$((failed + 1))
  fi
  say "$1: expected $2, actual $3, $result"
}

measured() { say "$1: measured $2 (not asserted)"; }

prose() {
  step=$((step + 1))
  say ""
  say "Step $step, by hand: $*"
  printf 'Press Enter when it is done. '
  read -r _
  say ""
}

# One SQL statement against the local database; the bare result.
P() { docker exec supabase_db_fluxnook psql -U postgres -tAc "$1" | tr -d '\r'; }

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

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

# Shelves whose positions are not exactly 1..n: the invariant (A2).
VIOLATIONS="select count(*) from (select shelf from shelf_entries group by shelf
  having array_agg(position order by position) <> array(select generate_series(1, count(*)::int))) v"

shelf_of() { # owner address, shelf name
  P "select s.id from shelves s join auth.users u on u.id = s.owner where u.email = '$1' and s.name = '$2'"
}

counts() { # a label for this point of the walk, then the five expected counts
  check "$1 shelves" "$2" "$(P 'select count(*) from shelves')"
  check "$1 shelf_sections" "$3" "$(P 'select count(*) from shelf_sections')"
  check "$1 shelf_entries" "$4" "$(P 'select count(*) from shelf_entries')"
  check "$1 shelves not numbered 1..n" 0 "$(P "$VIOLATIONS")"
  check "$1 items" "$5" "$(P 'select count(*) from items')"
}

# The nook's card names, in page order, joined with |.
nook_names() {
  curl -s -b "$1" "$APP/nook" | grep -o '<h2[^>]*>[^<]*</h2>' |
    sed -e 's/<[^>]*>//g' | paste -sd '|'
}

EMAIL=${BROWSE_EMAIL:-}
if [ -z "$EMAIL" ]; then
  printf 'The address to sign in with: '
  read -r EMAIL
fi
STRANGER="stranger-$RANDOM$RANDOM@example.com"
JAR_A=$(mktemp)
JAR_B=$(mktemp)

say "Browse 1.5.1, the rule every write keeps"
say "at $(git log -1 --oneline), $(date '+%Y-%m-%d %H:%M')"
say ""

# 1. Where the walk starts
check "tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"
check "stack up" 0 "$(npx supabase status >/dev/null 2>&1; echo $?)"
check "dev server down before the reset" 000 "$(code "$APP/")"
check "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"

prose "Start the dev server in another terminal: npm run dev. Wait for Ready."
check "dev server up" 200 "$(code "$APP/")"

# 2. Two people, signed in again after the reset, and the fixtures for you
check "you signed in" "$APP/nook" "$(sign_in "$EMAIL" "$JAR_A")"
check "a stranger signed in" "$APP/nook" "$(sign_in "$STRANGER" "$JAR_B")"
check "fixtures:load" 0 "$(npm run fixtures:load -- --user "$EMAIL" >/dev/null 2>&1; echo $?)"
counts "loaded:" 3 14 398 454

TMNT=$(shelf_of "$EMAIL" "TMNT, the Mirage run")
WATCH=$(shelf_of "$EMAIL" "Stephen King Watch List")
BOOKS=$(shelf_of "$EMAIL" "Stephen King, publication order")

# 3. The nook's three cards (A6)
NOOK=$(curl -s -b "$JAR_A" "$APP/nook")
check "nook line" 1 "$(grep -c "3 shelves $DOT 398 works on them" <<<"$NOOK")"
check "nook cards in order" "TMNT, the Mirage run|Stephen King Watch List|Stephen King, publication order" "$(nook_names "$JAR_A")"
check "TMNT card" 1 "$(grep -c "326 works $DOT 14 sections" <<<"$NOOK")"
check "TMNT card's rest" 1 "$(grep -c '+321' <<<"$NOOK")"
check "Watch List card" 1 "$(grep -c "61 works $DOT from Letterboxd" <<<"$NOOK")"
check "publication order card" 1 "$(grep -c "11 works $DOT from Letterboxd" <<<"$NOOK")"
check "the stranger's nook is empty" 1 "$(curl -s -b "$JAR_B" "$APP/nook" | grep -c 'No shelves yet')"

# 4. The TMNT page, all 326 rows on one page (A7), and timed
check "TMNT page" 200 "$(code -b "$JAR_A" "$APP/shelves/$TMNT")"
check "TMNT rows" 326 "$(curl -s -b "$JAR_A" "$APP/shelves/$TMNT" | grep -o 'data-testid="entry"' | wc -l | tr -d ' ')"
measured "TMNT page, seconds on a warm hit" "$(curl -s -o /dev/null -w '%{time_total}' -b "$JAR_A" "$APP/shelves/$TMNT")"
check "TMNT page as the stranger" 404 "$(code -b "$JAR_B" "$APP/shelves/$TMNT")"

# 5. The reds (A13), each followed by what it must leave alone
# First: a move of a Watch List work into a TMNT section is 404, the order kept.
MAIN=$(P "select id from shelf_sections where shelf = '$TMNT' and position = 1")
ENTRY=$(P "select id from shelf_entries where shelf = '$WATCH' and position = 1")
ORDER="select md5(string_agg(id::text || ':' || position, ',' order by position)) from shelf_entries where shelf = '$WATCH'"
before=$(P "$ORDER")
check "red 1, a move into another shelf's section" 404 "$(code -b "$JAR_A" -X PATCH "$APP/api/v1/shelves/$WATCH/entries/$ENTRY" -H 'content-type: application/json' -d "{\"section\":\"$MAIN\",\"index\":0}")"
check "red 1, the Watch List's order" "$before" "$(P "$ORDER")"

# Second: a film beside a uuid the catalog doesn't hold is 400, nothing added.
CARRIE=$(P "select item from item_sources where source = 'letterboxd' and key = '20ZQ'")
NOBODY=$(node.exe -p 'crypto.randomUUID()' | tr -d '\r')
check "red 2, an unknown work beside a film" 400 "$(code -b "$JAR_A" -X POST "$APP/api/v1/shelves/$BOOKS/entries" -H 'content-type: application/json' -d "{\"items\":[\"$CARRIE\",\"$NOBODY\"]}")"
check "red 2, the publication-order shelf" 11 "$(P "select count(*) from shelf_entries where shelf = '$BOOKS'")"

# Third: the stranger deleting your Watch List is 404, and it stays.
check "red 3, the stranger deletes your shelf" 404 "$(code -b "$JAR_B" -X DELETE "$APP/api/v1/shelves/$WATCH")"
check "red 3, shelves" 3 "$(P 'select count(*) from shelves')"

# Fourth: a section delete whose renumbering throws loses no work (a test double).
check "red 4, the throw mid-transaction" 0 "$(npm run test:db -- tests/db/shelf-writes.test.ts -t 'throw mid-transaction' >/dev/null 2>&1; echo $?)"

# Fifth: a section named as one the shelf has is 409, naming it.
body=$(curl -s -b "$JAR_A" -w ' %{http_code}' -X POST "$APP/api/v1/shelves/$TMNT/sections" -H 'content-type: application/json' -d '{"name":"Volume 1 · Main Series"}')
check "red 5, a section's name twice" 409 "${body##* }"
check "red 5, the 409 names it" 1 "$(grep -c "named Volume 1 $DOT Main Series" <<<"$body")"
check "red 5, TMNT's sections" 14 "$(P "select count(*) from shelf_sections where shelf = '$TMNT'")"

# Seventh: the stranger marking one of your works is 404, the status kept.
check "red 7, the stranger marks your work" 404 "$(code -b "$JAR_B" -X PATCH "$APP/api/v1/shelves/$WATCH/entries/$ENTRY" -H 'content-type: application/json' -d '{"status":"done"}')"
check "red 7, its status" unmarked "$(P "select status from shelf_entries where id = '$ENTRY'")"

counts "after the reds:" 3 14 398 454

# 6. The walk in the browser
prose "In the browser, sign in at $APP with $EMAIL (the link is in Mailpit, $MAILPIT). /nook shows the three cards in this order: TMNT, the Mirage run; Stephen King Watch List; Stephen King, publication order. New shelf: name 'Stephen King, in order', description 'The book, then its films, one work per section.', Make shelf. It lands on the new shelf's page reading 0 works and Nothing on it yet. Then open TMNT, the Mirage run from /nook and scroll to number 326: note how it feels."

counts "after the walk:" 4 14 398 454
check "the new shelf first on the nook" "Stephen King, in order" "$(nook_names "$JAR_A" | cut -d'|' -f1)"
check "the new shelf's description" "The book, then its films, one work per section." "$(P "select description from shelves where name = 'Stephen King, in order'")"

# 7. Back to a clean database, so test:db starts from nothing
prose "Stop the dev server (Ctrl+C in its terminal). The browser's session ends with the reset that follows."
check "dev server down" 000 "$(code "$APP/")"
check "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"

rm -f "$JAR_A" "$JAR_B"
say ""
say "$checks checks, $failed failed"
[ "$failed" -eq 0 ]
