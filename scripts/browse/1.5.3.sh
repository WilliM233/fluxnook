#!/usr/bin/env bash
# Browse 1.5.3, three doors (#77): the chapter's exit Browse, section 0 of
# docs/plans/1.5-shelves.md end to end. Git Bash, from a clean tree, with
# the local stack up and the dev server stopped. Run it as:
#   BROWSE_EMAIL=<your address> bash scripts/browse/1.5.3.sh
#
# Every check prints its name, what was expected, what came back, and pass or
# fail. A precondition that fails ends the run there with the summary. A step
# for your hands prints one action per line, the names and numbers to expect
# on lines of their own, and waits for Enter. Every step is written to
# browse-results/1.5.3-steps.md before the first pause, so it can sit open
# beside the browser; a number the live Comic Vine decides reads there as a
# placeholder and is printed here, measured, when its step comes. The report
# is browse-results/1.5.3.txt, which Playwright never empties: this script
# runs one e2e of its own.

set -u
cd "$(dirname "$0")/../.." || exit 1

APP=http://localhost:3000
MAILPIT=http://127.0.0.1:54324
REPORT=browse-results/1.5.3.txt
STEPS=browse-results/1.5.3-steps.md
# A middle dot, as bytes: a literal one in an argument to a Windows program
# reaches it in the console's code page, not UTF-8 (1.5.1, step 5).
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

status_count() { P "select count(*) from shelf_entries where shelf = '$1' and status = '$2'"; }

# The nook's card names, in page order, joined with |.
nook_names() {
  curl -s -b "$1" "$APP/nook" | grep -o '<h2[^>]*>[^<]*</h2>' |
    sed -e 's/<[^>]*>//g' | paste -sd '|'
}

# GET /api/v1/shelves as a jar, each shelf as "<name>:<has>", in list order.
listed() { # jar, query string
  curl -s -b "$1" "$APP/api/v1/shelves$2" |
    node.exe -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(Array.isArray(j)?(j.length?j.map(x=>x.name+":"+x.has).join("|"):"(none)"):JSON.stringify(j))})' |
    tr -d '\r'
}

# A Comic Vine volume's issue count from the app's own search, as the live
# provider answers it now (no key leaves the server).
live_issues() { # jar, query, volume key
  curl -s -b "$1" -G "$APP/api/v1/providers/comicvine/search" --data-urlencode "q=$2" |
    node.exe -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=(JSON.parse(s).results||[]).find(x=>x.key===process.argv[1]);console.log(r&&r.issueCount!==null?r.issueCount:"none")})' "$3" |
    tr -d '\r'
}

# The hand-entered runs the import sheet's select offers single issues: the
# rule seriesGroups keeps (src/lib/catalog/match.ts).
HAND_RUNS="select count(*) from (select c.series from items i
  join item_comics c on c.item = i.id
  where i.type = 'comic' and c.series is not null group by c.series
  having not bool_or(exists (select 1 from item_sources s
    where s.item = i.id and s.source = 'comicvine'))) g"

# ---- The steps for your hands. Each prints one action per line; a name or
# a number to expect stands on a line of its own, indented.

step_server() {
  echo "Step 1, by hand: the dev server"
  echo ""
  echo "In another terminal, start it:"
  echo "    npm run dev"
  echo ""
  echo "Wait for Ready."
}

