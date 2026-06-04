---
date: 2026-06-03T00:00:00+00:00
researcher: Tomasz
git_commit: b97dbd1d9df0e60249a7019bd868759004702847
branch: feature/testing-interaction-isolation-coverage
repository: 10xdev_project
topic: "Phase 2 interaction and isolation test coverage: IDOR isolation, undo state machine, settings persistence, API input validation"
tags: [research, testing, vitest, supabase, rls, undo, settings, validation, idor]
status: complete
last_updated: 2026-06-03
last_updated_by: Tomasz
---

# Research: Phase 2 Interaction and Isolation Test Coverage

**Date**: 2026-06-03
**Researcher**: Tomasz
**Git Commit**: b97dbd1d9df0e60249a7019bd868759004702847
**Branch**: feature/testing-interaction-isolation-coverage
**Repository**: 10xdev_project

## Research Question

Map the codebase to inform Phase 2 test coverage (risks #4, #5, #6, #7 from the test plan):
- **Risk #4**: Authenticated user reads or modifies another user's tasks by guessing a task ID (IDOR)
- **Risk #5**: Complete/dismiss undo leaves task missing after PATCH failure, or restores to wrong position
- **Risk #6**: Available-hours preference silently reverts to 8h default on next session
- **Risk #7**: Malformed API payload bypasses validation and stores corrupted task data

## Summary

**Risk #4 (IDOR) is doubly protected — RLS + explicit API-level ownership check.** Each table has four separate policies (one per operation). The API handlers explicitly filter by `user_id` in both the ownership-check select AND the mutation query itself. Cross-user attempts return 404 (not 403) by design — the handler conflates "not found" and "not owned" to prevent enumeration. Integration tests must use two authenticated Supabase clients; the test infrastructure needs a second test user. The test proves RLS: User B's client will see zero rows from User A's tasks (RLS silently hides them), and mutations will affect zero rows.

**Risk #5 (undo state machine) is closure-based, not Map-based.** The prior archived plan referenced a `useRef<Map>` but the actual implementation uses a per-call `AbortController` and a `let undone = false` closure variable. The undo logic is tightly coupled to React state (`setOverdueTasks`, `setTodayTasks`) and browser APIs (`fetch`, `AbortController`). This makes direct unit testing in Vitest's `node` environment impossible without extraction. The plan must extract `restoreAtIndex` as a pure function for unit testing. API-level integration testing can prove the reversal PATCH path: PATCH to "complete", then PATCH back to "pending".

**Risk #6 (settings persistence) has two independently testable seams.** The PATCH fires 500ms after the last `availableHours` state change (debounced in DailyView). The API endpoint (`PATCH /api/settings`) uses upsert with `onConflict: "user_id"`. The SSR page reads from DB at load time (not React state), defaulting to 8 if no row exists. Integration test: directly call the Supabase client to upsert `user_settings`, then verify the row matches. A second test: upsert as User A, verify User B cannot read User A's settings (RLS on `user_settings` is per-user). Infrastructure gap: `cleanupTestSettings` helper needed.

**Risk #7 (API validation) is consistently implemented across all data API routes.** All three data routes (POST tasks, PATCH tasks/[id], PATCH settings) follow the same pattern: `await request.json()` in try/catch (400 on JSON parse failure) → `Schema.safeParse(body)` → `Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 })` on failure. The auth routes (signin/signup/signout) use form data and intentionally skip Zod — this is correct per the CLAUDE.md pattern. The test plan requires "direct fetch with invalid payload" to prove the route uses the schema. This requires either a running dev server or importing and calling the handler directly with a mock context.

---

## Detailed Findings

### Risk #4 — IDOR: Cross-User Isolation

#### Database Layer: RLS Policies

**File**: `supabase/migrations/20260527000000_task_data_schema.sql`

**tasks table** (RLS enabled at line 58): Four separate authenticated-role policies:

| Policy | Operation | Condition |
|--------|-----------|-----------|
| `authenticated_select_tasks` | SELECT | `USING (user_id = auth.uid())` |
| `authenticated_insert_tasks` | INSERT | `WITH CHECK (user_id = auth.uid())` |
| `authenticated_update_tasks` | UPDATE | `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())` |
| `authenticated_delete_tasks` | DELETE | `USING (user_id = auth.uid())` |

**task_tags table** (RLS enabled at line 94): Four policies using correlated EXISTS subquery:

```sql
USING (EXISTS (
  SELECT 1 FROM tasks
  WHERE tasks.id = task_tags.task_id
    AND tasks.user_id = auth.uid()
))
```

Key point: `task_tags` has no `user_id` column — ownership is enforced through a join to the tasks table. A correlated subquery appears in all four operations.

#### API Layer: Ownership Checks

**File**: `src/pages/api/tasks/[id].ts`

Both PATCH (lines 9–97) and DELETE (lines 99–137) follow the same security pattern:

1. **Auth check** (lines 10–13 / 100–103): If `context.locals.user` is null → 401.
2. **Explicit ownership select** before mutation:
   ```typescript
   const { data: existing } = await supabase
     .from("tasks")
     .select("id")
     .eq("id", id)
     .eq("user_id", user.id)  // ← explicit ownership filter
     .maybeSingle();
   if (!existing) return Response.json({ error: "Task not found" }, { status: 404 });
   ```
3. **Mutation also filters by user_id** (redundant with RLS but explicit):
   - PATCH: `.update(scalarFields).eq("id", id).eq("user_id", user.id)`
   - DELETE: `.delete().eq("id", id).eq("user_id", user.id)`

**Return codes:**
- PATCH: 200 with full `TaskWithTags` on success, 404 on not-owned
- DELETE: 204 No Content on success, 404 on not-owned
- No 403 is ever returned — "not found" and "not owned" are conflated intentionally (prevents ID enumeration)

#### How the user is obtained

**File**: `src/middleware.ts`

Middleware creates a `@supabase/ssr` server client from request headers/cookies, calls `supabase.auth.getUser()`, and attaches the result to `context.locals.user`. API handlers read `context.locals.user.id`.

#### Test approach for Risk #4

Use two Supabase JS clients, each authenticated as a different user:
- User A creates a task → captures `task_id`
- User B client calls `from("tasks").select().eq("id", task_id).maybeSingle()` → result is null (RLS hides the row)
- User B client calls `from("tasks").update({name: "hacked"}).eq("id", task_id)` → 0 rows affected (RLS blocks update)
- User B client calls `from("tasks").delete().eq("id", task_id)` → 0 rows affected (RLS blocks delete)
- Verify User A's task still exists and is unchanged

**Infrastructure gap: a second test user is needed.** Currently `global-setup.ts` creates only one user. Phase 2 must:
- Add `TEST_USER2_EMAIL` and `TEST_USER2_PASSWORD` to `.env.test` / `.env.test.example`
- Extend `global-setup.ts` to create the second user
- Add `signInSecondTestUser()` helper to `src/test/supabase.ts`

---

### Risk #5 — Undo State Machine

#### Implementation: Closure-based, NOT Map-based

**File**: `src/components/daily/DailyView.tsx`

The prior archived plan (`context/archive/2026-05-29-daily-prioritized-view/plan.md:60`) described a `useRef<Map<string, ReturnType<typeof setTimeout>>>`. The actual implementation differs: each call to `handleStatusChange` creates a fresh closure with its own `AbortController` and a local `let undone = false` flag. There is no Map.

**Key variables in `handleStatusChange` closure** (lines ~50–116):
- `const idx = list.findIndex(...)` — original position captured at call time (line 53)
- `function restore()` — re-inserts at `idx` using `setOverdueTasks`/`setTodayTasks` (lines 57–63)
- `const controller = new AbortController()` — per-action abort controller (line 75)
- `let undone = false` — whether undo was triggered (line 76)

**Optimistic removal** (lines 66–70): Task is removed from React state immediately, before PATCH is sent.

**PATCH fired immediately** (lines 78–82): `fetch("/api/tasks/{id}", { method: "PATCH", body: { status }, signal: controller.signal })`. The PATCH is NOT deferred — it fires right away. The AbortController allows canceling it if undo is clicked before it lands.

**Undo handler** (toast action, lines 108–112):
```typescript
onClick: () => {
  undone = true;       // marks undo was clicked
  controller.abort(); // cancels in-flight PATCH (if not yet landed)
  restore();           // re-inserts task at original index
}
```

**If PATCH already landed before undo**: A reversal PATCH fires (lines 86–94):
```typescript
if (undone) {
  void fetch(`/api/tasks/${task.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "pending" }),
  }).catch(() => toast.error("Failed to undo — please refresh"));
}
```

**PATCH failure handling** (catch block, lines 96–102):
- If `AbortError`: return early (undo was intentional)
- If other error and `!undone`: call `restore()` + show error toast "Failed to update task — restored"

**Restore-at-index logic** (lines 57–63):
```typescript
function restore() {
  if (isOverdue) {
    setOverdueTasks((prev) => [...prev.slice(0, idx), task, ...prev.slice(idx)]);
  } else {
    setTodayTasks((prev) => [...prev.slice(0, idx), task, ...prev.slice(idx)]);
  }
}
```
The index is captured at the moment the status-change action is triggered, not dynamically re-calculated.

#### Testability constraint

Vitest is configured with `environment: node`. React components cannot be rendered; `useState`, `useEffect`, and browser APIs are unavailable. The undo state machine cannot be tested as a whole without changing the environment to `jsdom` (or using a React Testing Library setup).

**What CAN be extracted and unit-tested:**
- `restoreAtIndex<T>(arr: T[], idx: number, item: T): T[]` — a pure function that re-inserts an item at its original position. This is the core "restore to correct position" invariant.

**What CANNOT be unit-tested without jsdom:**
- The "undo fires no PATCH within 5s window" invariant — requires the React component, AbortController, and timing behavior
- The "PATCH failure restores task" invariant — requires mocked fetch + React state

**Integration test for the API side of undo:**
- PATCH `/api/tasks/{id}` via Supabase client with `{ status: "complete" }` → verify task status changes
- PATCH `/api/tasks/{id}` via Supabase client with `{ status: "pending" }` → verify task status reverts
- This proves the reversal PATCH path works at the DB/API level (though not the client-side abort logic)

#### Known gap

The AbortController "fires no PATCH" invariant and the optimistic-remove + restore behavior are UI/React concerns that cannot be proven by the Phase 2 unit/integration tests. This should be documented as a deliberate gap (not a failure to implement) — the test plan's "Unit (undo state machine)" target applies to the extractable pure-function portion only.

---

### Risk #6 — Settings Persistence

#### Complete PATCH-to-DB flow

**Debounce** (`src/components/daily/DailyView.tsx`, lines 23–40):
```typescript
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
// ...
useEffect(() => {
  if (!isMounted.current) { isMounted.current = true; return; }
  if (debounceRef.current !== null) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => {
    void fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ available_hours: availableHours }),
    }).catch(() => toast.error("Failed to save available hours"));
  }, 500);
  return () => { if (debounceRef.current !== null) clearTimeout(debounceRef.current); };
}, [availableHours]);
```

- Delay: **500ms** after last `availableHours` state change
- Skips initial mount via `isMounted` ref
- On failure: shows toast only — React state stays at new value (no revert)
- Debounce IS correctly using `useRef<typeof setTimeout>` here (different from the undo mechanism)

**PATCH endpoint** (`src/pages/api/settings.ts`, lines 38–70):
- Schema: `UpdateSettingsSchema` → `available_hours: z.number().min(0.25).max(24)`
- DB operation: `.upsert({ user_id: user.id, available_hours }, { onConflict: "user_id" })`
- Returns: 204 No Content on success, no body

**SSR read on page load** (`src/pages/daily.astro`):
```typescript
let availableHours = 8; // default
// ...
const settingsResult = await supabase
  .from("user_settings")
  .select("available_hours")
  .eq("user_id", user.id)
  .maybeSingle();
