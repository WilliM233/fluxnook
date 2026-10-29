# API

Every mutation is a route handler under `src/app/api/v1`, Zod-validated at the edge. No server actions. The session is a cookie set by `@supabase/ssr`; there are no bearer tokens yet.

## Errors

Every error body has one shape:

```json
{ "error": { "code": "unauthorized", "message": "Sign in to see this." } }
```

`code` is for clients to branch on. `message` is for people and may change. Errors and `GET /api/v1/me` send `Cache-Control: no-store`.

## Routes

| Route | Success | Errors |
|---|---|---|
| `GET /api/v1/me` | 200 `{ "id": uuid, "email": string }` | 401 `unauthorized` |
| `POST /api/v1/auth/magic-link` | 204, link emailed | 415 `unsupported_media_type`, 400 `invalid_request`, 429 `rate_limited`, 502 `auth_error` |
| `GET /api/v1/auth/callback?code=…` | 303 to `/nook` | 303 to `/?error=link` |
| `POST /api/v1/auth/sign-out` | 204 | 502 `auth_error` |
| `GET /api/v1/providers/tmdb/search?q=&type=all\|film\|tv&page=` | 200 `{ page, totalPages, results }`, each result a TMDB film or show plus `catalog` | 401 `unauthorized`, 400 `invalid_request`, 503 `provider_unavailable` |
| `POST /api/v1/items/import` `{ "source": "tmdb", "key": "movie/603", "attachTo"?: uuid }` | 201 `{ "id" }` a new item; 200 `{ "id" }` the key was already in, or an attach | 401 `unauthorized`, 415 `unsupported_media_type`, 400 `invalid_request`, 404 `not_found`, 409 `conflict`, 503 `provider_unavailable` |
| `GET /api/v1/providers/openlibrary/search?q=&page=` | 200 `{ page, totalPages, results }`, 20 a page, each result an Open Library work plus `catalog` | 401 `unauthorized`, 400 `invalid_request`, 503 `provider_unavailable` |
| `GET /api/v1/providers/openlibrary/isbn/<isbn>` | 200 `{ edition, work, editionCatalog }`; `work` carries `catalog` as search computes it; `editionCatalog` is `{ "status": "in", editionId, itemId }` or `{ "status": "new" }` | 401 `unauthorized`, 400 `invalid_request`, 404 `not_found`, 503 `provider_unavailable` |
| `POST /api/v1/items/import` `{ "source": "openlibrary", "key": "works/OL81626W", "attachTo"?: uuid }` | As the TMDB row: 201 new, 200 known or attached | As the TMDB row |
| `POST /api/v1/editions/import` `{ "source": "openlibrary", "key": "books/OL32864645M", "format": "paperback"\|"hardcover"\|"ebook"\|"audiobook", "attachTo"?: uuid }` | 201 `{ "id", "itemId" }` a new edition; 200 `{ "id", "itemId" }` the key or an ISBN was already in | 401 `unauthorized`, 415 `unsupported_media_type`, 400 `invalid_request`, 404 `not_found`, 409 `conflict`, 503 `provider_unavailable` |
| `GET /api/v1/providers/comicvine/search?q=` | 200 `{ results }`, up to 20 Comic Vine volumes, each plus `catalog`; no `page` | 401 `unauthorized`, 400 `invalid_request`, 503 `provider_unavailable` |
| `POST /api/v1/items` | 201 `{ "id" }` | 401 `unauthorized`, 415 `unsupported_media_type`, 400 `invalid_request` |

`POST /api/v1/items/import` takes `source` `tmdb` or `openlibrary`; the `key` pattern follows the source (`movie/<digits>` or `tv/<digits>`; `works/OL<digits>W`). A 400 from either search, the edition import or `POST /api/v1/items` also carries `error.fields`, `{ "<field>": "<what to fix>" }`, one entry per field.

## Providers and the catalog

`catalog` on a search result is one of `{ "status": "in", "itemId" }` (a `tmdb` source row exists), `{ "status": "match", "itemId", "title", "year", "source", "shelf", "candidates" }` (no `tmdb` source, but an item of the same type has the same title once case, punctuation and a leading article are folded, and a year within 1; the fields describe the first candidate, `candidates` lists all) and `{ "status": "new" }`. `q` is two or more characters, `page` is 1 to 500, `type` defaults to `all`. TV results carry their season count: the route fetches each show's details beside the search.

Open Library's `catalog` has the same three states with a different rule: `in` when an `openlibrary` source row exists; `match` when no `openlibrary` source exists but a `book` item has the same folded title and its author equals one of the result's names, or all of them in any order, once folded. `match` also carries `author`. Year plays no part. Search is `page` 1 to 100, 20 rows a page. A 503 text names the provider.

`POST /api/v1/items` takes `type` (`film`, `tv`, `book`, `comic`) and `title`, then per type: a book needs `form` and `author`, a comic needs `form`, film and tv forbid `form`. `month` needs `year` and `day` needs `month`. The item's `created_by` is the caller and its `manual` source key is its own uuid.

Comic Vine's `catalog` is one of `{ "status": "in", "seriesId" }` (a `series_sources` row `comicvine` / `volume/<id>` exists), `{ "status": "match", "group", "label", "count", "earliest", "shelf", "candidates" }` and `{ "status": "new" }`. `group` is `series` or `collected`; `earliest` is a year, null for `collected`; `shelf` is the signed-in user's first shelf holding the group's earliest item, or null. `q` is two or more characters.

## What someone would get wrong