step_king() {
  echo "Step 2, by hand: the King path, on a new shelf"
  echo ""
  echo "In the browser, sign in at $APP with:"
  echo "    $EMAIL"
  echo "(the link is in Mailpit, $MAILPIT)"
  echo ""
  echo "On /nook, see three cards, in this order:"
  echo "    TMNT, the Mirage run"
  echo "    Stephen King Watch List"
  echo "    Stephen King, publication order"
  echo ""
  echo "Click New shelf. Name:"
  echo "    Stephen King, in order"
  echo "Description:"
  echo "    The book, then its films, one work per section."
  echo "Click Make shelf. The page reads:"
  echo "    0 works"
  echo ""
  echo "Click New section, three times, one name each:"
  echo "    Carrie"
  echo "    'Salem's Lot"
  echo "    The Shining"
  echo ""
  echo "Add works. Find: carrie. Into: Carrie. Five rows, in this order:"
  echo "    Carrie 1974 (book)"
  echo "    Carrie 1976"
  echo "    The Rage: Carrie 2 1999"
  echo "    Carrie 2002"
  echo "    Carrie 2013"
  echo "Tick these four:"
  echo "    Carrie 1974 (book)"
  echo "    Carrie 1976"
  echo "    Carrie 2002"
  echo "    Carrie 2013"
  echo "Leave this one unticked (the walk is the book and its three adaptations):"
  echo "    The Rage: Carrie 2 1999"
  echo "It reads:"
  echo "    4 picked"
  echo "Click Add 4 works. The Carrie section reads:"
  echo "    1 to 4"
  echo ""
  echo "Add works. Find: salem. Into: 'Salem's Lot. Six rows, in this order:"
  echo "    Salem's Lot 1975 (book)"
  echo "    Jerusalem's Lot 1977"
  echo "    Salem's Lot 1979"
  echo "    A Return to Salem's Lot 1987"
  echo "    Salem's Lot 2004"
  echo "    Salem's Lot 2024"
  echo "Tick these four:"
  echo "    Salem's Lot 1975 (book)"
  echo "    Salem's Lot 1979"
  echo "    Salem's Lot 2004"
  echo "    Salem's Lot 2024"
  echo "Leave these two unticked:"
  echo "    Jerusalem's Lot 1977"
  echo "    A Return to Salem's Lot 1987"
  echo "Click Add 4 works. They read:"
  echo "    5 to 8"
  echo ""
  echo "Add works. Find: the shining. Into: The Shining. Tick all three."
  echo "Click Add 3 works. They read:"
  echo "    9 to 11"
  echo ""
  echo "Add works. Find: night shift. Into: At the end. Tick Night Shift."
  echo "Click Add 1 work. Night Shift sits above the first section as:"
  echo "    1"
  echo "The rest read 2 to 12, with the dim line under Night Shift."
  echo ""
  echo "Mark Done:"
  echo "    Carrie 1974"
  echo "    Carrie 1976"
  echo "    Salem's Lot 1975"
  echo "    Salem's Lot 1979"
  echo "    The Shining 1977"
  echo "Mark Skipped (it strikes through):"
  echo "    Carrie 2002"
  echo "The header reads:"
  echo "    12 works $DOT 5 done $DOT 1 skipped $DOT 3 sections"
  echo "Carrie's line reads:"
  echo "    4 works $DOT 2 done $DOT 1 skipped"
  echo ""
  echo "Keyboard: Tab to the grip of Salem's Lot 2024, number:"
  echo "    9"
  echo "Press Space, Up arrow, Space. It reads, above 2004:"
  echo "    8"
  echo ""
  echo "Pointer: drag Night Shift by its grip into The Shining, under 1997. It reads:"
  echo "    12"
  echo "The dim line is gone."
  echo ""
  echo "Drag Night Shift back above Carrie's heading. It reads:"
  echo "    1"
  echo "The dim line is back."
  echo ""
  echo "New section:"
  echo "    Scratch"
  echo "Drag Carrie 2013 into Scratch."
  echo ""
  echo "Delete section on Scratch, and confirm. Carrie 2013 sits above the first section as:"
  echo "    2"
  echo "(Night Shift is 1.) The header says:"
  echo "    3 sections"
  echo ""
  echo "Drag Carrie 2013 back under Carrie 2002. It reads:"
  echo "    5"
}

step_item() { # Carrie 1974's page
  echo "Step 3, by hand: the item page's door"
  echo ""
  echo "Open Carrie 1974's page:"
  echo "    $1"
  echo ""
  echo "On your shelves reads two chips, in this order, both links:"
  echo "    Stephen King, in order $DOT Carrie $DOT #2"
  echo "    Stephen King, publication order $DOT #1"
  echo ""
  echo "Click Add to shelf. The sheet:"
  echo "    Add Carrie to a shelf"
  echo "Disabled, with what it says:"
  echo "    Stephen King, publication order: Already on it, #1"
  echo "    Stephen King, in order: Already on it, #2"
  echo ""
  echo "Pick Stephen King Watch List. No Into select shows (it has no sections)."
  echo ""
  echo "Click Add to shelf. The sheet closes and the first chip reads:"
  echo "    Stephen King Watch List $DOT #62"
}

