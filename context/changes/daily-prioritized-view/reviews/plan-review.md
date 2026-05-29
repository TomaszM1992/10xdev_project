<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Daily Prioritized View Implementation Plan

- **Plan**: context/changes/daily-prioritized-view/plan.md
- **Mode**: Deep
- **Date**: 2026-05-29
- **Verdict**: REVISE
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

5/5 paths ✓, 4/4 symbols ✓

- `src/lib/schemas.ts:11–17` — UpdateTaskSchema confirmed, `status` field absent ✓
- `src/middleware.ts:4` — PROTECTED_ROUTES = ["/dashboard", "/tasks"] confirmed ✓
- `src/components/Topbar.astro` — nav structure confirmed, Daily link absent ✓
- `src/pages/api/tasks/[id].ts` — handler confirmed; scalarFields spread at line 38 correctly isolates status from tags ✓
- `src/types.ts:1–28` — TaskStatus, Task, TaskWithTags, UserSettings all present ✓
- sonner 2.0.7 ✓ | lucide-react 1.14.0 ✓ | zod 4.4.3 ✓
- Toaster wired in Layout.astro:40 (client:load) ✓
- UpdateTaskSchema: 2 importers (handler + TaskForm); adding status is safe ✓
- `src/pages/daily.astro` — does not yet exist ✓
- `src/pages/api/settings.ts` — does not yet exist ✓

## Findings

### F1 — lucide-react icon names don't exist in v1.14.0

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — TaskCard component
- **Detail**: The Phase 3 TaskCard contract specifies importing `CheckCircle2` and `XCircle` from lucide-react. The project has `lucide-react ^1.14.0` installed, a v1 major that renamed most icons. The existing codebase confirms this: `src/components/ui/sonner.tsx` imports `CircleCheckIcon` and `OctagonXIcon` — not the v0.x names the plan references. An invalid import is a TS error that fails `npm run build`.
- **Fix**: Replace `CheckCircle2` → `CircleCheck` (or `CircleCheckBig`) and `XCircle` → `CircleX` in the TaskCard contract. Verify against the installed package before writing the component: `grep -r "CheckCircle\|XCircle\|CircleX" node_modules/lucide-react/dist/lucide-react.d.ts`
- **Decision**: FIXED — replaced `CheckCircle2` → `CircleCheck` and `XCircle` → `CircleX` in plan.md Phase 3 TaskCard contract (verified against lucide-react d.ts)

---

### F2 — Undo restore breaks task ordering

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — DailyView complete/dismiss and undo
- **Detail**: The plan says to "restore task to state" on undo but doesn't specify how. A natural implementation — `setState(prev => [...prev, task])` — appends to the end, violating the "SQL-ordered props are the source of truth for order" invariant the plan itself establishes. Example: P1/10min, P2/30min, P3/60min. User completes P2, undoes. P2 re-appended after P3: the list now reads P1, P3, P2. Within a budget that fits all three this is cosmetically wrong; within a tight budget it can cause a different task to be filtered out than before the undo.
- **Fix A ⭐ Recommended**: Store original index in the undo closure; splice on restore. In `handleStatusChange`, capture `const idx = overdueTasks.findIndex(t => t.id === task.id)` (or todayTasks), stash idx in the undo closure, and on restore call `setOverdueTasks(prev => [...prev.slice(0, idx), task, ...prev.slice(idx)])`.
  - Strength: Exact visual restoration; preserves the SQL ordering invariant.
  - Tradeoff: Two extra variables in the closure per queued undo.
  - Confidence: HIGH — the plan already establishes that array position = display order; the closure already captures task and status, so idx is a natural addition.
  - Blind spot: If concurrent undos for two tasks in the same list interact, the stored index may be off by one. Acceptable in a single-user personal task manager.
- **Fix B**: Accept append-to-end; add a sort on restore keyed on the original `initialOverdueTasks` / `initialTodayTasks` prop order.
  - Strength: Simpler code — no index tracking.
  - Tradeoff: Requires holding a stable reference to the original prop order; adds a sort step on every undo.
  - Confidence: MED — more moving parts and requires an additional stable ref.
  - Blind spot: If the user dismisses and undoes multiple tasks rapidly the sort order depends entirely on the prop snapshot remaining accurate.
- **Decision**: FIXED via Fix A — DailyView contract updated to capture original index before removal and splice-restore on undo in plan.md Phase 3

---

### F3 — PATCH /api/settings upsert needs .select() to fulfil its stated contract

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Settings API endpoint
- **Detail**: The contract says "return the upserted row as JSON with 200". Supabase JS returns `data: null` from `.upsert()` unless `.select()` is chained. The client (DailyView's debounced effect) only checks for HTTP errors — it never reads the body — so there is zero functional impact. But an implementer following the contract literally may be surprised when the response body is `{}`.
- **Fix**: Add `.select("*").single()` after the upsert call, or reword the contract to "return 204 No Content" to match actual client usage.
- **Decision**: FIXED — PATCH /api/settings contract reworded to "return 204 No Content" in plan.md Phase 1