availableHours = (settingsResult.data?.available_hours as number | null | undefined) ?? 8;
```
The page reads from the DB at render time (SSR), not from React state. Confirms: if PATCH reaches DB, the next page load shows the new value.

**user_settings table** (`supabase/migrations/20260527000000_task_data_schema.sql`, lines 138–168):
- `user_id uuid PRIMARY KEY` — one row per user
- `available_hours numeric(4,1) DEFAULT 8 CHECK (> 0 AND <= 24)` — single decimal precision
- RLS: same four-policy pattern as tasks, using `user_id = auth.uid()`

**UpdateSettingsSchema** (`src/lib/schemas.ts`, lines 20–22):
- `z.number().min(0.25).max(24)` — JS number, not integer (supports 0.25 steps)
- Note: Zod min is 0.25 but DB CHECK is `> 0`; both allow 0.25 as the minimum valid value

#### Test approach for Risk #6

Phase 2 integration tests can use the Supabase client directly (no running dev server needed):
1. Sign in as test user
2. Upsert directly via `client.from("user_settings").upsert({ user_id: userId, available_hours: 12 }, { onConflict: "user_id" })`
3. Query back: `client.from("user_settings").select("available_hours").eq("user_id", userId).single()` → assert `data.available_hours === 12`
4. Verify that a second query (simulating page reload) returns 12, not 8

An additional case: verify that after upsert, a second upsert with a different value updates (not duplicates).

**Infrastructure gap: `cleanupTestSettings` helper needed.** The existing `cleanupTestTasks` only deletes from `tasks`. A new `cleanupTestSettings(client: SupabaseClient): Promise<void>` must be added to `src/test/supabase.ts` to delete from `user_settings` after settings tests.

---

### Risk #7 — API Input Validation

#### Consistent safeParse pattern across all data routes

All three data API routes follow identical error handling:

```typescript
// 1. Parse JSON
let body: unknown;
try {
  body = await context.request.json();
} catch {
  return Response.json({ error: "Invalid JSON" }, { status: 400 });
}

