<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Phase 1 Critical-Path Coverage

- **Plan**: context/changes/testing-critical-path-coverage/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-06-01
- **Verdict**: APPROVED (post-triage)
- **Findings**: 0 critical  3 warnings  3 observations

## Automated Verification

- ✅ `npm run build` — passes (14.63s)
- ✅ `npm run lint` — passes (pre-existing astro-eslint-parser projectService warnings are noise, no new errors)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — NaN/negative guard missing in applyBudgetFilter

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/daily.ts:8 (new code, introduced by Phase 1)
- **Detail**: The accumulator loop adds task.time_estimate_minutes into cum with no guard for NaN or negative values. The Zod schema validates positive integers on write, but applyBudgetFilter accepts Task[] directly from the DB return value. If any task has a null/NaN estimate (possible from historical data or a future schema relaxation), cum becomes NaN, all subsequent <= comparisons return false, and no further tasks are included — a silent data presentation bug with no visible error.
- **Fix**: Add a guard at the top of the loop body: `if (!Number.isFinite(task.time_estimate_minutes) || task.time_estimate_minutes < 0) continue;`
  - Strength: One-line fix; matches defensive style used in schemas.ts where Zod validates at boundaries. Also matches upcoming unit test case 6 and makes the function bullet-proof for future callers.
  - Tradeoff: Negligible — adds one guard per loop iteration.
  - Confidence: HIGH — NaN propagation in arithmetic is deterministic and the failure mode is confirmed.
  - Blind spot: The unit tests planned for Phase 2 include a "zero budget" case but no NaN case — this fix should be paired with a test case 7.
- **Decision**: FIXED — Number.isFinite guard added to loop body in src/lib/daily.ts

### F2 — Query errors silently swallowed in daily.astro

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/daily.astro:40–65 (pre-existing code, not introduced by Phase 1)
- **Detail**: overdueResult.error, todayResult.error, and settingsResult.error are all ignored via `?? []` fallback. The serviceUnavailable flag is only set when supabase or user is null — not when queries fail. A Supabase network error or RLS violation causes the daily view to render silently empty with no user feedback.
- **Fix A ⭐ Recommended**: Add error check inside the `if (supabase && user)` block and set `serviceUnavailable = true` on any query error.
  - Strength: Aligns with the existing serviceUnavailable rendering path; user sees a clear error instead of empty list. Zero risk to the Phase 1 changes.
  - Tradeoff: Slightly more code in the Astro frontmatter.
  - Confidence: HIGH — pattern is already wired, just not triggered on query failure.
  - Blind spot: None significant.
- **Fix B**: Defer to a follow-up — pre-existing issue, out of Phase 1 scope.
  - Strength: Keeps Phase 1 strictly scoped.
  - Tradeoff: Silent empty-list bug persists until addressed.
  - Confidence: MEDIUM — depends on how often query failures occur in the target environment.
  - Blind spot: This phase added no new surface area that worsens the risk, so deferral is defensible.
- **Decision**: FIXED via Fix A — error check added, serviceUnavailable = true on any query failure

### F3 — Manual success criteria 1.3 and 1.4 still pending

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-critical-path-coverage/plan.md, Progress §Phase 1 Manual items
- **Detail**: Items 1.3 ("Daily view tasks appear in correct order with no visual regression") and 1.4 ("Budget cutoff still excludes tasks exceeding available hours") are marked [ ] pending. These are genuinely unverified. Phase 1 plan specifies a mandatory pause for manual confirmation before proceeding to Phase 2.
- **Fix**: Run `npm run dev`, open the daily view, verify task order and budget cutoff behavior, then mark 1.3 and 1.4 as [x] in plan.md before starting Phase 2.
- **Decision**: FIXED — 1.3 and 1.4 marked [x] in plan.md

### F4 — No explicit user_id filter on task queries (pre-existing)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/daily.astro:43–57 (pre-existing)
- **Detail**: Both overdue and today queries omit `.eq("user_id", user.id)`. Data isolation relies entirely on Supabase RLS. Not introduced by Phase 1 — systemic pattern also seen in tasks/index.astro. Needs RLS policy confirmation before the app goes to production.
- **Fix**: Confirm SELECT policies on tasks enforce `auth.uid() = user_id`. Optionally add `.eq("user_id", user.id)` as defense-in-depth.
- **Decision**: FIXED — `.eq("user_id", user.id)` added to both query chains in daily.astro

### F5 — No exported type alias for applyBudgetFilter return

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/daily.ts (new file, introduced by Phase 1)
- **Detail**: schemas.ts exports named TypeScript types alongside its runtime values. daily.ts returns `Set<string>` inline with no named alias, slightly inconsistent with the type-export convention in sibling lib files.
- **Fix**: `export type FittingTaskIds = Set<string>` and use it as the return annotation.
- **Decision**: FIXED — FittingTaskIds type alias added to src/lib/daily.ts

### F6 — applyBudgetFilter called without memoization on every render

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/daily/DailyView.tsx:43–44 (new call site)
- **Detail**: The spread + applyBudgetFilter call on lines 43–44 re-runs on every render. At current task counts this is negligible. With React 19 compiler enforcement the compiler may handle this automatically, but if it cannot prove input stability the computation runs each time.
- **Fix**: Wrap with `useMemo` if task counts grow or profiling shows this as a hotspot. Not urgent now.
- **Decision**: SKIPPED
