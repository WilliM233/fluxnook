# Raw fixture inputs

Raw files are exports and sheets kept exactly as their source wrote them, and they are never edited by hand. Git normalizes CRLF to LF on commit; nothing else changes. On a Windows checkout `git ls-files --eol` may show a file as `w/crlf` or `w/lf` depending on how it was last written (a `git checkout --` renormalizes it); that's git, not an edit, and the builder reads both.

A wrong value in a raw file is fixed by a re-export or by a later chapter's reconciliation, never by an edit here.

| File | What it is | Where it came from | When |
|---|---|---|---|
| `letterboxd/stephen-king-watch-list.csv` | Letterboxd list export v7 of L's "Stephen King Watch List": 61 films, list dated 2024-04-01, https://boxd.it/upKRw | L's Letterboxd account export, Lists folder | Exported 2026-10-22 |
| `google-sheets/tmnt-mirage.csv` | The Mirage tab of L's TMNT sheet: 326 rows in 14 sections, 26 read, 37 owned through the five Ultimate Collections | L's Google Sheet (private, no public link), Mirage tab, File > Download > Comma-separated values | Exported 2026-10-23 |

Adding a raw file: put it under `<source>/`, add its row here and a `SOURCES` line in `scripts/fixtures-build.mjs`, run `npm run fixtures:build`, and commit the raw file and its JSON together.