- **`/me` and a missing session.** No cookie, an expired session and an unreachable auth server are all 401.
- **`/me` email.** It is whatever the auth server stored. The response schema strips every other user field but doesn't re-validate the address.
- **Magic link takes JSON only.** `content-type` must be `application/json`, or it's 415. A text/plain or form post from another site needs no preflight and could start a sign-in in a visitor's browser for a link mailed to someone else (login CSRF). Body is `{ "email": string }`.
- **The link works in the browser that asked.** The magic-link request sets a PKCE verifier cookie; the callback needs it. Opened anywhere else, the callback sends you to `/?error=link`.
- **The callback has fixed destinations.** `/nook` or `/?error=link`. There is no `next` parameter, so the link can't become an open redirect.
- **The TMDB token and the Supabase secret key are server-only.** `TMDB_API_KEY` and `SUPABASE_SECRET_KEY` are read through `readServerEnv`, never `NEXT_PUBLIC_`, and no response carries them or TMDB's own error text. A search with no token is 503 `provider_unavailable` and nothing else breaks.
- **The routes never take a URL.** A TMDB call and a poster fetch are built from `TMDB_BASE_URL`, `TMDB_IMAGE_BASE_URL` and the key or `poster_path` TMDB returned. The import key must match `movie/<digits>` or `tv/<digits>`, and the body takes no other field (a stray one is 400).
- **Import is idempotent by key.** `movie/0133805` is `movie/133805`. A key already in the catalog is 200 with its item, and `attachTo` is ignored then.
- **Attach never overwrites.** With `attachTo`, the item gains the `tmdb` source and every column it lacked. It keeps its title and summary, and keeps its date unless the date is missing or TMDB's is finer in the same year. `attachTo` is 409 when the item already has a `tmdb` source, is the other type, or doesn't look like the result (same title once folded, year within 1); 404 when no such item. There is no undo this chapter.
- **A poster failure is not an import failure.** Import writes the item first, then fetches the poster to `covers/tmdb/<kind>/<id>.<ext>`. If the fetch or the write fails, or `SUPABASE_SECRET_KEY` is empty, the response is still 201 or 200 and `cover_path` stays null. The reason goes to the server log.
- **Books match on author, not year.** Open Library's first-publish year is often wrong (Night Shift is 1960 there, 1977 in the fixture). The same rule gates `attachTo` for a book: 409 when the type, the folded title or the folded author doesn't fit, or the item already has an `openlibrary` source.
- **An ISBN never reaches Open Library unless its check digit holds.** The route normalizes first (hyphens and spaces stripped, a 10 converted to its 13) and answers 400 "That isn't a valid ISBN." without a request. Open Library resolves junk ISBNs such as `9780000000002` to junk editions, so the digit is the only guard. A valid ISBN Open Library doesn't have is 404. The route's 404 says "Open Library has no book for that ISBN."; the page shows its own sentence.
- **An edition import is idempotent by its key or any of its ISBNs.** The second post is 200 and writes nothing. It imports the work first as `items/import` would; a work key already in the catalog answers before `attachTo` is read. 409 when the Open Library edition's work isn't the item. A 10-digit ISBN with no 13 is stored as its 13. An edition naming no work is 404.
- **Open Library attach never touches form, author or title.** It fills `summary` only when null and takes the same date rule as TMDB. A new book from Open Library is a `novel`; a work with no authors gets the author "Unknown". Authors are text joined with ", ".
- **The cover is the work's first positive cover id.** Written to `covers/openlibrary/<id>.jpg` from `-L` with `?default=false`, so a missing cover is a 404 and not a pixel. A failure is logged and the import still succeeds. An edition's own cover is not stored.
- **The client follows Open Library's redirect only under `OPENLIBRARY_BASE_URL`.** An off-host or second redirect is a 502 `ProviderError`. Every call has a 20 s timeout. A non-2xx surfaces as the status only; Open Library's words never reach a response. `OPENLIBRARY_CONTACT` appears in the `User-Agent` header and nowhere else.
- **Manual films and shows are strict.** An unknown field is 400, so `form` on a film or tv is rejected, not ignored.
- **A series matches on name, first year and publisher, never the volume number.** A hand-entered `item_comics.series` text matches a Comic Vine volume when, with a trailing `Vol. <n>` and a `(...)` removed from the text and everything folded, the names are equal, both have a year and the years are within 1, and, when the text ends in a parenthetical after its `Vol. <n>`, that parenthetical folds equal to the volume's publisher exactly ("(IDW)" does not match "IDW Publishing"). A parenthetical of digits, as Comic Vine prints "(1984)", names no publisher. A group with no year never matches. Comics already holding a `comicvine` source are not counted.
- **Collected editions match on a stem.** A `collected` comic's title with its trailing number removed is the stem. It matches a volume when the stem sits in the volume's folded name as whole words, and the name also holds the series fold of something the group's editions contain, so "New X-Men Ultimate Collection" does not take the TMNT five. There is no year gate. The collected candidate with the longer stem, then the larger count, leads.
- **Comic Vine's key and words stay server-side.** `COMICVINE_API_KEY` is read through `readServerEnv`. The key travels in the query string of Comic Vine calls, so the route logs nothing and none of the three 503s carries Comic Vine's text. The sentences are: "Comic search isn't set up on this nook yet.", "Comic Vine is busy. Try again in a few minutes.", "Comic Vine didn't answer. Try again in a moment." The page shows only the first twenty volumes in Comic Vine's relevance order.
- **Sign-out is every device.** `signOut()` runs with its default global scope. If the auth server errors, the session is kept and the route says 502 rather than 204.
