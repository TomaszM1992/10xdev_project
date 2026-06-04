<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Phase 1 Critical-Path Coverage

- **Plan**: context/changes/testing-critical-path-coverage/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-06-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  4 warnings  2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — ranking insert helper swallows insert errors silently

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/test/integration/ranking.test.ts — insert helper
- **Detail**: The inner `insert` helper returns `result.data as Task` without checking `result.error`. If any fixture insert fails, result.data is null, the cast silently produces null, and subsequent assertions on taskA.id etc. throw "Cannot read property 'id' of null" instead of a clear insert failure.
- **Fix**: Add `if (result.error) throw result.error;` before the return in the insert helper.
- **Decision**: FIXED — added `if (result.error) throw result.error;` before return in insert helper.

### F2 — ranking afterAll crashes if beforeAll throws

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/test/integration/ranking.test.ts — afterAll block
- **Detail**: If beforeAll throws mid-insert, `client` is still undefined when afterAll fires. `cleanupTestTasks(client)` then throws a new error, masking the original failure and leaving orphan rows.
- **Fix**: Add `if (!client) return;` at the top of the afterAll body.
- **Decision**: FIXED — added `if (!client) return;` guard at top of afterAll.

### F3 — global-setup.ts env var propagation is worker-thread-fragile

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/test/global-setup.ts:5
- **Detail**: `config({ path: ".env.test" })` runs in the main Vitest process. Workers inherit process.env only at fork time. Pre-forked pools or a future Vitest version spawning workers earlier would silently make env vars undefined in all test files.
- **Fix A ⭐ Recommended**: Add `setupFiles: ["./src/test/setup.ts"]` to vitest.config.ts; create `src/test/setup.ts` that calls `config({ path: ".env.test" })` inside each worker process.
  - Strength: Guaranteed propagation regardless of pool/fork timing.
  - Tradeoff: Dotenv loaded once per worker (cheap); minor duplication with global-setup call.
  - Confidence: HIGH — setupFiles runs inside worker processes by spec.
  - Blind spot: None significant.
- **Fix B**: Declare env vars in vitest.config.ts `env:` block with hard-coded local Supabase defaults.
  - Strength: Zero runtime I/O; always available to workers.
  - Tradeoff: Duplicates .env.test; credentials appear in committed file.
  - Confidence: MED — works but conflates config and code.
  - Blind spot: Breaks if .env.test changes without updating vitest.config.ts.
- **Decision**: FIXED via Fix A — added setupFiles + src/test/setup.ts; dotenv now loads inside each worker process.

### F4 — cleanupTestTasks deletes all user tasks without run-level scope

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/test/supabase.ts:23–24
- **Detail**: `.from("tasks").delete().eq("user_id", data.user.id)` removes every task for the test user. If .env.test is accidentally pointed at staging/prod, the entire task dataset for that user is silently wiped.
- **Fix A ⭐ Recommended**: Assert `SUPABASE_URL` starts with `http://127.0.0.1` at the top of `signInTestUser` and throw a clear error if it does not.
  - Strength: Zero-friction one-liner; catches misconfiguration at auth time before any data is touched.
  - Tradeoff: Blocks tests against a remote test project if one is ever intentionally added.
  - Confidence: HIGH — local-only constraint matches the plan.
  - Blind spot: Doesn't prevent parallel CI runs on the same local instance.
- **Fix B**: Prefix all test fixture names with a unique run ID and scope cleanupTestTasks to `.ilike("name", "%[test-<id>]%")`.
  - Strength: Enables safe parallel CI runs; no environment restriction.
  - Tradeoff: Every insert must thread the prefix through; more invasive refactor.
  - Confidence: MED — correct but over-engineered for current local-only constraint.
  - Blind spot: name field might be renamed or constrained later.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Integration test helpers that delete data must guard against non-local environments — asserts SUPABASE_URL starts with http://127.0.0.1 in signInTestUser.

### F5 — Number.isFinite guard behaviour not covered by unit tests

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/daily.ts:10 / src/lib/daily.test.ts
- **Detail**: The implementation added a guard that silently skips tasks with null/NaN/negative estimates. This is a quality improvement over the plan but has no test coverage.
- **Fix**: Add a 7th `it()` case to daily.test.ts passing a task with `time_estimate_minutes: null as unknown as number` and asserting it is absent from the result Set.
- **Decision**: FIXED — added 7th unit test case covering null/NaN/negative estimate skip.

### F6 — Two unplanned files committed: project-notes.md and supabase/snippets/

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: project-notes.md, supabase/snippets/Untitled query 810.sql
- **Detail**: Neither file is in the plan. `supabase/snippets/` contains a saved Studio query. `project-notes.md` appears to be a scratch pad. Both are benign but add noise to the repo.
- **Fix**: Add `project-notes.md` and `supabase/snippets/` to .gitignore if ephemeral, or keep both if intentional.
- **Decision**: SKIPPED — files are intentional.
