#!/usr/bin/env bash
# Browse 1.5.2, the shelf in hand (#76). Git Bash, from a clean tree, with
# the local stack up and the dev server stopped. Run it as:
#   BROWSE_EMAIL=<your address> bash scripts/browse/1.5.2.sh
#
# Every check prints its name, what was expected, what came back, and pass or
# fail. A precondition that fails (the tree, the stack, the server, the
# reset, the sign-in, the load) ends the run there with the summary, instead
# of carrying on against a box that can't pass. A step that isn't a command
# for this terminal (start the dev server, the walk in the browser) prints as
# a numbered step and waits for Enter. The report lands in
# browse-results/1.5.2.txt, which Playwright never empties: this script runs
# one e2e of its own.

set -u
cd "$(dirname "$0")/../.." || exit 1

APP=http://localhost:3000
MAILPIT=http://127.0.0.1:54324
REPORT=browse-results/1.5.2.txt
# A middle dot, as bytes: a literal one in an argument to a Windows program
# reaches it in the console's code page, not UTF-8 (1.5.1, step 5).
DOT=$(printf '\302\267')

mkdir -p browse-results
: >"$REPORT"
checks=0
failed=0
step=0

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

# Whether a page holds a line: the HTML carries it twice (once rendered,
# once in Next's payload), so presence is the check, not a count.
has() { grep -qF -- "$1" <<<"$2" && echo found || echo missing; }

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
  having count(*) <> count(distinct position) or min(position) <> 1
    or max(position) <> count(*)) v"

shelf_of() { # owner address, shelf name
  P "select s.id from shelves s join auth.users u on u.id = s.owner where u.email = '$1' and s.name = '$2'"
}

counts() { # a label for this point of the walk, then the four expected counts
  check "$1 shelves" "$2" "$(P 'select count(*) from shelves')"
  check "$1 shelf_sections" "$3" "$(P 'select count(*) from shelf_sections')"
  check "$1 shelf_entries" "$4" "$(P 'select count(*) from shelf_entries')"
  check "$1 shelves not numbered 1..n" 0 "$(P "$VIOLATIONS")"
  check "$1 items" "$5" "$(P 'select count(*) from items')"
}

# A shelf's works as "<title> <year>", in shelf order, joined with ", ".
order_of() {
  P "select string_agg(i.title || ' ' || coalesce(left(i.released_on::text, 4), ''), ', ' order by e.position)
    from shelf_entries e join items i on i.id = e.item where e.shelf = '$1'"
}

# How many of a shelf's entries hold a status.
status_count() { P "select count(*) from shelf_entries where shelf = '$1' and status = '$2'"; }

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
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

say "Browse 1.5.2, the shelf in hand"
say "at $(git log -1 --oneline), $(date '+%Y-%m-%d %H:%M')"
say ""

# 1. Where the walk starts; each of these ends the run when it fails
require "tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"
require "stack up" 0 "$(npx supabase status >/dev/null 2>&1; echo $?)"
require "dev server down before the reset" 000 "$(code "$APP/")"
require "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"

prose "Start the dev server in another terminal: npm run dev. Wait for Ready."
require "dev server up" 200 "$(code "$APP/")"

# 2. Signed in again after the reset, and the fixtures for you
require "you signed in" "$APP/nook" "$(sign_in "$EMAIL" "$JAR")"
require "fixtures:load" 0 "$(npm run fixtures:load -- --user "$EMAIL" >/dev/null 2>&1; echo $?)"
counts "loaded:" 3 14 398 454

TMNT=$(shelf_of "$EMAIL" "TMNT, the Mirage run")

# 3. The TMNT page with the grip on all 326 rows, timed beside 1.5.1's
check "TMNT page" 200 "$(code -b "$JAR" "$APP/shelves/$TMNT")"
check "TMNT grips" 326 "$(curl -s -b "$JAR" "$APP/shelves/$TMNT" | grep -o 'aria-label="Reorder ' | wc -l | tr -d ' ')"
measured "TMNT page, seconds on a warm hit" "$(curl -s -o /dev/null -w '%{time_total}' -b "$JAR" "$APP/shelves/$TMNT")"
say "  (1.5.1 measured 1.52 s on this box, before dnd-kit and the picker's list)"
measured "TMNT page, bytes" "$(curl -s -o /dev/null -w '%{size_download}' -b "$JAR" "$APP/shelves/$TMNT")"