// 2. Validate with Zod
const parsed = Schema.safeParse(body);
if (!parsed.success) {
  return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
}
```

| Route | Method | Schema | 400 on invalid? |
|-------|--------|--------|-----------------|
| `src/pages/api/tasks/index.ts` | POST | `CreateTaskSchema` | ✅ Yes |
| `src/pages/api/tasks/[id].ts` | PATCH | `UpdateTaskSchema` | ✅ Yes |
| `src/pages/api/settings.ts` | PATCH | `UpdateSettingsSchema` | ✅ Yes |

Auth routes (signin/signup/signout) intentionally use `formData()` and have no Zod validation — this is correct per CLAUDE.md (auth pages are standard SSR wrappers using Supabase-managed flows).

#### Schema constraints (all in `src/lib/schemas.ts`)

```typescript
export const CreateTaskSchema = z.object({
  name: z.string().min(1).max(255),
  target_date: z.iso.date(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),  // 1, 2, or 3 ONLY
  time_estimate_minutes: z.number().int().positive(),
  tags: z.array(z.string().min(1).max(50)).max(5).default([]),
});

export const UpdateTaskSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  target_date: z.iso.date().optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),  // 1, 2, or 3 ONLY
  time_estimate_minutes: z.number().int().positive().optional(),
  tags: z.array(z.string().min(1).max(50)).max(5).optional(),
  status: z.enum(["pending", "complete", "dismissed"]).optional(),
});
```

**Invalid `priority: 4`** will fail `z.union([z.literal(1), z.literal(2), z.literal(3)])` and return:
```json
{
  "error": {
    "priority": {
      "_errors": ["Invalid enum value. Expected 1 | 2 | 3"]
    }
  }
}
```
with status 400.

#### Test infrastructure requirement: HTTP calls to the running API

The test plan explicitly requires: "direct fetch with invalid payload" to prove the route uses the schema (as opposed to a schema unit test, which is the anti-pattern). This means:

**Option A (preferred if simpler):** Import the route handler directly and call it with a mock `Request` + mock context:
```typescript
import { POST } from "@/pages/api/tasks/index";

