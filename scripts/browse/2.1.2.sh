#!/usr/bin/env bash
# Browse 2.1.2, The shell and the builds (#101, #99): the chapter's exit walk, on
# L's phone and on this PC. Build A goes on, its first launch is killed on purpose
# before the store's first flush, King is added, the app is swiped away and
# reopened, build B installs over A and keeps King, and Android refuses A back
# over B. Then the same on Windows with the two installers.
#
# Git Bash, from a clean tree pushed to origin, nothing on ports 3000 or 4173,
# the phone plugged in, unlocked, and holding no Fluxnook; this PC with none
# installed. Run it as:
#   bash scripts/browse/2.1.2.sh                 L's walk, the whole thing
#   bash scripts/browse/2.1.2.sh --checks-only   the Binder's run: every check up
#                                                to the first install, then stop
#
# The first install on the phone and on this PC is L's and is never undone: from
# this walk on, the phone carries L's nook from build to build and is never reset
# (House Rules step 7). So the Binder's run can't make it.
#
# Every check prints its name, what was expected, what came back, and pass or
# fail. A precondition that fails ends the run there with the summary. A step for
# your hands prints one action per line and waits for Enter; the check after it
# reads the state it set up. Every step is written to browse-results/2.1.2-steps.md
# before the first pause. The report is appended, never truncated:
# browse-results/2.1.2.txt for the walk, browse-results/2.1.2-checks.txt for the
# Binder's run. Each test run and download keeps its own folder or file, stamped.

set -u
cd "$(dirname "$0")/../.." || exit 1

# Measured, each where the plan says (docs/plans/2.1.2-builds.md, History).
IDENTIFIER=app.fluxnook                       # Q1, L; pinned by tests/unit/shell-config.test.ts
ACTIVITY=app.fluxnook/.MainActivity           # src-tauri/gen/android, step 8
# The certificate of the key L backed up (step 2), as apksigner prints it.
KEY_SHA256=d7fa622ba84e325d0d3ed08fd34b7e9894cf48d31c3e7c5fe0e06bc79900521d
EXE=fluxnook.exe                              # step 3
UNINSTALL_KEY='HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Fluxnook' # step 11, a test install
DATA_DIR="$LOCALAPPDATA/$IDENTIFIER"          # step 3: WebView2's data under the identifier
SDK=/c/Users/willi/AppData/Local/Android/Sdk
ADB="$SDK/platform-tools/adb.exe"
AAPT="$SDK/build-tools/37.0.0/aapt.exe"
APKSIGNER="$SDK/build-tools/37.0.0/apksigner.bat"
JBR='C:\Program Files\Android\Android Studio\jbr'

PREVIEW=http://localhost:4173
APP=http://localhost:3000
BRANCH=signature/2.1.2-builds

MODE=walk
[ "${1:-}" = "--checks-only" ] && MODE=checks
if [ "$MODE" = checks ]; then
  REPORT=browse-results/2.1.2-checks.txt
else
  REPORT=browse-results/2.1.2.txt
fi
STEPS=browse-results/2.1.2-steps.md
RUN=$(date '+%Y%m%d-%H%M%S')

mkdir -p browse-results
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

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
kept() { echo "browse-results/2.1.2-$RUN-$1.txt"; }
says() { grep -qE "^ +$2( |\$)" "$1" && echo found || echo missing; }
has() { grep -qF "$2" "$1" && echo found || echo missing; }

