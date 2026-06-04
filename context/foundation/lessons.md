# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Silent bail-out in global setup

**Context**: src/test/global-setup.ts — test global setup that guards against a missing external service

**Problem**: When global setup detects Supabase is unreachable and returns early with only a console.warn, every downstream test helper (signInTestUser etc.) throws a cryptic sign-in failure. Developers see a wall of misleading errors instead of one clear message.

**Rule**: Propagate the unavailability signal (e.g. via a process.env flag) from global setup to test helpers so that non-integration tests (unit tests, handler tests) can still run when local Supabase is not available, while integration tests throw a clear, actionable "run npx supabase start" error.

**Applies to**: Integration tests, unit tests, and other tests — any test suite that mixes DB-dependent and DB-independent tests behind a shared global setup.
