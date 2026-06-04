# Phase 1 Critical-Path Coverage — Plan Brief

> Full plan: `context/changes/testing-critical-path-coverage/plan.md`
> Research: `context/changes/testing-critical-path-coverage/research.md`

## What & Why

Add the first automated test coverage for the three highest-risk failure scenarios in the app: task date assignment, task persistence, and daily-view ranking edge cases. These risks have no tests today; the test plan (§2) rates two of the three as High×High or High×Medium impact. Phase 1 proves the critical path works against a real local Supabase database.

## Starting Point

One test file exists (`src/lib/schemas.test.ts`, 23 Zod schema unit tests). The budget filter that drives daily view ranking lives inside a React component (`DailyView.tsx`) and cannot be unit-tested under the current `environment: node` Vitest config. No integration test infrastructure exists.

## Desired End State

`npm test` passes after `supabase start` and reports 6 unit tests (budget filter edge cases) plus 3 integration test suites (persistence, date-filter, ranking) against a real local Supabase DB. No running dev server required. All three Phase 1 risks have automated regression coverage.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Test environment | Local Supabase (`supabase start`) | No Docker overhead for CI yet; Phase 3 adds CI wiring | Plan |
| Risk #1 UTC bug | Test-only (explicit date params; bug stays live) | Keeps Phase 1 focused on infrastructure; bug tracked separately | Plan |
| Test API layer | Supabase JS client direct (no HTTP server) | Eliminates running-server complexity; tests DB behavior and RLS | Plan |
| Auth in tests | Dedicated test user + `signInWithPassword()` | Tests run through RLS exactly as a real user, proving policies work | Plan |
| Test cleanup | `afterEach` delete + `beforeAll` pre-clean | Simple, predictable; guards against stale state from crashed runs | Plan |
| Budget filter return | `Set<string>` of fitting IDs | Zero behavior change in `DailyView`; direct lift of current implementation | Plan |
| Tie-breaking | Add `created_at` ASC as 3rd ORDER BY | Makes SQL ordering deterministic and testable; fixes undefined behavior for equal-ranked tasks | Plan |
| Creds file | `.env.test` (gitignored) with local Supabase defaults | Standard local-dev pattern; safe to not commit local credentials | Plan |

## Scope

**In scope:**
- ORDER BY tiebreaker added to `daily.astro` (production change)
- `applyBudgetFilter()` extracted from `DailyView.tsx` to `src/lib/daily.ts`
- Vitest global setup, `.env.test`, Supabase test client helpers
- 6 unit tests for `applyBudgetFilter` (pure function)
- 3 integration test files: persistence (Risk #2), date-filter (Risk #1), ranking (Risk #3)

**Out of scope:**
- Fixing the UTC date defaulting bug in `daily.astro`
- Adding `npm test` to CI (Phase 3)
- User isolation tests / IDOR (Phase 2, Risk #4)
- Undo state machine, settings persistence, API input validation (Phase 2, Risks #5–#7)

## Architecture / Approach

Integration tests authenticate via `supabase.auth.signInWithPassword()` and call the Supabase JS client directly — no running Astro dev server. A global setup file (Vitest `globalSetup`) creates the test user once before all suites. Each test file cleans its own data in `afterEach` + `beforeAll`. The budget filter is extracted as a pure function so its edge cases can be tested in isolation, then the integration tests exercise the SQL ordering and date filter logic directly against the DB.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Production changes | `created_at` ORDER BY tiebreaker; `applyBudgetFilter` extracted to `src/lib/daily.ts` | Extraction must be behavior-identical — verify daily view manually |
| 2. Infra + unit tests | Vitest global setup, `.env.test`, test client helpers, 6 unit tests passing | Env-var loading in `globalSetup` vs worker context (Vitest architecture nuance) |
| 3. Integration tests | 3 integration test suites covering Risks #1, #2, #3 | Test data cleanup must be airtight — stale state causes flaky tests |

**Prerequisites:** `supabase start` running; migrations applied (`supabase db reset` if fresh clone); local Supabase credentials from `supabase status` populated in `.env.test`.  
**Estimated effort:** 1–2 sessions across 3 phases.

## Open Risks & Assumptions

- The UTC date defaulting bug (`localISO(new Date())` returning UTC on Workers) is **not fixed** in this phase. It remains live; users in UTC+ timezones may still see the wrong daily view default. The integration tests sidestep this by passing explicit dates.
- Vitest's `globalSetup` runs in the main process; `process.env` vars loaded there may not automatically propagate to worker contexts. The global setup file loads `dotenv` explicitly to guard against this.
- If `@supabase/supabase-js` version in the lockfile diverges from what `@supabase/ssr` expects, install it explicitly as a devDependency to pin it.
- Equal-priority, equal-time task ordering in the integration test depends on PostgreSQL respecting insertion order for the `created_at` tiebreak. Tests insert sequentially (not `Promise.all`) to ensure `created_at` ordering is reliable.

## Success Criteria (Summary)

- `npm test` passes locally with `supabase start` running — 6 unit + 3 integration suites, 0 failures
- Second consecutive `npm test` run also passes — cleanup is airtight
- Daily view behavior is visually unchanged after Phase 1 production changes
