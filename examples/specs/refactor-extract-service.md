# Extract `BillingService` from the `/checkout` handler

## Context

`src/routes/checkout.ts` has accreted 600 lines of business logic
directly in the HTTP handler: price calculation, discount application,
tax lookup, payment authorization, order persistence. This is the third
time in six months we've had to change something here and break
something else.

Pure refactor — no behavior changes, no new features. Tests must pass
at every intermediate commit.

## Tasks

- [ ] Create `src/services/billing/BillingService.ts` with a narrow
      interface: `calculate(cart) → BillingResult`,
      `authorize(result) → AuthorizationResult`, `finalize(cart, auth)
      → Order`.
- [ ] Move pure functions first: price, discount, tax. Write
      characterization tests for each before moving.
- [ ] Move the payment authorization call next. Wrap the external
      client behind a `PaymentGateway` port so we can stub it in tests.
- [ ] Finally, slim `/checkout` to three calls: `calculate`,
      `authorize`, `finalize`. It should be ≤40 lines.
- [ ] The existing integration tests for `/checkout` must pass at each
      commit without modification.

## Non-goals

- Changing the public API of `/checkout`. Same request/response shape.
- Adding new payment methods. Keep the existing gateway.
- Rewriting tests. Extract tests alongside the code they cover, but
  don't redesign the test suite.

## Acceptance criteria

- `git log --oneline` shows 4–6 commits, each independently passing
  tests.
- `wc -l src/routes/checkout.ts` ≤ 80.
- Coverage for the extracted service ≥ the coverage of the original
  lines before extraction.
- No behavior diff detectable by the existing integration suite.

## Open questions

- Existing error classes — are they service-layer friendly or
  HTTP-shaped? If HTTP-shaped, we need to introduce a domain-error
  layer in a separate spec.
