# Add email + password authentication

## Context

We currently only support anonymous sessions. Product wants to let users
register with email + password so their data persists across devices.

OAuth is coming in a separate initiative — this spec is password-only,
server-side, minimal surface area.

## Tasks

- [ ] Add a `users` table with id, email (unique), password_hash,
      created_at. Use the existing migration framework (check
      `migrations/` first).
- [ ] Add `POST /auth/register` and `POST /auth/login`. Return a signed
      session token (JWT) on success.
- [ ] Hash passwords with `argon2id` (not bcrypt). Configurable work
      factor via env.
- [ ] Rate-limit `/auth/login` — 5 attempts per email per 15 minutes,
      returning 429 with a `Retry-After` header.
- [ ] Session middleware: extract the JWT from `Authorization: Bearer
      …`, verify, attach `request.user`.
- [ ] Unit tests for the password hashing helper, the rate limiter, and
      the JWT signer/verifier.
- [ ] Integration tests for the two routes, covering happy path, wrong
      password, unknown email, rate-limit trip.

## Non-goals

- OAuth / social login. Separate spec.
- Email verification flows. Separate spec.
- Password reset. Separate spec.
- Any UI. Server endpoints only.

## Acceptance criteria

- `curl -X POST /auth/register -d '{"email":"a@b.c","password":"..."}'`
  returns 201 with a JWT.
- Logging in with the wrong password returns 401 (not 404 — don't
  confirm email existence).
- `npm test` green.
- No plaintext password ever reaches the database or the logs (grep the
  diff to confirm).

## Open questions

- What JWT library does the codebase already use? If none, propose
  `jose` and wait for confirmation.
- Is there an existing rate-limiter middleware, or do we need to write
  one?