# 4. The King path, built by hand
prose "In the browser, sign in at $APP with $EMAIL (the link is in Mailpit, $MAILPIT). On /nook, New shelf: name 'Stephen King, in order', description 'The book, then its films, one work per section.', Make shelf.
  New section three times: Carrie, then 'Salem's Lot (with the leading apostrophe), then The Shining.
  Add works, Find 'carrie', Into Carrie: five rows in this order, Carrie 1974 (book), Carrie 1976, The Rage: Carrie 2 1999, Carrie 2002, Carrie 2013. Tick the four Carries, '4 picked', Add 4 works: the Carrie section reads 1 to 4.
  Add works, Find 'salem', Into 'Salem's Lot: six rows in this order, Salem's Lot 1975 (book), Jerusalem's Lot 1977, Salem's Lot 1979, A Return to Salem's Lot 1987, Salem's Lot 2004, Salem's Lot 2024. Tick the book, 1979, 2004 and 2024, Add 4 works: 5 to 8.
  Add works, Find 'the shining', Into The Shining: three rows, tick all three, Add 3 works: 9 to 11.
  Add works, Find 'night shift', Into No section: tick Night Shift, Add 1 work. It reads 1 above the first section, the rest 2 to 12, and the dim line sits under it.
  Status: Carrie 1974 Done, Carrie 1976 Done, Carrie 2002 Skipped (struck through), Salem's Lot 1975 Done, Salem's Lot 1979 Done, The Shining 1977 Done. The header reads '12 works $DOT 5 done $DOT 1 skipped $DOT 3 sections' and Carrie's line '4 works $DOT 2 done $DOT 1 skipped'.
  Keyboard: Tab to the grip of Salem's Lot 2024 (number 9), Space, Up arrow, Space: it reads 8, above 2004.
  Pointer: drag Night Shift by its grip into The Shining, under 1997: it reads 12 and the dim line is gone. Drag it back above Carrie's heading: 1 again, the line back. Try a drag low on the TMNT shelf too (row 300 or so) and note how it feels.
  New section 'Scratch', drag Carrie 2013 into it, Delete section on Scratch, confirm: Carrie 2013 reads 2 above the first section (Night Shift 1) and the header says 3 sections. Drag it back under Carrie 2002: 5 again."

KING=$(shelf_of "$EMAIL" "Stephen King, in order")
counts "after the King path:" 4 17 410 454
check "the King path's order" "Night Shift 1977, Carrie 1974, Carrie 1976, Carrie 2002, Carrie 2013, Salem's Lot 1975, Salem's Lot 1979, Salem's Lot 2024, Salem's Lot 2004, The Shining 1977, The Shining 1980, The Shining 1997" "$(order_of "$KING")"
check "the King path's sections" "Carrie|'Salem's Lot|The Shining" "$(P "select string_agg(name, '|' order by position) from shelf_sections where shelf = '$KING'")"
check "done on it" 5 "$(status_count "$KING" done)"
check "skipped on it" 1 "$(status_count "$KING" skipped)"
KING_PAGE=$(curl -s -b "$JAR" "$APP/shelves/$KING")
check "its header" found "$(has "12 works $DOT 5 done $DOT 1 skipped $DOT 3 sections" "$KING_PAGE")"
check "Carrie's line" found "$(has "4 works $DOT 2 done $DOT 1 skipped" "$KING_PAGE")"
check "first on the nook" "Stephen King, in order" "$(nook_names "$JAR" | cut -d'|' -f1)"
check "the nook's line" found "$(has "4 shelves $DOT 410 works on them $DOT 5 done" "$(curl -s -b "$JAR" "$APP/nook")")"

# 5. The shelf's own writes
prose "On Stephen King, in order: Rename The Shining to 'The Shining (1977)'. Edit shelf: change the description to 'The book, then its films, one work per section. Built by hand on the 1.5.2 Browse.' and Save. Remove under Carrie 2013's status: the row goes, the rest close up. Then from /nook, New shelf 'Scratch shelf', Add works, Find 'the rage', tick The Rage: Carrie 2, Add 1 work: it reads 1. Delete shelf, confirm: you land on /nook and Scratch shelf is gone."

check "the third section's name" "The Shining (1977)" "$(P "select name from shelf_sections where shelf = '$KING' and position = 3")"
check "the new description" "The book, then its films, one work per section. Built by hand on the 1.5.2 Browse." "$(P "select description from shelves where id = '$KING'")"
check "the King path after Remove" "Night Shift 1977, Carrie 1974, Carrie 1976, Carrie 2002, Salem's Lot 1975, Salem's Lot 1979, Salem's Lot 2024, Salem's Lot 2004, The Shining 1977, The Shining 1980, The Shining 1997" "$(order_of "$KING")"
KING_PAGE=$(curl -s -b "$JAR" "$APP/shelves/$KING")
check "its header after Remove" found "$(has "11 works $DOT 5 done $DOT 1 skipped $DOT 3 sections" "$KING_PAGE")"
check "Carrie's line after Remove" found "$(has "3 works $DOT 2 done $DOT 1 skipped" "$KING_PAGE")"
check "Scratch shelf gone" "" "$(shelf_of "$EMAIL" "Scratch shelf")"
counts "after the shelf's writes:" 4 17 409 454
check "Carrie 2013 still in the catalog" 1 "$(P "select count(*) from item_sources where source = 'letterboxd' and key = '4kC2'")"

# 6. A13's sixth red: the move route answered 500 by a stub (an e2e on its
# own account; Playwright reuses the dev server you started).
check "red 6, a refused move puts the row back" 0 "$(npx playwright test tests/e2e/shelf-drag.spec.ts -g 'answered 500' >/dev/null 2>&1; echo $?)"

# 7. Back to a clean database, so test:db starts from nothing
prose "Stop the dev server (Ctrl+C in its terminal). The browser's session ends with the reset that follows."
require "dev server down" 000 "$(code "$APP/")"
check "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"

summary
[ "$failed" -eq 0 ]
