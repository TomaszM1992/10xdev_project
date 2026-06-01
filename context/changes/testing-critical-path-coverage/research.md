---
date: 2026-06-01T00:00:00+00:00
researcher: Tomasz
git_commit: 9f2e0579d6bcb732c897a39766026744bb52df8e
branch: feature/tests
repository: 10xdev_project
topic: "Phase 1 critical-path test coverage: task persistence, date assignment, and ranking edge cases"
tags: [research, testing, vitest, supabase, daily-view, date-derivation, ranking, budget-filter]
status: complete
last_updated: 2026-06-01
last_updated_by: Tomasz
---

# Research: Phase 1 Critical-Path Coverage

**Date**: 2026-06-01  
**Researcher**: Tomasz  
**Git Commit**: 9f2e0579d6bcb732c897a39766026744bb52df8e  
**Branch**: feature/tests  
**Repository**: 10xdev_project

## Research Question

Map the codebase to inform Phase 1 test coverage (risks #1, #2, #3 from the test plan):
- **Risk #1**: Task set for "today" appears on wrong date due to UTC offset on server-side date derivation
- **Risk #2**: Task created in one session is missing on next login — silent INSERT failure
- **Risk #3**: Daily view shows wrong order or wrong budget cutoff at edge cases

## Summary

**Risk #1 is real and the `localISO` name is a red herring.** The function uses local-time getters (`getFullYear`, `getMonth`, `getDate`) — which are correct *in a browser* — but Cloudflare Workers runtime always runs in UTC. On the server, `new Date()` is UTC, so `localISO(new Date())` returns the UTC date, not the user's local date. A user in UTC+2 at 23:30 creating a task for "today" via the browser (local date: June 1) will have the daily view default to May 31. The URL `?date=` param path is safe because the browser supplies the correct local date; the unsafe path is the server-side default when no param is present.

**Risk #2 is well-protected at the API layer but unverified end-to-end.** The POST handler does INSERT → check error → re-fetch with tags before returning 201. The client checks `res.ok` only and navigates, which triggers a fresh server-side fetch of all tasks — an implicit verification. The gap is that no test currently proves this round-trip works against a real database.

**Risk #3 has one critical testability gap.** SQL ordering (priority ASC, time_estimate_minutes ASC) is correct. The cumulative budget filter is accurate (inclusive boundary: `cum + time <= budgetMinutes`). However, the filter is embedded in `DailyView.tsx` (a React component), and the Vitest config uses `environment: node` — the component cannot be unit tested as-is. The budget filter logic must be extracted to a pure function before Phase 1 can unit-test it.

**Test infrastructure is minimal but sound.** Vitest 4.1.7, node environment, `@` alias, one test file (19 Zod schema tests). No integration test setup, no Supabase fixture helpers, no auth session utilities. These must all be built in Phase 1.

---

## Detailed Findings

### Risk #1 — UTC Date Derivation

#### Where the server derives "today"

`src/pages/daily.astro:12-14` — `localISO()` helper:
```typescript
function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
```

`src/pages/daily.astro:17-18` — date resolution:
```typescript
const date = rawDate !== null && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
  ? rawDate
  : localISO(new Date());
```

`src/pages/daily.astro:30` — overdue threshold:
```typescript
const realToday = localISO(new Date());
```

**The Cloudflare Workers problem:** `getFullYear()`, `getMonth()`, and `getDate()` read the *local* timezone of the JS runtime. In a browser this is the user's timezone; in Cloudflare Workers the runtime is always UTC. So `localISO(new Date())` on the server is equivalent to `toISOString().slice(0,10)` — it produces the UTC date regardless of user timezone. The name `localISO` is misleading for server-side use.

#### How target_date flows from the browser

- Browser `<input type="date">` at `src/components/tasks/TaskForm.tsx:99-108` returns `YYYY-MM-DD` in the user's **local** timezone.
- The form sends this value directly: `src/components/tasks/TaskForm.tsx:28` → `target_date: targetDate`.
- No server-side default exists — `src/lib/schemas.ts:5` requires `z.iso.date()` with no `.default()`.
- API validation at `src/pages/api/tasks/index.ts:27` would reject a missing `target_date`.

#### The daily view query filter

`src/pages/daily.astro:46` (overdue) and `:53` (today):
```typescript
.lt("target_date", overdueThreshold)   // overdue
.eq("target_date", date)               // today
```
Both are string comparisons against PostgreSQL `date` columns. String-ordering of `YYYY-MM-DD` is correct for date comparison, so the filter logic itself is sound — the only problem is the value of `date` when derived server-side.

#### Safe vs. unsafe path

| Path | How date is set | Safe? |
|------|-----------------|-------|
| URL has `?date=YYYY-MM-DD` | Browser passes local date | ✅ Safe |
| No URL param (default) | Server calls `localISO(new Date())` = UTC | ❌ Broken for UTC-offset timezones |

#### Test target for Risk #1

The test must verify: POST a task with `target_date = X` → query daily view with `date = X` → task appears. Testing only in UTC hides the bug; the integration test should explicitly control the `date` param rather than rely on server defaulting.

---

### Risk #2 — Task Persistence (POST Handler)

#### API handler flow

`src/pages/api/tasks/index.ts`:
- **Line 35-39**: INSERT with `.select().single()` to get the row back
- **Line 41**: Destructure `{ data: rawTask, error: taskError }`
- **Line 43-45**: Return 500 if `taskError || !rawTask`
- **Line 49-57**: If tags present → INSERT `task_tags`; return 500 on `tagError`
- **Line 60-64**: **Re-fetch** inserted task with `.select("*, task_tags(*)")` — a verification step
- **Line 66-68**: Return 500 if `fetchError`
- **Line 70**: Return 201 with complete `TaskWithTags` object

The API will not return 201 unless both the INSERT and the verification fetch succeed. This is strong.

#### Client response handling

`src/components/tasks/TaskForm.tsx:61-76`:
```typescript
if (res.ok) {
  toast.success("Task created");
  window.location.href = "/tasks";
} else {
  // parse error, show toast
}
```

- Toast fires on `res.ok` only (not optimistic).
- Client **does not parse the 201 body** to verify the returned task has an `id`.
- Navigation to `/tasks` triggers a fresh server-side Supabase fetch (`src/pages/tasks/index.astro:14-20`), which is an implicit end-to-end verification.

#### The gap

No automated test currently proves the round-trip (POST → task retrievable on next GET). The API error signaling is correct; what's missing is a test that confirms it against a real database.

#### Test target for Risk #2

Integration test: authenticate as a user → POST a task → GET `/api/tasks` (or query daily view) → assert the task is present with correct fields. Must use real Supabase (not mocked); the test plan explicitly flags mock-Supabase as an anti-pattern for this risk.

---

### Risk #3 — Ranking and Budget Cutoff

#### SQL ordering

`src/pages/daily.astro:42-55` — both queries (overdue and today) use:
```typescript
.order("priority", { ascending: true })
.order("time_estimate_minutes", { ascending: true })
```
P1 < P2 < P3; shorter first within equal priority. This is SQL-side (safe for Cloudflare Workers CPU budget — see §Architecture Insights).

#### JavaScript budget filter

`src/components/daily/DailyView.tsx:41-51`:
```typescript
const budgetMinutes = availableHours * 60;
const all = [...overdueTasks, ...todayTasks];  // overdue always first
const fittingIds = new Set<string>();
let cum = 0;
for (const task of all) {
  if (cum + task.time_estimate_minutes <= budgetMinutes) {
    fittingIds.add(task.id);
    cum += task.time_estimate_minutes;
  }
}
```

Key boundary behavior: a task is included if `cum + its_time <= budgetMinutes` (inclusive). The first task that would exceed the budget is skipped; iteration continues (a later shorter task could still fit).

#### Overdue task handling

`src/pages/daily.astro:28-31`:
```typescript
const realToday = localISO(new Date());
const overdueThreshold = date > realToday ? realToday : date;
```

- Overdue = `status = 'pending'` AND `target_date < overdueThreshold`
- No priority bump for overdue tasks — they sort by `priority, time_estimate_minutes` just like today's
- Overdue tasks appear first in the display due to `[...overdueTasks, ...todayTasks]`
- Navigation to a future date caps the threshold at real today (prevents upcoming tasks from becoming overdue)

#### Edge cases

| Edge case | What happens |
|-----------|--------------|
| Equal priority + equal time | SQL insertion order (by `id`) — deterministic, not well-specified |
| Exact budget boundary | Task included if `cum + time == budgetMinutes` (inclusive) |
| Task that doesn't fit skipped | Iteration continues — a smaller later task can still fit |
| Overdue + today mix | Overdue always before today in the `all` array |

#### Critical testability gap

The budget filter is inside `DailyView.tsx` (a React component). Vitest is configured with `environment: node` — React components cannot be rendered without jsdom. **The filter logic must be extracted to a pure function** (e.g., `src/lib/daily.ts`) before it can be unit-tested. This is a prerequisite for Phase 1.

#### Test targets for Risk #3

- **Unit test** (after extraction): pure budget filter with fixture tasks — test equal-priority tie, exact boundary, overdue+today ordering.
- **Integration test**: seed tasks with known priorities and times via API → query daily view → assert SQL ordering is P1 < P2 < P3, shorter-first.

---

### Test Infrastructure

#### Current Vitest setup

`vitest.config.ts:1-7`:
```typescript
export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": resolve(__dirname, "./src") } },
});
```

- Environment: `node` only — cannot render React components.
- No globals (must import `describe`, `it`, `expect` from `vitest`).
- No coverage config, no setup file, no include/exclude patterns (defaults to `**/*.test.ts`).

`package.json:10`: `"test": "vitest run"` — not in CI yet (Phase 3 adds this).

#### Existing test file

`src/lib/schemas.test.ts` (105 lines, 23 test cases across 3 `describe` blocks):
- `CreateTaskSchema` — 10 cases: valid payload, tag defaults, field rejections
- `UpdateTaskSchema` — 8 cases: partial payloads, status values
- `UpdateSettingsSchema` — 5 cases: boundary values for `available_hours`

Pattern: `schema.safeParse(input)` → assert `.success` (doesn't assert error messages). Good model for new schema tests.

#### What Phase 1 must add

| Gap | What to build |
|-----|---------------|
| Integration test infrastructure | Supabase test project credentials in `.env.test`; helper to get auth session token |
| Budget filter extractable | Move budget logic from `DailyView.tsx` to `src/lib/daily.ts` as a pure function |
| Fixture/seed helpers | Helper functions to create/delete tasks via the API or service role client |
| Auth in tests | Either use Supabase `service_role` key to bypass RLS for seeding, or create a test user and sign in via API |
| Test file locations | `src/lib/daily.test.ts` (unit), `src/__tests__/integration/tasks.test.ts` (integration) |

---

## Code References

- `src/pages/daily.astro:12-14` — `localISO()` helper using local-time getters (UTC on Workers)
- `src/pages/daily.astro:17-18` — server-side date defaulting (the broken path)
- `src/pages/daily.astro:28-31` — overdue threshold with future-date cap
- `src/pages/daily.astro:42-55` — two parallel Supabase queries (overdue + today) with SQL ordering
- `src/pages/api/tasks/index.ts:35-70` — full POST flow: INSERT → tag insert → verify fetch → 201
- `src/components/tasks/TaskForm.tsx:99-108` — browser date input (returns local date)
- `src/components/tasks/TaskForm.tsx:61-76` — client response handling (`res.ok` check → navigate)
- `src/components/daily/DailyView.tsx:41-51` — JS cumulative budget filter (needs extraction)
- `src/lib/schemas.ts:1-24` — Zod schemas (`z.iso.date()` for date, status enum)
- `src/lib/schemas.test.ts:1-105` — existing test pattern (safeParse + .success assertions)
- `vitest.config.ts:1-7` — Vitest config (node environment, `@` alias)
- `supabase/migrations/20260527000000_task_data_schema.sql:46-56` — tasks table schema

---

## Architecture Insights

**Cloudflare Workers CPU budget drives SQL ordering.** The S-02 research (archived) explicitly documented the 10 ms CPU limit as the reason `ORDER BY` lives in SQL and never in JavaScript on the server. The cumulative budget filter is O(n) JS but only runs in the browser island, not on the server.

**`localISO()` works correctly for display, not for server defaults.** Using local-time getters (`getDate()` vs `getUTCDate()`) is correct when formatting dates for display in a browser or to avoid UTC conversion in `new Date(iso)`. It is incorrect as a server-side default on a UTC-only runtime like Cloudflare Workers.

**Tag ownership relies on a correlated subquery.** `task_tags` has no `user_id` column; RLS policies use `EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = auth.uid())`. Integration tests that touch tags must be aware of this.

**Settings upsert is lazy.** `user_settings` has no row until the first PATCH. The daily view defaults to 8h when `maybeSingle()` returns null. Integration tests that depend on `available_hours` must either PATCH settings first or accept the 8h default.

**Tag normalization is DB-side.** A BEFORE INSERT trigger lowercases `tag_name`. Tests that assert tag values should expect lowercase even if the input was mixed-case.

---

## Historical Context (from prior changes)

- `context/archive/2026-05-27-task-data-schema/plan.md:202` — `target_date` stored as SQL `date` type (no time component, timezone-agnostic). Composite index `tasks_user_date_idx ON (user_id, target_date)` added for the daily view query.
- `context/archive/2026-05-27-task-data-schema/plan.md:135-150` — Tag normalization trigger (`normalize_tag_name`) and 5-tag limit trigger (`enforce_task_tags_limit`).
- `context/archive/2026-05-28-task-crud-and-tags/research.md:189-192` — Decision to use `z.iso.date()` (Zod v4 canonical; `z.string().date()` is deprecated in Zod 4.4.3).
- `context/archive/2026-05-28-task-crud-and-tags/plan.md:53` — Tag update: DELETE existing + INSERT new (no atomic rollback; 500 on partial failure).
- `context/archive/2026-05-29-daily-prioritized-view/research.md:214-231` — Cloudflare Workers 10 ms CPU budget → `ORDER BY` in SQL, never in server-side JS.
- `context/archive/2026-05-29-daily-prioritized-view/plan.md:57` — "Never sort in JS — the SQL-ordered props are the source of truth for order."
- `context/archive/2026-05-29-daily-prioritized-view/plan.md:60` — Undo mechanism: `useRef<Map<string, ReturnType<typeof setTimeout>>>`, 5-second timeout, Sonner toast action callback.

---

## Open Questions

1. **Supabase test project vs. local?** The test plan deferred this decision to research. The integration tests need a real Supabase connection. Options: (a) a dedicated test project with credentials in `.env.test` (simplest, keeps CI clean), (b) local Supabase via `supabase start` in Docker (works but heavier). Given the Cloudflare Workers target and the avoidance of mocks, a dedicated remote test project is likely the better fit for CI.

2. **Budget filter extraction scope.** The pure function to extract from `DailyView.tsx` is clear (the `for` loop + `fittingIds` set), but its signature needs to be defined. It takes `tasks: TaskWithTags[]` and `availableHours: number` and returns `Set<string>` (fitting IDs). Plan phase should specify the extraction as a prerequisite step.

3. **Auth in integration tests.** To call authenticated API endpoints (`POST /api/tasks`, `GET /api/tasks`), tests need a valid Supabase session cookie. Options: (a) create a test user via Supabase auth admin API with service role key, (b) call the sign-in endpoint directly and capture the cookie. The service role approach is cleaner for test isolation.

4. **Equal-priority tie-breaking.** The SQL ordering for equal priority + equal time is by insertion order (PostgreSQL default). This is deterministic but not semantically meaningful. Should the test explicitly assert insertion-order tie-breaking, or treat tied ordering as implementation-private and only assert that both tasks fit or don't fit the budget?

5. **`overdueThreshold` with UTC.** If `realToday` has the same UTC bug as the daily view default, the overdue cutoff also shifts in UTC-offset timezones. This is a secondary concern (not in Phase 1 scope) but worth noting.
