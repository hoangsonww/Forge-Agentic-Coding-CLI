---
name: generate-api-docs
description: Produce OpenAPI / route reference from source of truth (the routes).
inputs:
  - entry_point
  - output_format
tools:
  - read_file
  - write_file
  - grep
  - glob
  - run_command
tags:
  - documentation
  - api
---

## Instructions

Docs that drift are worse than no docs. Generate from the routes, don't
hand-maintain.

1. **Find the routes**. `grep` for `app.get` / `router.post` / `@Get(`
   / `fastify.route` — whatever the project uses. Map every public
   endpoint.

2. **Extract the contract for each route**:
   - HTTP method + path.
   - Path params, query params, body schema. Pull from zod / class-
     validator / pydantic where present — don't re-derive.
   - Response schema + status codes.
   - Authentication requirements (middleware chain).
   - Idempotency / caching hints (if declared).

3. **Emit in the requested format**:
   - **OpenAPI 3.1** (`openapi.yaml`). Prefer over 3.0 unless the
     downstream tool doesn't support it yet.
   - **Markdown route table** for a `docs/API.md`:
     ```markdown
     | Method | Path | Auth | Request | Response |
     |--------|------|------|---------|----------|
     | GET    | /v1/users/:id | bearer | — | `User` |
     ```
   - **Postman collection** (JSON) if the repo already tracks one.

4. **Examples are doc gold**. For each endpoint include a minimal
   `curl` and a minimal response body. Don't invent values — pull them
   from an existing test fixture if possible.

5. **Validate**. `openapi-lint` / `redocly lint` / `spectral lint` must
   pass.

6. **Wire the generation into CI**. If the docs are checked in, add a
   CI job that regenerates them and diff-checks against the committed
   file. Drift that survives one PR becomes folklore.

**Avoid**: Swagger 2.0 / JSON schema sprinkled by hand. If the framework
has a first-party integration (fastify-swagger, drf-spectacular,
springdoc), use that.
