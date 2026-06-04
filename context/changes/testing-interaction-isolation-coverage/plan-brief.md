# Phase 2 Interaction and Isolation Coverage — Plan Brief

> Full plan: `context/changes/testing-interaction-isolation-coverage/plan.md`
> Research: `context/changes/testing-interaction-isolation-coverage/research.md`

## What & Why

Add automated regression coverage for the four Phase 2 risks from the test plan: IDOR cross-user isolation (#4), undo state machine (#5), settings persistence (#6), and API input validation (#7). These risks were deferred from Phase 1 because they require either a second authenticated user, a production-code extraction, or a route-handler test — infrastructure that Phase 1 deliberately did not build.

## Starting Point

Phase 1 is complete: 6 unit tests (`applyBudgetFilter`) and 3 integration test suites (persistence, date-filter, ranking) run against a local Supabase instance. The test infrastructure supports one test user, provides `signInTestUser()` and `cleanupTestTasks()` helpers, and uses the Supabase JS client directly (no HTTP calls, no running dev server).

## Desired End State

`npm test` passes with 17 additional test cases across 5 new test blocks, covering all four Phase 2 risks. The undo abort-no-PATCH invariant (requires `jsdom`) is documented as a deliberate gap — the server-side reversal path and the pure-function restore-at-index are the testable boundaries.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Risk #4 test layer | Supabase client (proves RLS) | RLS is the last line of defense; 0-rows-returned proves isolation without HTTP infra | Research |
| Risk #7 test approach | Import handler + `vi.mock("@/lib/supabase")` | Validation fails before Supabase is called — mock never needs real DB; no running server required | Plan |
| Risk #5 extraction scope | `restoreAtIndex<T>` only | Mirrors `applyBudgetFilter` extraction from Phase 1; abort behavior gap is documented, not hidden | Plan |
| Risk #5 depth | Unit test + API reversal integration test | Supabase client status round-trip proves the server accepts `pending` as a reversal value cheaply | Plan |
| Phase structure | Mirror Phase 1 (prod+infra → unit+handler → integration) | Consistent with completed Phase 1; clear gate between production changes and test additions | Plan |
| Second test user | `test2@example.com`, idempotent creation in `global-setup.ts` | Follows `signInTestUser()` pattern exactly; IDOR test needs two truly independent Supabase auth sessions | Plan |

## Scope

**In scope:**
- Extract `restoreAtIndex<T>` to `src/lib/daily.ts`
- Extend `global-setup.ts` and `src/test/supabase.ts` with second user + `cleanupTestSettings`
- 5 `restoreAtIndex` unit tests
- 4 API validation handler tests (`POST /api/tasks` — `vi.mock` approach)
- 3 IDOR integration tests (two Supabase client sessions)
- 2 undo-reversal integration tests (`pending → complete → pending`)
- 3 settings-persistence integration tests

**Out of scope:**
- Fixing the UTC date-defaulting bug in `daily.astro`
- Adding `npm test` to CI (Phase 3 of rollout)
- Testing undo abort-no-PATCH behavior (requires `jsdom`)
- Testing the full HTTP 404 response from IDOR (API handler layer; RLS test is sufficient)
- Auth routes (signin/signup/signout — no Zod validation; excluded per test plan §7)

## Architecture / Approach

All integration tests use the Supabase JS client directly — no HTTP calls, no running dev server. The API validation test is the sole exception: it dynamically imports the route handler after `vi.mock("@/lib/supabase")` is registered, then calls the handler function with a constructed `Request` and a mock context. Validation fails at `safeParse` before the mocked Supabase client is ever invoked. The `vi.mock` is Vitest-hoisted, so the dynamic import inside `beforeAll` sees the mock.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Production + Infrastructure | `restoreAtIndex` extracted; second test user and helpers ready | `vi.mock` hoisting requires dynamic import of handler — must be verified in Phase 2 |
| 2. Unit + Handler Tests | 5 `restoreAtIndex` unit tests + 4 API validation handler tests | `astro:env/server` may still be evaluated if mock is applied after static import |
| 3. Integration Tests | IDOR, undo-reversal, and settings-persistence suites | Two-user cleanup ordering — `afterAll` must use `userAClient`, not `userBClient` |

**Prerequisites:** Local Supabase running (`supabase start`) for Phase 3; `.env.test` updated with `TEST_USER2_EMAIL` / `TEST_USER2_PASSWORD` before Phase 1 is complete.  
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- **`vi.mock` + Astro virtual modules**: Mocking `@/lib/supabase` should prevent `astro:env/server` from being evaluated. If the handler has any top-level side effect that imports `astro:env/server` directly, the mock approach will fail and the fallback is to start a dev server in `globalSetup`.
- **Supabase UPDATE returning empty array on RLS block**: The IDOR test asserts `.update().select()` returns an array of length 0. This is the documented Supabase behavior for RLS-blocked updates, but should be verified empirically in Phase 3.

## Success Criteria (Summary)

- `npm test` passes all existing + 17 new tests with no failures, run twice consecutively
- `tasks` and `user_settings` tables are empty in Supabase Studio after a test run
- The undo flow works correctly in the dev browser after Phase 1's `restoreAtIndex` extraction