adb() { "$ADB" "$@" | tr -d '\r'; }
phone_count() { adb shell pm list packages | grep -c fluxnook; }
phone_version() { adb shell dumpsys package "$IDENTIFIER" | grep -m1 versionName | sed 's/.*versionName=//'; }
phone_running() { adb shell pidof "$IDENTIFIER" >/dev/null 2>&1 && echo running || echo none; }
apksigner() { JAVA_HOME="$JBR" "$APKSIGNER" "$@" | tr -d '\r'; }
apk_key() { apksigner verify --print-certs "$1" | grep -m1 'SHA-256 digest' | sed 's/.*: //'; }
# The space before the field: `platformBuildVersionName='17'` also ends in name=.
apk_badge() { "$AAPT" dump badging "$1" | tr -d '\r' | grep -m1 '^package:' | sed -n "s/.* $2='\([^']*\)'.*/\1/p"; }
win_version() { reg query "$UNINSTALL_KEY" //v DisplayVersion 2>/dev/null | tr -d '\r' | awk '/DisplayVersion/ {print $3}'; }
win_entries() { reg query "$UNINSTALL_KEY" >/dev/null 2>&1 && echo 1 || echo 0; }
win_running() { tasklist //FI "IMAGENAME eq $EXE" | tr -d '\r' | grep -ci "^$EXE"; }

# Builds A and B, read from git: B is this head; A is the commit before the one
# that bumped package.json's version, so A prints the version before the bump.
B_SHA=$(git rev-parse HEAD)
BUMP_SHA=$(git log -1 --format=%H -G'"version":' origin/dev..HEAD -- package.json)
A_SHA=$([ -n "$BUMP_SHA" ] && git rev-parse "$BUMP_SHA^" || echo "")
A_LABEL=${A_SHA:0:7}
B_LABEL=${B_SHA:0:7}
A_VERSION=$([ -n "$A_SHA" ] && git show "$A_SHA:package.json" | grep -m1 '"version"' | cut -d'"' -f4)
B_VERSION=$(grep -m1 '"version"' package.json | cut -d'"' -f4)
A_CODE=$([ -n "$A_VERSION" ] && node.exe scripts/version-code.mjs "$A_VERSION")
B_CODE=$(node.exe scripts/version-code.mjs "$B_VERSION")
A_DIR=browse-results/2.1.2-$RUN-A
B_DIR=browse-results/2.1.2-$RUN-B

step_install_a() {
  echo "Step P3 of the walk: the first open"
  echo "On the phone, open Fluxnook from the app drawer."
  echo "The first line reads:"
  echo "  14 migrations · 22 tables"
  echo "Under it:"
  echo "  $A_VERSION"
  echo "  build $A_LABEL"
  echo "Nothing is listed under the Shelf name field."
  echo "No words in red."
}

step_king_phone() {
  echo "Step P4: a shelf"
  echo "Type in Shelf name:"
  echo "  King"
  echo "Tap Add."
  echo "One shelf is listed:"
  echo "  King"
}

step_swipe() {
  echo "Step P5: swipe it away"
  echo "Open the recent apps (the square, or swipe up and hold)."
  echo "Swipe Fluxnook away."
}

step_reopen_phone() {
  echo "Step P6: it stays"
  echo "Open Fluxnook from the app drawer."
  echo "The first line reads:"
  echo "  14 migrations · 22 tables"
  echo "One shelf is listed:"
  echo "  King"
}

step_open_b_phone() {
  echo "Step P8: build B over build A"
  echo "Open Fluxnook from the app drawer."
  echo "Under the counts:"
  echo "  $B_VERSION"
  echo "  build $B_LABEL"
  echo "One shelf is listed:"
  echo "  King"
}

step_install_a_win() {
  echo "Step W1: build A on this PC"
  echo "Run this installer (double-click it in Explorer):"
  echo "  $(cygpath -w "$A_DIR")\\fluxnook-windows\\<the -setup.exe there>"
  echo "Click through it with the defaults."
  echo "If it offers to run Fluxnook at the end, leave that unticked."
}

step_open_a_win() {
  echo "Step W2: the first open"
  echo "Open Fluxnook from the Start menu."
  echo "The first line reads:"
  echo "  14 migrations · 22 tables"
  echo "Under it:"
  echo "  $A_VERSION"
  echo "  build $A_LABEL"
  echo "Nothing is listed."
}

step_king_win() {
  echo "Step W3: a shelf"
  echo "Type in Shelf name:"
  echo "  King"
  echo "Click Add."
  echo "One shelf is listed:"
  echo "  King"
}

step_second_win() {
  echo "Step W4: a second window"
  echo "Leave the first window open."
  echo "Open Fluxnook from the Start menu again."
  echo "The second window reads, in red:"
  echo "  Fluxnook couldn't open its database: Fluxnook is already open in another window."
  echo "The first window still lists:"
  echo "  King"
  echo "Close the second window."
}

step_close_win() {
  echo "Step W5: close it"
  echo "Close the Fluxnook window."
}

step_reopen_win() {
  echo "Step W6: it stays"
  echo "Open Fluxnook from the Start menu."
  echo "One shelf is listed:"
  echo "  King"
  echo "Then close the window."
}

step_install_b_win() {
  echo "Step W7: build B over build A"
  echo "Run this installer:"
  echo "  $(cygpath -w "$B_DIR")\\fluxnook-windows\\<the -setup.exe there>"
  echo "Click through it with the defaults."
  echo "If it asks about removing the old version's data, keep the data."
  echo "If it offers to run Fluxnook at the end, leave that unticked."
}

step_open_b_win() {
  echo "Step W8: build B"
  echo "Open Fluxnook from the Start menu."
  echo "Under the counts:"
  echo "  $B_VERSION"
  echo "  build $B_LABEL"
  echo "One shelf is listed:"
  echo "  King"
  echo "Close the window."
}

HANDS=(step_install_a step_king_phone step_swipe step_reopen_phone step_open_b_phone
  step_install_a_win step_open_a_win step_king_win step_second_win step_close_win
  step_reopen_win step_install_b_win step_open_b_win)

if [ "$MODE" = walk ]; then
  {
    echo "# Browse 2.1.2, the steps for your hands"
    echo ""
    echo "The phone, then this PC. The script installs and kills between your steps"
    echo "and checks what each one left; wait for its prompt before the next."
    for step in "${HANDS[@]}"; do
      block "$step"
    done
  } >"$STEPS"
fi

say ""
say "Browse 2.1.2, The shell and the builds ($MODE)"
say "at $(git log -1 --oneline), $(date '+%Y-%m-%d %H:%M')"
[ "$MODE" = walk ] && say "The steps for your hands are in $STEPS."
say ""

# 0. Where the walk starts; each of these ends the run when it fails
require "tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"
require "the branch" "$BRANCH" "$(git branch --show-current)"
git fetch -q origin "$BRANCH"
require "pushed: head equals origin" "$(git rev-parse "origin/$BRANCH")" "$B_SHA"
require "port 3000 free" 000 "$(code "$APP/")"
require "port 4173 free" 000 "$(code "$PREVIEW/")"
require "one phone attached" 1 "$("$ADB" devices | tr -d '\r' | grep -c $'\tdevice$')"
require "no Fluxnook on the phone, from any key" 0 "$(phone_count)"
require "no Fluxnook data on this PC" absent "$([ -e "$DATA_DIR" ] && echo present || echo absent)"
require "no Fluxnook installed on this PC" 0 "$(win_entries)"

# 1. A2: all 14 through the device's own list, on PGlite in Node
R=$(kept a2-migrate)
npx vitest run tests/unit/device-migrate.test.ts --reporter=verbose >"$R" 2>&1
check "A2 the migration test, exit" 0 "$?"
check "A2 14 migrations applied, 22 tables" found "$(has "$R" '14 migrations applied, 22 tables')"

# 2. The stub in Chromium, which builds and serves itself and stops
R=$(kept stub-e2e)
npx playwright test tests/e2e/device-stub.spec.ts --reporter=list >"$R" 2>&1
check "the stub's e2e, exit" 0 "$?"
check "the stub's e2e, 6 passed" found "$(says "$R" '6 passed')"
require "port 4173 free again" 000 "$(code "$PREVIEW/")"

# 3. Builds A and B: their commits, their runs, their artifacts
require "the version bump found on this branch" found "$([ -n "$BUMP_SHA" ] && echo found || echo missing)"
measured "build A" "$A_LABEL, $A_VERSION, versionCode $A_CODE"
measured "build B" "$B_LABEL, $B_VERSION, versionCode $B_CODE"
for side in A B; do
  sha_var=${side}_SHA
  dir_var=${side}_DIR
  run=$(gh run list --workflow build.yml --commit "${!sha_var}" --status success --limit 1 --json databaseId -q '.[0].databaseId')
  require "build $side: a green build.yml run on its commit" yes "$([ -n "$run" ] && echo yes || echo no)"
  measured "build $side's run" "https://github.com/WilliM233/fluxnook/actions/runs/$run"
  gh run download "$run" -D "${!dir_var}" >/dev/null 2>&1
  require "build $side: downloaded, one apk" 1 "$(find "${!dir_var}" -name '*.apk' | wc -l | tr -d ' ')"
  require "build $side: downloaded, one installer" 1 "$(find "${!dir_var}" -name '*-setup.exe' | wc -l | tr -d ' ')"
done
A_APK=$(find "$A_DIR" -name '*.apk')
B_APK=$(find "$B_DIR" -name '*.apk')
A_SETUP=$(find "$A_DIR" -name '*-setup.exe')
B_SETUP=$(find "$B_DIR" -name '*-setup.exe')

# 4. Each apk: L's key, the identifier, its version and code
for side in A B; do
  apk_var=${side}_APK
  ver_var=${side}_VERSION
  code_var=${side}_CODE
  check "build $side: signed by the key L backed up" "$KEY_SHA256" "$(apk_key "${!apk_var}")"
  check "build $side: the identifier" "$IDENTIFIER" "$(apk_badge "${!apk_var}" name)"
  check "build $side: versionName" "${!ver_var}" "$(apk_badge "${!apk_var}" versionName)"
  check "build $side: versionCode" "${!code_var}" "$(apk_badge "${!apk_var}" versionCode)"
done
check "build A's code is below build B's" yes "$([ "$A_CODE" -lt "$B_CODE" ] && echo yes || echo no)"

if [ "$MODE" = checks ]; then
  say ""
  say "Checks only: the installs on the phone and this PC are L's walk, never the Binder's."
  summary
  [ "$failed" -eq 0 ]
  exit
fi
[ "$failed" -eq 0 ] || {
  say "Stopped before the first install: a check above failed."
  summary
  exit 1
}

# 5. The phone. P1: build A on, from L's key
check "P1 adb install A" Success "$(adb install "$A_APK" | tail -1)"
check "P1 one Fluxnook on the phone" 1 "$(phone_count)"

# P2: its first launch killed on purpose, inside the first open
started=$(date +%s%3N)
adb shell am start -W -n "$ACTIVITY" >/dev/null
adb shell am force-stop "$IDENTIFIER"
measured "P2 start to kill" "$(($(date +%s%3N) - started)) ms (the probe's first open on the phone: 1571 to 1805 ms)"
check "P2 no process left" none "$(phone_running)"

by_hand step_install_a
by_hand step_king_phone
by_hand step_swipe
if [ "$(phone_running)" = running ]; then
  measured "P5 a process after the swipe" "running, stopped now so the next open reads the store"
  adb shell am force-stop "$IDENTIFIER"
fi
check "P5 no process left" none "$(phone_running)"
by_hand step_reopen_phone

# P7: build B over build A
check "P7 adb install -r B" Success "$(adb install -r "$B_APK" | tail -1)"
check "P7 one Fluxnook on the phone" 1 "$(phone_count)"
check "P7 versionName on the phone" "$B_VERSION" "$(phone_version)"
by_hand step_open_b_phone

# P9: Android refuses A back over B (the Nookkeeper, plan review)
check "P9 adb install -r A over B refused" found "$(adb install -r "$A_APK" 2>&1 | grep -q INSTALL_FAILED_VERSION_DOWNGRADE && echo found || echo missing)"
check "P9 one Fluxnook, still B" "$B_VERSION" "$(phone_version)"

# 6. This PC. W1: build A's installer
measured "W1 the installer" "$(cygpath -w "$A_SETUP")"
by_hand step_install_a_win
check "W1 one Fluxnook installed" 1 "$(win_entries)"
check "W1 its version" "$A_VERSION" "$(win_version)"
by_hand step_open_a_win
by_hand step_king_win
by_hand step_second_win
by_hand step_close_win
check "W5 no $EXE left" 0 "$(win_running)"
by_hand step_reopen_win
check "W6 no $EXE left" 0 "$(win_running)"
measured "W7 the installer" "$(cygpath -w "$B_SETUP")"
by_hand step_install_b_win
check "W7 one Fluxnook installed" 1 "$(win_entries)"
check "W7 its version" "$B_VERSION" "$(win_version)"
# An installer left to run Fluxnook at its finish makes W8's open a second window.
check "W7 no $EXE running before W8" 0 "$(win_running)"
by_hand step_open_b_win

# W9: Windows refuses A back over B, P9's twin (the Nookkeeper, 2026-11-07).
# `allowDowngrades: false` makes a silent install of an older build stop.
check "W9 no $EXE running" 0 "$(win_running)"
# Measured before the walk: it stops at once with "Downgrades are disabled for
# this installer, can't proceed with the silent installer", exit 2, and launches
# nothing. A timeout so a launched app can't hold the walk.
timeout 120 "$A_SETUP" //S
check "W9 A's silent installer over B refused, exit" 2 "$?"
sleep 5
check "W9 still one Fluxnook installed" 1 "$(win_entries)"
check "W9 its version, still B" "$B_VERSION" "$(win_version)"

# 7. Nothing left behind but L's nook
check "tree clean" 0 "$(git status --short | wc -l | tr -d ' ')"
check "one Fluxnook on the phone" 1 "$(phone_count)"

summary
[ "$failed" -eq 0 ]
