# test/fixtures

Deterministic sample data used by integration and unit tests. Keep these
small, representative, and free of secrets. Tests should import via the
helpers in `./index.ts`, not hard-code paths, so a restructure here
doesn't ripple into 30 test files.

| File                        | What it represents |
|-----------------------------|--------------------|
| `tasks/draft.json`          | A task right after classification (`status=draft`, no plan) |
| `tasks/planned.json`        | Same task with a 3-step DAG plan attached (`status=planned`) |
| `tasks/completed.json`      | Terminal task with `result` populated |
| `tasks/failed.json`         | Terminal task with a `ForgeError` in `result.errors` |
| `plans/bugfix-3step.json`   | Canonical 3-step DAG: analyze → edit → run_tests |
| `plans/invalid-cycle.json`  | A cyclic plan — used to assert the DAG validator rejects it |
| `sessions/repl.jsonl`       | A REPL session with user / plan / tool / result entries |
| `conversations/repl.jsonl`  | A bidirectional-writer-safe conversation jsonl |
| `skills/commit-style.md`    | A minimal skill file (frontmatter + body) |
| `config/global.json`        | A GlobalConfig that validates against the zod schema |
| `models/ollama-tags.json`   | A canned `/api/tags` response used by the Ollama provider tests |

Add a new fixture? Wire it into `index.ts` so tests can import a typed
loader rather than poking at relative paths.