step_import() {
  echo "Step 4, by hand: the 1984 run from Comic Vine (live)"
  echo ""
  echo "Open:"
  echo "    $APP/search?q=teenage mutant ninja turtles"
  echo ""
  echo "Click Comics."
  echo ""
  echo "On Teenage Mutant Ninja Turtles (1984, Mirage), click Add."
  echo ""
  echo "Click Same, add Comic Vine's details to it (as the 1.4 Browse)."
  echo ""
  echo "It lands on /series/<id> with this many tiles:"
  echo "    stub 62, live measured at the Browse"
  echo "Leave the page open; the next step starts there."
}

step_run() { # the run's count
  echo "Step 5, by hand: Add the run to a shelf"
  echo ""
  echo "On the series page, click Add the run to a shelf. The sheet:"
  echo "    Add $1 issues to a shelf"
  echo ""
  echo "The row TMNT, the Mirage run reads, at its end:"
  echo "    62 of these already on it"
  echo ""
  echo "Pick Or a new shelf. Name:"
  echo "    Mirage, reading order"
  echo "Click Add $1 issues. Beside the button:"
  echo "    $1 added"
  echo ""
  echo "Click the link Mirage, reading order. The shelf reads $1 rows, numbered 1 to $1. Number 1:"
  echo "    The Turtles' Origin is Told"
  echo ""
  echo "Go back to the series page. Add the run to a shelf again."
  echo "Pick Mirage, reading order. Click Add $1 issues. Beside the button:"
  echo "    0 added, $1 already there"
}

step_tales() { # the volume's count, the runs in the select
  echo "Step 6, by hand: A12's line on the import sheet"
  echo ""
  echo "Open:"
  echo "    $APP/search?q=tales of the tmnt"
  echo ""
  echo "Click Comics."
  echo ""
  echo "On Tales of the TMNT (2004, Mirage), click Add."
  echo ""
  echo "Leave Same as a run you added by hand? on No. Click Add. The line:"
  echo "    Adds $1 comics as a new run beside the $2 runs you entered by hand. If it is one of them, pick it above. Add anyway?"
  echo ""
  echo "Click Cancel, then close the sheet. Nothing is imported."
  echo ""
  echo "Open /nook. The line reads:"
  echo "    5 shelves $DOT $3 works on them $DOT 5 done"
  echo "The first card:"
  echo "    Mirage, reading order"
}

step_stop() {
  echo "Step 7, by hand: stop the dev server"
  echo ""
  echo "Ctrl+C in its terminal. The browser's session ends with the reset that follows."
}

EMAIL=${BROWSE_EMAIL:-}
if [ -z "$EMAIL" ]; then
  printf 'The address to sign in with: '
  read -r EMAIL
fi
STRANGER="stranger-$RANDOM$RANDOM@example.com"
JAR_A=$(mktemp)
JAR_B=$(mktemp)
trap 'rm -f "$JAR_A" "$JAR_B"' EXIT

# One step as a block of the steps file.
block() {
  echo ""
  echo '```text'
  "$@"
  echo '```'
}

# Every step, before the first pause, with the live numbers as placeholders.
{
  echo "# Browse 1.5.3, the steps for your hands"
  echo ""
  echo "The script prints each step again when it comes, with the numbers the live Comic Vine decided. N is the 1984 run's issue count (62 on the stub), M is Tales of the TMNT's (71 on the stub)."
  block step_server
  block step_king
  block step_item "/items/<Carrie 1974's id, printed at the step>"
  block step_import
  block step_run N
  block step_tales M "<the runs, printed at the step; 24 at the census>" "<411 + N>"
  block step_stop
} >"$STEPS"

say "Browse 1.5.3, three doors (the chapter's exit)"
say "at $(git log -1 --oneline), $(date '+%Y-%m-%d %H:%M')"
say "The steps for your hands are in $STEPS."
say ""

# 1. Where the walk starts; each of these ends the run when it fails
require "tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"
require "stack up" 0 "$(npx supabase status >/dev/null 2>&1; echo $?)"
require "dev server down before the reset" 000 "$(code "$APP/")"
require "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"

by_hand step_server
require "dev server up" 200 "$(code "$APP/")"

