---
name: migrate-database
description: Write and test a safe, reversible database migration.
inputs:
  - change
  - table
tools:
  - read_file
  - write_file
  - grep
  - run_command
  - run_tests
tags:
  - database
  - migration
---

## Instructions

Safe migrations are small, reversible, and lock-aware.

1. **Detect the migration framework**. Look for `migrations/` directory
   + tool: `prisma`, `drizzle`, `knex`, `alembic`, `goose`, `sqlx`,
   `flyway`, etc. Use it — don't write raw DDL files unless it's the
   house style.

2. **Split big changes into small migrations**. One change per file.
   Good: "add nullable column", "backfill in batches", "set NOT NULL".
   Bad: a single migration that adds a column *and* renames three
   others *and* creates an index.

3. **Reversible**. Every migration ships with a `down` that returns the
   schema to the prior state. Test both directions locally.

4. **Lock awareness** (Postgres / MySQL):
   - Adding a column with a non-volatile default? Safe on modern
     Postgres.
   - Adding `NOT NULL` to an existing column on a big table? **Not
     safe** — it takes an `ACCESS EXCLUSIVE` lock. Backfill first, then
     set NOT NULL in a separate migration under a small lock.
   - Creating an index on a live table? Use `CREATE INDEX
     CONCURRENTLY` (Postgres). Do not wrap in a transaction.
   - Renaming a column? Avoid on high-traffic tables. If unavoidable:
     add new column → backfill → switch reads/writes → drop old.

5. **Big table? Batch the backfill**. Never `UPDATE` a 100M-row table
   in one statement. Loop in 10k-row batches with a delay.

6. **Test**:
   - Apply the migration against a *snapshot of production-like data*,
     not an empty test DB.
   - Measure the lock duration and the migration wall-clock time.
   - Roll it back. Roll it forward again. Assert idempotency.

7. **Document in the PR**:
   - Which lock modes are acquired, and for how long.
   - Expected wall-clock on the prod-size dataset.
   - Rollback plan.
   - Any downstream code changes (add column first, deploy code, then
     set NOT NULL — order matters).

**Never**: run a migration against prod from this skill. Generate the
file and stop. Deploy is a separate decision.
