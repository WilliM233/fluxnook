# Browse scripts

From Ch 1.5 a Signature's Browse is a script here, `<vol>.<n>.<s>.sh` (House Rules step 7). Run one from the repo root in Git Bash, with the local stack up, the dev server stopped and the tree clean:

```
BROWSE_EMAIL=<your address> bash scripts/browse/1.5.2.sh
```

It prints every check as its name, the expected value, the actual one, and pass or fail, and ends with a count. A step that isn't a command for that terminal (start or stop the dev server, a walk in the browser) prints as a numbered step and waits for Enter; the check after it confirms the state it set up.

From 1.5.2 a failed precondition (the tree, the stack, the dev server, the reset, the sign-in, the fixture load) ends the run there with the count, rather than spending minutes on checks that can't pass on a box with Docker down.

Where the report lands:
- `1.5.2.sh` on: `browse-results/<vol>.<n>.<s>.txt` (ignored by git). Playwright never touches that folder, so a script can run an e2e of its own without losing its report.
- `1.5.1.sh`: `test-results/browse-1.5.1.txt`, which Playwright empties whenever it starts; copy the report before running `npm run test:e2e`.

The report is what goes in the PR's Browse section, with anything that differed.

`BROWSE_EMAIL` names the address to sign in with; without it the script asks. A script that starts with `npx supabase db reset` signs in again before loading the fixtures, since a reset drops every account.

Writing one: a non-ASCII character (the middle dot in the counts lines, a section name) reaches curl and psql only as octal bytes (`DOT=$(printf '\302\267')`) or on stdin. Typed into an argument, Windows hands it over in the console's code page and the name comes out a different name (1.5.1, step 5). Write the script with an editor, not a heredoc, which mangles the backslashes on this machine.