# 2. You and a stranger, signed in again after the reset; the fixtures for you
require "you signed in" "$APP/nook" "$(sign_in "$EMAIL" "$JAR_A")"
require "a stranger signed in" "$APP/nook" "$(sign_in "$STRANGER" "$JAR_B")"
require "fixtures:load" 0 "$(npm run fixtures:load -- --user "$EMAIL" >/dev/null 2>&1; echo $?)"
counts "loaded:" 3 14 398 454
check "loaded: item_sources" 454 "$(P 'select count(*) from item_sources')"

TMNT=$(shelf_of "$EMAIL" "TMNT, the Mirage run")
WATCH=$(shelf_of "$EMAIL" "Stephen King Watch List")
BOOKS=$(shelf_of "$EMAIL" "Stephen King, publication order")

NOOK=$(curl -s -b "$JAR_A" "$APP/nook")
check "nook line" found "$(has "3 shelves $DOT 398 works on them" "$NOOK")"
check "nook cards in order" "TMNT, the Mirage run|Stephen King Watch List|Stephen King, publication order" "$(nook_names "$JAR_A")"
check "TMNT card" found "$(has "326 works $DOT 14 sections" "$NOOK")"
check "Watch List card" found "$(has "61 works $DOT from Letterboxd" "$NOOK")"
check "publication order card" found "$(has "11 works $DOT from Letterboxd" "$NOOK")"

check "TMNT page" 200 "$(code -b "$JAR_A" "$APP/shelves/$TMNT")"
check "TMNT grips" 326 "$(curl -s -b "$JAR_A" "$APP/shelves/$TMNT" | grep -o 'aria-label="Reorder ' | wc -l | tr -d ' ')"
measured "TMNT page, seconds on a warm hit" "$(curl -s -o /dev/null -w '%{time_total}' -b "$JAR_A" "$APP/shelves/$TMNT")"
measured "TMNT page, bytes" "$(curl -s -o /dev/null -w '%{size_download}' -b "$JAR_A" "$APP/shelves/$TMNT")"
say "  (1.5.2 measured 0.64 s and 1,241,994 bytes on this box; the paging Deferral's trigger is a long shelf's payload past 1 MB)"
check "TMNT page as the stranger" 404 "$(code -b "$JAR_B" "$APP/shelves/$TMNT")"

# 3. The King path, built by hand
by_hand step_king

KING=$(shelf_of "$EMAIL" "Stephen King, in order")
counts "after the King path:" 4 17 410 454
check "the King path's order" "Night Shift 1977, Carrie 1974, Carrie 1976, Carrie 2002, Carrie 2013, Salem's Lot 1975, Salem's Lot 1979, Salem's Lot 2024, Salem's Lot 2004, The Shining 1977, The Shining 1980, The Shining 1997" "$(order_of "$KING")"
check "the King path's sections" "Carrie|'Salem's Lot|The Shining" "$(P "select string_agg(name, '|' order by position) from shelf_sections where shelf = '$KING'")"
check "done on it" 5 "$(status_count "$KING" done)"
check "skipped on it" 1 "$(status_count "$KING" skipped)"
KING_PAGE=$(curl -s -b "$JAR_A" "$APP/shelves/$KING")
check "its header" found "$(has "12 works $DOT 5 done $DOT 1 skipped $DOT 3 sections" "$KING_PAGE")"
check "Carrie's line" found "$(has "4 works $DOT 2 done $DOT 1 skipped" "$KING_PAGE")"
check "first on the nook" "Stephen King, in order" "$(nook_names "$JAR_A" | cut -d'|' -f1)"
check "the nook's line" found "$(has "4 shelves $DOT 410 works on them $DOT 5 done" "$(curl -s -b "$JAR_A" "$APP/nook")")"

# 4. The item page's door (A10)
CARRIE=$(P "select item from item_sources where source = 'manual' and key = 'carrie-1974'")
check "Carrie 1974 on the GET, before" "Stephen King, in order:1|TMNT, the Mirage run:0|Stephen King Watch List:0|Stephen King, publication order:1" "$(listed "$JAR_A" "?item=$CARRIE")"
by_hand step_item "$APP/items/$CARRIE"

