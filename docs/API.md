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
| `POST /api/v1/items` | 201 `{ "id" }` | 401 `unauthorized`, 415 `unsupported_media_type`, 400 `invalid_request` |

A 400 from search or `POST /api/v1/items` also carries `error.fields`, `{ "<field>": "<what to fix>" }`, one entry per field.

## Providers and the catalog

`catalog` on a search result is one of `{ "status": "in", "itemId" }` (a `tmdb` source row exists), `{ "status": "match", "itemId", "title", "year", "source", "shelf", "candidates" }` (no `tmdb` source, but an item of the same type has the same title once case, punctuation and a leading article are folded, and a year within 1; the fields describe the first candidate, `candidates` lists all) and `{ "status": "new" }`. `q` is two or more characters, `page` is 1 to 500, `type` defaults to `all`. TV results carry their season count: the route fetches each show's details beside the search.

`POST /api/v1/items` takes `type` (`film`, `tv`, `book`, `comic`) and `title`, then per type: a book needs `form` and `author`, a comic needs `form`, film and tv forbid `form`. `month` needs `year` and `day` needs `month`. The item's `created_by` is the caller and its `manual` source key is its own uuid.

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
- **Manual films and shows are strict.** An unknown field is 400, so `form` on a film or tv is rejected, not ignored.
- **Sign-out is every device.** `signOut()` runs with its default global scope. If the auth server errors, the session is kept and the route says 502 rather than 204.
