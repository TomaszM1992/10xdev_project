<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Interaction & Isolation Test Coverage

- **Plan**: context/changes/testing-interaction-isolation-coverage/plan.md
- **Scope**: All Phases (1–3)
- **Date**: 2026-06-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  4 warnings  5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — global-setup silent bail-out leaves cryptic integration failures

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/test/global-setup.ts:18–23
- **Detail**: When Supabase is unreachable, global-setup returns early with a console.warn. All 7 integration test beforeAll blocks then throw signInWithPassword errors — a wall of cryptic failures with no pointer to "run npx supabase start".
- **Fix A ⭐ Recommended**: Set `process.env.__SUPABASE_UNAVAILABLE = "1"` on early return; check it in signInTestUser/signInSecondTestUser and throw a clear "Supabase not reachable" error there.
  - Strength: One clear error per suite; unit+handler tests still pass.
  - Tradeoff: Requires editing supabase.ts as well as global-setup.ts.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Fix B**: Revert to throwing in global-setup.ts on network failure.
  - Strength: Single failure, minimal change.
  - Tradeoff: Unit/handler tests also fail (Vitest bails on global-setup throw).
  - Confidence: MEDIUM
  - Blind spot: None significant.
- **Decision**: ACCEPTED-AS-RULE: Silent bail-out in global setup

### F2 — SELECT isolation test missing error check (false positive possible)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality / Pattern Consistency
- **Location**: src/test/integration/cross-user-isolation.test.ts:44–46
- **Detail**: `expect(result.data).toBeNull()` without first asserting `result.error` is null. Supabase returns `data: null` on both filtered-empty (RLS working) and DB error (RLS misconfigured). Test passes in both cases. Reference pattern in task-persistence.test.ts always pairs error + data checks.
- **Fix**: Add `expect(result.error).toBeNull();` before the data assertion on line 45.
- **Decision**: FIXED

### F3 — DELETE isolation test discards result; refetch missing error check

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality / Pattern Consistency
- **Location**: src/test/integration/cross-user-isolation.test.ts:60–65
- **Detail**: The delete result is fully discarded. The User A refetch's `error` field is also unchecked. A DB error during refetch would cause a misleading `null !== null` assertion failure instead of surfacing the real error.
- **Fix**: Capture delete result and assert `deleteResult.data` has length 0. Add `expect(refetch.error).toBeNull()` before line 65.
- **Decision**: FIXED

### F4 — undo-reversal Test 2 has implicit state dependency on Test 1

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/test/integration/undo-reversal.test.ts:47–52
- **Detail**: Test 2 relies on Test 1 having set status to "complete". If Test 1 is skipped/fails, Test 2 finds the task at "pending" and passes for the wrong reason. The dependency is invisible to future readers.
- **Fix**: Add a precondition read at the start of Test 2: fetch the task and `expect((pre.data as Task).status).toBe("complete")` before applying the reversal PATCH.
- **Decision**: FIXED

### F5 — global-setup fetch catch-only pattern warrants a comment

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/test/global-setup.ts:18–23
- **Detail**: The catch-only pattern (no status check) is intentional and correct — it detects "connection refused", not "wrong path". Without a comment a reader may wonder why the HTTP status isn't checked.
- **Fix**: Add a one-line comment: `// catch = connection refused; status code irrelevant (only checking if port is up)`
- **Decision**: SKIPPED

### F6 — api-validation assertion uses body.error.properties?.priority (plan drift)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/test/integration/api-validation.test.ts:31
- **Detail**: Plan specified `body.error.priority is defined` but actual assertion is `body.error.properties?.priority`. The API uses z.treeifyError() which wraps field errors under `properties`. Test is correct; plan's assumed shape was wrong.
- **Fix**: No code change needed. The drift is intentional — the test matches the real API shape.
- **Decision**: FIXED (acknowledged — no code change)

### F7 — cleanupTestSettings missing explicit null-user guard (plan drift)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/test/supabase.ts:51–57
- **Detail**: Plan called for explicit `throw if no user authenticated` guard. Implementation omits the `if (!data.user) throw …` check; would throw a TypeError on null.id instead. Practical risk is nil since the function is always called after signInTestUser().
- **Fix**: Add `if (!data.user) throw new Error("cleanupTestSettings: not authenticated")` after the getUser call.
- **Decision**: SKIPPED

### F8 — settings test setup upsert (test 2) not error-checked

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/test/integration/settings-persistence.test.ts:40
- **Detail**: The setup upsert's result is discarded. A silent failure here would cause the subsequent `expect(data.available_hours).toBe(6)` to fail with a misleading value rather than pointing to the setup failure.
- **Fix**: Capture: `const { error: setupError } = await client.from(...).upsert(...)` and `expect(setupError).toBeNull()`.
- **Decision**: FIXED

### F9 — signInSecondTestUser is a near-duplicate of signInTestUser

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/test/supabase.ts:23–41
- **Detail**: 14-line function differs from signInTestUser only in which env vars it reads. Bug fixes must be applied to both. Acceptable for two users but worth addressing before a third is added.
- **Fix**: Extract a private `signIn(emailVar, passwordVar)` factory and have both public functions delegate to it.
- **Decision**: FIXED
