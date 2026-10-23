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

## What someone would get wrong

- **`/me` and a missing session.** No cookie, an expired session and an unreachable auth server are all 401.
- **`/me` email.** It is whatever the auth server stored. The response schema strips every other user field but doesn't re-validate the address.
- **Magic link takes JSON only.** `content-type` must be `application/json`, or it's 415. A text/plain or form post from another site needs no preflight and could start a sign-in in a visitor's browser for a link mailed to someone else (login CSRF). Body is `{ "email": string }`.
- **The link works in the browser that asked.** The magic-link request sets a PKCE verifier cookie; the callback needs it. Opened anywhere else, the callback sends you to `/?error=link`.
- **The callback has fixed destinations.** `/nook` or `/?error=link`. There is no `next` parameter, so the link can't become an open redirect.
- **Sign-out is every device.** `signOut()` runs with its default global scope. If the auth server errors, the session is kept and the route says 502 rather than 204.
