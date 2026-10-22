# Raw fixture inputs

Raw files are exports and sheets kept exactly as their source wrote them, and they are never edited by hand. Git normalizes CRLF to LF on commit; nothing else changes.

A wrong value in a raw file is fixed by a re-export or by a later chapter's reconciliation, never by an edit here.

| File | What it is | Where it came from | When |
|---|---|---|---|
| `letterboxd/stephen-king-watch-list.csv` | Letterboxd list export v7 of L's "Stephen King Watch List": 61 films, list dated 2024-04-01, https://boxd.it/upKRw | L's Letterboxd account export, Lists folder | Exported 2026-10-22 |

Adding a raw file: put it under `<source>/`, add its row here and a `SOURCES` line in `scripts/fixtures-build.mjs`, run `npm run fixtures:build`, and commit the raw file and its JSON together.