check "the Watch List's works" 62 "$(P "select count(*) from shelf_entries where shelf = '$WATCH'")"
check "Carrie 1974 on the Watch List" 62 "$(P "select position from shelf_entries where shelf = '$WATCH' and item = '$CARRIE'")"
check "its chips, in order, as links" "/shelves/$WATCH|/shelves/$KING|/shelves/$BOOKS" "$(curl -s -b "$JAR_A" "$APP/items/$CARRIE" | grep -o '<a[^>]*href="/shelves/[^"]*"' | grep -o '/shelves/[^"]*' | paste -sd '|')"
check "Carrie 1974 on the GET, after" "Stephen King Watch List:1|Stephen King, in order:1|TMNT, the Mirage run:0|Stephen King, publication order:1" "$(listed "$JAR_A" "?item=$CARRIE")"
check "the GET as the stranger" "(none)" "$(listed "$JAR_B" "?item=$CARRIE")"
counts "after the item page's door:" 4 17 411 454

# 5. The series door (A11), on the live Comic Vine
by_hand step_import

N=$(P "select count(*) from item_comics c join series_sources ss on ss.series = c.series_id where ss.source = 'comicvine' and ss.key = 'volume/20281'")
measured "the 1984 run's issues, live (stub 62)" "$N"
SERIES=$(P "select series from series_sources where source = 'comicvine' and key = 'volume/20281'")
check "series in the catalog" 1 "$(P 'select count(*) from series')"
check "items after the import" $((454 + N - 62)) "$(P 'select count(*) from items')"
check "item_sources after the import" $((454 + N)) "$(P 'select count(*) from item_sources')"
check "the series page's count" found "$(has "$N<!-- --> in the catalog, in cover-date order" "$(curl -s -b "$JAR_A" "$APP/series/$SERIES")")"

by_hand step_run "$N"

MIRAGE=$(shelf_of "$EMAIL" "Mirage, reading order")
check "Mirage, reading order's works" "$N" "$(P "select count(*) from shelf_entries where shelf = '$MIRAGE'")"
check "its number 1" "The Turtles' Origin is Told" "$(P "select i.title from shelf_entries e join items i on i.id = e.item where e.shelf = '$MIRAGE' and e.position = 1")"
check "its order is the series page's (md5)" "$(P "select md5(string_agg(i.id::text, ',' order by i.released_on nulls last, c.number nulls last, i.title)) from item_comics c join items i on i.id = c.item where c.series_id = '$SERIES'")" "$(P "select md5(string_agg(item::text, ',' order by position)) from shelf_entries where shelf = '$MIRAGE'")"
RUN=$(P "select string_agg(c.item::text, ',') from item_comics c where c.series_id = '$SERIES'")
check "the run on the GET" "Mirage, reading order:$N|Stephen King Watch List:0|Stephen King, in order:0|TMNT, the Mirage run:62|Stephen King, publication order:0" "$(listed "$JAR_A" "?items=$RUN")"
counts "after the series door:" 5 17 $((411 + N)) $((454 + N - 62))

# 6. A12's line on the import sheet: the numbers the line will read
M=$(live_issues "$JAR_A" "tales of the tmnt" "volume/18785")
measured "Tales of the TMNT's issues, live (stub 71)" "$M"
RUNS=$(P "$HAND_RUNS")
measured "the hand-entered runs in the select (census: 24)" "$RUNS"
by_hand step_tales "$M" "$RUNS" $((411 + N))

check "series after A12's Cancel" 1 "$(P 'select count(*) from series')"
check "items after A12's Cancel" $((454 + N - 62)) "$(P 'select count(*) from items')"
check "first on the nook" "Mirage, reading order" "$(nook_names "$JAR_A" | cut -d'|' -f1)"
check "the nook's line" found "$(has "5 shelves $DOT $((411 + N)) works on them $DOT 5 done" "$(curl -s -b "$JAR_A" "$APP/nook")")"

# 7. The count block after the walk (section 0)
counts "after the walk:" 5 17 $((411 + N)) $((454 + N - 62))
check "after the walk: done" 5 "$(P "select count(*) from shelf_entries where status = 'done'")"
check "after the walk: skipped" 1 "$(P "select count(*) from shelf_entries where status = 'skipped'")"
check "after the walk: item_sources" $((454 + N)) "$(P 'select count(*) from item_sources')"

# 8. A13's seven reds, each followed by what it must leave alone
# First: a move of a Watch List work into a TMNT section is 404, the order kept.
MAIN=$(P "select id from shelf_sections where shelf = '$TMNT' and position = 1")
ENTRY=$(P "select id from shelf_entries where shelf = '$WATCH' and position = 1")
ORDER="select md5(string_agg(id::text || ':' || position, ',' order by position)) from shelf_entries where shelf = '$WATCH'"
before=$(P "$ORDER")
check "red 1, a move into another shelf's section" 404 "$(code -b "$JAR_A" -X PATCH "$APP/api/v1/shelves/$WATCH/entries/$ENTRY" -H 'content-type: application/json' -d "{\"section\":\"$MAIN\",\"index\":0}")"
check "red 1, the Watch List's order" "$before" "$(P "$ORDER")"

# Second: a film beside a uuid the catalog doesn't hold is 400, nothing added.
FILM=$(P "select item from item_sources where source = 'letterboxd' and key = '20ZQ'")
NOBODY=$(node.exe -p 'crypto.randomUUID()' | tr -d '\r')
check "red 2, an unknown work beside a film" 400 "$(code -b "$JAR_A" -X POST "$APP/api/v1/shelves/$BOOKS/entries" -H 'content-type: application/json' -d "{\"items\":[\"$FILM\",\"$NOBODY\"]}")"
check "red 2, the publication-order shelf" 11 "$(P "select count(*) from shelf_entries where shelf = '$BOOKS'")"

# Third: the stranger deleting your Watch List is 404, and it stays.
check "red 3, the stranger deletes your shelf" 404 "$(code -b "$JAR_B" -X DELETE "$APP/api/v1/shelves/$WATCH")"
check "red 3, shelves" 5 "$(P 'select count(*) from shelves')"

# Fourth: a section delete whose renumbering throws loses no work (a test double).
check "red 4, the throw mid-transaction" 0 "$(npm run test:db -- tests/db/shelf-writes.test.ts -t 'throw mid-transaction' >/dev/null 2>&1; echo $?)"

# Fifth: a section named as one the shelf has is 409, naming it. The body
# goes in on stdin, so the dot reaches curl as UTF-8.
body=$(printf '{"name":"Volume 1 %s Main Series"}' "$DOT" |
  curl -s -b "$JAR_A" -w ' %{http_code}' -X POST "$APP/api/v1/shelves/$TMNT/sections" -H 'content-type: application/json' --data-binary @-)
check "red 5, a section's name twice" 409 "${body##* }"
check "red 5, the 409 names it" found "$(has "named Volume 1 $DOT Main Series." "$body")"
check "red 5, TMNT's sections" 14 "$(P "select count(*) from shelf_sections where shelf = '$TMNT'")"

# Sixth: the move route answered 500 by a stub puts the row back (an e2e on
# its own account; Playwright reuses the dev server you started).
check "red 6, a refused move puts the row back" 0 "$(npx playwright test tests/e2e/shelf-drag.spec.ts -g 'answered 500' >/dev/null 2>&1; echo $?)"

# Seventh: the stranger marking one of your works is 404, the status kept.
check "red 7, the stranger marks your work" 404 "$(code -b "$JAR_B" -X PATCH "$APP/api/v1/shelves/$WATCH/entries/$ENTRY" -H 'content-type: application/json' -d '{"status":"done"}')"
check "red 7, its status" unmarked "$(P "select status from shelf_entries where id = '$ENTRY'")"

check "your shelves after the reds" 5 "$(P "select count(*) from shelves s join auth.users u on u.id = s.owner where u.email = '$EMAIL'")"
check "your works on them after the reds" $((411 + N)) "$(P "select count(*) from shelf_entries e join shelves s on s.id = e.shelf join auth.users u on u.id = s.owner where u.email = '$EMAIL'")"

# 9. Back to a clean database, so test:db starts from nothing
by_hand step_stop
require "dev server down" 000 "$(code "$APP/")"
check "db reset" 0 "$(npx supabase db reset >/dev/null 2>&1; echo $?)"

summary
[ "$failed" -eq 0 ]
