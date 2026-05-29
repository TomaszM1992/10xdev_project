<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Daily Prioritized View

- **Plan**: context/changes/daily-prioritized-view/plan.md
- **Scope**: All 3 phases
- **Date**: 2026-05-30
- **Verdict**: APPROVED (post-triage — all critical and warnings fixed)
- **Findings**: 1 critical, 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — user_settings query missing user_id filter in daily.astro

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/daily.astro:40
- **Detail**: The SSR page fetches user_settings with no .eq("user_id", ...) filter, relying solely on RLS. The sibling API endpoint (src/pages/api/settings.ts:22) explicitly adds .eq("user_id", user.id) as defence-in-depth. If RLS is misconfigured or bypassed, daily.astro would return the first row in the table — another user's available_hours value. Inconsistency within the same feature is itself a signal.
- **Fix**: Add `.eq("user_id", Astro.locals.user!.id)` to the user_settings query at daily.astro:40.
- **Decision**: FIXED

### F2 — Upsert missing onConflict target in settings endpoint

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/settings.ts:63
- **Detail**: `.upsert({ user_id, available_hours })` has no `{ onConflict: 'user_id' }` option. Without an explicit conflict target, Supabase falls back to the table's primary key constraint. If user_settings has a surrogate PK (e.g. an id serial), the upsert inserts a new row on every PATCH instead of updating the existing one — silently accumulating duplicate rows per user.
- **Fix**: `.upsert({ user_id: user.id, available_hours: ... }, { onConflict: 'user_id' })`
- **Decision**: FIXED

### F3 — Settings PATCH fires on every page mount

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/daily/DailyView.tsx:22
- **Detail**: The useEffect watching availableHours fires on initial mount, sending a PATCH /api/settings 500ms after every page load with the value just fetched from the server (a round-trip no-op write). If a user has /daily open in two tabs and edits hours in one, the second tab's mount effect fires on focus-return and silently overwrites the first tab's pending debounce.
- **Fix A ⭐ Recommended**: Skip first render with an isMounted ref.
  - Approach: Add `const isMounted = useRef(false);` at the top of the effect; early-return and set `isMounted.current = true` on the first run.
  - Strength: Eliminates the wasted write and two-tab race; clean idiomatic React pattern.
  - Tradeoff: Three extra lines; ref must be initialised correctly.
  - Confidence: HIGH — standard pattern for skipping-mount effects.
  - Blind spot: None significant.
- **Fix B**: Accept the mount write as a no-op and document the intent.
  - Approach: Add a brief comment explaining that the initial PATCH is intentional because the upsert is idempotent.
  - Strength: Zero code change.
  - Tradeoff: Two-tab race still exists; continued wasted writes.
  - Confidence: LOW — the two-tab scenario is a real correctness issue, not just wasted bandwidth.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A)

### F4 — available_hours=0 silently empties the task list

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/daily/AvailableHoursInput.tsx:19
- **Detail**: The isNaN guard passes for 0 (parseFloat("0") === 0, not NaN). With availableHours = 0, budgetMinutes = 0 and the cumulative filter admits no tasks — the view silently shows the empty-state even when tasks exist. The HTML min="0.5" attribute is bypassed by keyboard input. The schema rejects 0 server-side, but the client never surfaces an error.
- **Fix**: Replace the isNaN guard with a range check: `if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 24) onChange(parsed);`
- **Decision**: FIXED (min lowered to 0.25; step updated to 0.25; Zod schema updated to min(0.25))

### F5 — Pre-existing: DELETE /api/tasks/:id missing user_id filter

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/tasks/[id].ts (pre-existing, not introduced by this feature)
- **Detail**: The DELETE handler (from task-crud-and-tags) deletes by id alone with no .eq("user_id", ...) guard — relying solely on RLS. A user who guesses another user's task UUID could delete it if RLS is misconfigured. Surfaced during pattern comparison; not introduced by this feature.
- **Fix A ⭐ Recommended**: Add `.eq("user_id", user.id)` to the DELETE filter in [id].ts (and verify PATCH/GET handlers in the same file).
  - Strength: Defence-in-depth; consistent with settings.ts pattern.
  - Tradeoff: Touches code outside this feature's scope.
  - Confidence: HIGH — identical fix needed in F1.
  - Blind spot: Haven't verified whether PATCH in the same file already has the filter.
- **Fix B**: Track as a follow-up and fix in the next change.
  - Strength: Keeps this PR's scope clean.
  - Tradeoff: Leaves the gap open until the next change.
  - Confidence: MEDIUM — acceptable only if RLS is confirmed correct.
  - Blind spot: RLS configuration not verified in this review.
- **Decision**: FIXED (Fix A — added .eq("user_id", user.id) to both SELECT and DELETE; PATCH already had the filter)

### F6 — Undo reversal has no UI error feedback path

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/daily/DailyView.tsx:91
- **Detail**: When the reversal PATCH (status → pending) fails, only a toast.error is shown. The UI has already been restored by restore() so there is no state inconsistency — the user sees the task back but the DB still has the completed status. Acceptable given the low frequency of reversal-PATCH failures.
- **Decision**: SKIPPED

### F7 — TaskCard uses raw button rather than shadcn Button

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/daily/TaskCard.tsx:53, 62
- **Detail**: TaskList.tsx uses `<Button variant="ghost" size="icon">` from shadcn. TaskCard uses raw `<button>` with inline Tailwind. Intentional (tighter icon padding needed for the daily card), but worth noting for future contributors.
- **Decision**: FIXED