const mockRequest = new Request("http://localhost/api/tasks", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Test", target_date: "2026-06-15", priority: 4, time_estimate_minutes: 30 }),
});
const mockContext = { locals: { user: { id: "test-user-id" } }, request: mockRequest };
const response = await POST(mockContext as any);
expect(response.status).toBe(400);
```
This avoids needing a running dev server. The handler imports `createClient` from `@/lib/supabase` which it calls with `context.request.headers` and `context.cookies` — the mock context needs to provide these. However, since the validation failure happens BEFORE the Supabase client is used, the mock only needs to satisfy the early-exit path.

**Option B (if direct import doesn't work due to Astro internals):** Add a `globalSetup` step to start the dev server, then make real `fetch` calls using the test user's JWT from `getSession()`.

The research recommends Option A first; fall back to Option B if Astro's route handler functions aren't directly importable in Vitest's node environment.

#### Note on `prerender = false`

Auth routes (signin/signup/signout) do NOT export `prerender = false`. This appears to be intentional: CLAUDE.md states auth routes use form submission + redirect (not JSON), and these pages may be handled differently by the Astro build. The data API routes correctly export `const prerender = false`.

---

## Code References

- `supabase/migrations/20260527000000_task_data_schema.sql:58–82` — tasks RLS: 4 policies
- `supabase/migrations/20260527000000_task_data_schema.sql:94–135` — task_tags RLS: 4 policies (correlated EXISTS)
- `supabase/migrations/20260527000000_task_data_schema.sql:138–168` — user_settings table + RLS
- `supabase/migrations/20260527000002_narrow_available_hours.sql` — narrows to `numeric(4,1)`
- `src/pages/api/tasks/[id].ts:9–97` — PATCH handler (auth + ownership check + update + return)
- `src/pages/api/tasks/[id].ts:99–137` — DELETE handler (auth + ownership check + delete + 204)
- `src/pages/api/tasks/index.ts:21–29` — POST handler JSON parse + safeParse → 400
- `src/pages/api/settings.ts:38–70` — settings PATCH: auth + parse + upsert → 204
- `src/middleware.ts` — attaches `context.locals.user` from `supabase.auth.getUser()`
- `src/lib/supabase.ts` — `createClient()` using `@supabase/ssr` cookie-based client
- `src/lib/schemas.ts:1–27` — all three Zod schemas + inferred types
- `src/components/daily/DailyView.tsx:23–40` — debounce useEffect for settings PATCH
- `src/components/daily/DailyView.tsx:50–116` — `handleStatusChange`: undo state machine
- `src/components/daily/DailyView.tsx:53` — `idx` capture at action time
- `src/components/daily/DailyView.tsx:57–63` — `restore()`: re-insert at original index
- `src/components/daily/DailyView.tsx:75–76` — AbortController + `undone` flag per action
- `src/components/daily/DailyView.tsx:86–94` — reversal PATCH if undo clicked after PATCH landed
- `src/components/daily/DailyView.tsx:96–102` — failure catch: restore if not undone
- `src/components/daily/TaskCard.tsx` — presentational only; calls `onStatusChange`, no undo logic
- `src/components/daily/AvailableHoursInput.tsx` — pure input component; debounce is in parent
- `src/pages/daily.astro` — SSR settings read + default of 8 hours
- `src/test/supabase.ts` — `signInTestUser()`, `cleanupTestTasks()` (Phase 1 helpers)
- `src/test/global-setup.ts` — creates test user once via service role
- `src/test/setup.ts` — loads `.env.test` per file
- `src/types.ts` — `Task`, `TaskTag`, `TaskWithTags`, `UserSettings` interfaces
- `vitest.config.ts` — `environment: node`, `fileParallelism: false`, `globalSetup`, `setupFiles`

---

## Architecture Insights

**IDOR: API returns 404, never 403.** This is an intentional design choice to prevent task ID enumeration. Integration tests must assert 404 when testing cross-user access, not 403.

**Undo: The archived plan's useRef<Map> was never built.** The actual implementation is closure-based per action. The Map pattern would have allowed lookup of active undo timers by task ID; the closure pattern is simpler (one live undo per concurrent action), but means state is not globally inspectable. This is a significant testability difference — closures can't be unit-tested without either extraction or jsdom.

**Settings: Upsert on conflict, not insert-or-update.** `user_settings` uses Postgres upsert (`onConflict: "user_id"`). The first PATCH creates the row; subsequent PATCHes update it. Tests must handle both scenarios (no pre-existing row, and pre-existing row with different value).

**Settings: SSR reads from DB, not React state.** A fresh page load always reflects the DB value, not the in-memory state from a previous session. This is the correct behavior that Risk #6 wants to verify — if the debounced PATCH fails silently, the next page load shows the old value.

**API validation error format is treeified Zod.** `z.treeifyError()` produces a nested object where field names are keys and `_errors` arrays hold messages. Tests asserting on error shape should check `response.json().error.priority._errors` rather than a flat string.

**Vitest environment: node only.** No React testing is possible without changing to `jsdom`. Phase 2 should stay within the established node environment constraint. The undo state machine unit test is bounded to extractable pure functions (`restoreAtIndex`); the full undo behavior remains untested at the unit level.

**Two-user test pattern is needed for the first time in Phase 2.** Phase 1 tests use a single test user. Phase 2's IDOR test requires two users. The global-setup extension is the correct place to add the second user; extending `src/test/supabase.ts` with a `signInSecondTestUser()` helper mirrors the established pattern.

---

## Historical Context (from prior changes)

- `context/changes/testing-critical-path-coverage/research.md` — Phase 1 research: discovered that `task_tags` RLS uses a correlated EXISTS subquery (no `user_id` column on `task_tags`). Also established that the Vitest environment is `node` only.
- `context/changes/testing-critical-path-coverage/plan.md` — Phase 1 plan: established the integration test pattern (Supabase JS client direct calls, `beforeAll`/`afterEach` with cleanup, `signInTestUser`/`cleanupTestTasks` helpers).
- `context/archive/2026-05-29-daily-prioritized-view/plan.md:60` — Archived plan referenced `useRef<Map<string, ReturnType<typeof setTimeout>>>` for undo tracking. The actual implementation diverged to a closure-based pattern. This is the source of the test plan's inaccurate description of the undo mechanism.
- `context/archive/2026-05-28-task-crud-and-tags/plan.md:53` — Tag update: DELETE all existing + INSERT new (no atomic rollback). RLS on `task_tags` uses correlated EXISTS — a test that modifies tags on another user's task will be silently blocked.

---

## Related Research

- `context/changes/testing-critical-path-coverage/research.md` — Phase 1 integration test infrastructure + Phase 1 risk analysis

---

## Open Questions

1. **Direct handler import vs. running dev server for Risk #7.** Option A (import handler) is simpler but may not work if the handler has Astro-internal dependencies that fail to resolve in Vitest's module environment. If import fails, Option B (globalSetup starts dev server) is the fallback. The plan should specify which is attempted first and what the fallback is.

2. **Second test user naming.** Should the second user be `test2@example.com` / `Test1234!` (mirroring the first)? Or a completely different email domain? Recommend `test2@example.com` for consistency with Phase 1 naming.

3. **cleanupTestSettings scope.** Should `cleanupTestSettings` delete ONLY the test user's settings row, or should it also work for the second test user? Design it to accept a `SupabaseClient` parameter (which authenticates as a specific user) and delete using the authenticated user's identity via RLS. This is consistent with `cleanupTestTasks`.

4. **Undo unit test boundary.** `restoreAtIndex` is the only extractable pure function from the undo state machine. Should the plan also extract a `buildUndoHandler(task, list, isOverdue, setOverdueTasks, setTodayTasks)` factory that returns the handler for testing with `vi.fn()` mocks? This would allow testing the PATCH-fires and restore-on-failure paths without jsdom, at the cost of adding complexity to `DailyView.tsx`. Recommend leaving the undo handler inline (complexity not justified by one test) and documenting the gap.

5. **Risk #7 test: POST vs PATCH.** The test plan's example uses `priority: 4`. Both `CreateTaskSchema` and `UpdateTaskSchema` reject this. The plan should choose one endpoint to test to avoid redundancy. POST `/api/tasks` is the natural choice (it's the primary write path); PATCH `/api/tasks/[id]` can be verified with a different field (`status: "invalid_value"`) to prove the validation pattern is universal.
