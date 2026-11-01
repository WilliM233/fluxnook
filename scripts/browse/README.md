# Browse scripts

From Ch 1.5 a Signature's Browse is a script here, `<vol>.<n>.<s>.sh` (House Rules step 7). Run one from the repo root in Git Bash, with the local stack up and the tree clean:

```
bash scripts/browse/1.5.1.sh
```

It prints every check as its name, the expected value, the actual one, and pass or fail, and ends with a count. A step that isn't a command for that terminal (start or stop the dev server, a walk in the browser) prints as a numbered step and waits for Enter; the check after it confirms the state it set up. The report lands in `test-results/browse-<vol>.<n>.<s>.txt` (ignored by git), which is what goes in the PR's Browse section, with anything that differed.

Playwright empties `test-results/` whenever it starts, so copy or paste the report before running `npm run test:e2e`.

`BROWSE_EMAIL` names the address to sign in with; without it the script asks. A script that starts with `npx supabase db reset` signs in again before loading the fixtures, since a reset drops every account.
