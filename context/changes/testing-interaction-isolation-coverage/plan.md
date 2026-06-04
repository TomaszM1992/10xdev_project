# Phase 2 Interaction and Isolation Coverage — Implementation Plan

## Overview

Add Phase 2 test coverage for four risks from the test plan: IDOR isolation (Risk #4), undo state machine (Risk #5), settings persistence (Risk #6), and API input validation (Risk #7). Mirrors the three-phase structure of Phase 1: extract and extend first, then unit/API-validation tests, then database-backed integration tests.

## Current State Analysis

Phase 1 is complete. The test suite has 6 `applyBudgetFilter` unit tests plus three integration test suites (persistence, date-filter, ranking). The Vitest config uses `environment: node`, `fileParallelism: false`, a `globalSetup` that creates one test user, and a `setupFiles` that loads `.env.test`. The `src/test/supabase.ts` helpers provide `signInTestUser()` and `cleanupTestTasks()`.

Four Phase 2 gaps remain:
- **Risk #4 (IDOR):** No two-user test infrastructure; no test proving RLS blocks cross-user access.
- **Risk #5 (undo):** The `restore()` function inside `DailyView.tsx` is an inline closure — not extractable as a pure function until refactored. No unit test exists for the restore-at-index invariant.
- **Risk #6 (settings):** No test proving a `user_settings` upsert lands in the database and persists across sessions.
- **Risk #7 (API validation):** No test proving the POST handler calls `safeParse` and returns 400 on invalid input — only schema unit tests exist, which is the anti-pattern the test plan explicitly flags.

## Desired End State

`npm test` runs cleanly with all existing tests plus:
- 5 new `restoreAtIndex` unit tests in `src/lib/daily.test.ts`
- 4 new API validation handler tests in `src/test/integration/api-validation.test.ts`
- 3 cross-user isolation integration tests in `src/test/integration/cross-user-isolation.test.ts`
- 2 undo-reversal integration tests in `src/test/integration/undo-reversal.test.ts`
- 3 settings-persistence integration tests in `src/test/integration/settings-persistence.test.ts`

All four Phase 2 risks have automated regression coverage. The undo abort/restore behavior that requires `jsdom` is documented as a deliberate gap and does not need a test.

### Key Discoveries

- `src/components/daily/DailyView.tsx:57–63` — `restore()` uses inline spread logic; the core operation is `[...prev.slice(0, idx), task, ...prev.slice(idx)]`. Extracting this as `restoreAtIndex<T>(arr, idx, item)` to `src/lib/daily.ts` requires one new export and one updated import in `DailyView.tsx`.
- `src/components/daily/DailyView.tsx:50–116` — `handleStatusChange` is a closure; the undo mechanism uses `let undone = false` and `new AbortController()` per call, not a `useRef<Map>`. The abort-no-PATCH invariant is not testable in node environment.
- `src/pages/api/tasks/index.ts:21–29` — The POST handler reads JSON, calls `CreateTaskSchema.safeParse`, and returns `Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 })` on failure — before any Supabase calls. Mocking `@/lib/supabase` is sufficient; `astro:env/server` is never evaluated.
- `src/test/global-setup.ts` — Creates one test user via service role. Extending for a second user follows the same pattern; the second `createUser` call is idempotent (existing user is silently accepted).
- `supabase/migrations/20260527000000_task_data_schema.sql:58–82` — RLS on `tasks` uses `user_id = auth.uid()` for all four operations. A Supabase JS client authenticated as User B will receive 0 rows on SELECT and 0 rows affected on UPDATE/DELETE for User A's tasks — not an error.
- `src/pages/api/settings.ts:38–70` — Settings PATCH uses `.upsert({ user_id, available_hours }, { onConflict: "user_id" })` and returns 204. The `user_settings` table has no row until the first upsert.

## What We're NOT Doing

- Fixing the UTC date defaulting bug in `daily.astro` — tracked separately.
- Adding `npm test` to CI — that is Phase 3 of the rollout.
- Testing the undo abort-no-PATCH invariant — requires `jsdom` environment; documented as a deliberate gap.
- Testing the full HTTP stack for Risk #4 (404 response from handler) — the Supabase client test proves RLS, which is the last line of defense.
- Testing auth routes (signin, signup, signout) — uses form data, no Zod validation; excluded per test plan §7.
- Testing `applyBudgetFilter` with the new `restoreAtIndex` function — unrelated; the Phase 1 unit tests already cover `applyBudgetFilter`.

## Implementation Approach

Three phases mirror Phase 1:

1. **Production code + infrastructure** — Extract `restoreAtIndex`, update `DailyView.tsx`, add the second test user and new helpers. No test additions yet; build and lint gates verify nothing regressed.
2. **Unit tests + API validation test** — Add `restoreAtIndex` unit tests and the `api-validation` handler test. The handler test uses `vi.mock("@/lib/supabase")` to intercept the `createClient` call; validation fails before Supabase is reached so no real DB connection is needed.
3. **Integration tests** — Three test files using Supabase clients directly (no HTTP, no running dev server). The IDOR test uses two authenticated clients; the undo-reversal and settings tests use one.

## Critical Implementation Details

**vi.mock hoisting for the handler import test.** Vitest hoists `vi.mock(...)` calls to the top of the module, before any `import` statements execute. The handler file must be dynamically imported after the mocks are declared — use `const { POST } = await import("@/pages/api/tasks/index")` inside a `beforeAll` block, not as a top-level static import. Static import of the handler before mocks are in effect will load the real `@/lib/supabase` module, which imports `astro:env/server` and fails to resolve.

**Two-user cleanup ordering.** `cross-user-isolation.test.ts` creates a task as User A in `beforeAll`, then User B's tests attempt (and fail) to mutate it. The `afterAll` cleanup must use `cleanupTestTasks(userAClient)` — not `userBClient` — because User B's RLS cannot delete User A's tasks.

---

## Phase 1: Production Code Change + Infrastructure Extension

### Overview

Extract `restoreAtIndex` as a pure function, update `DailyView.tsx` to use it, and extend the test infrastructure with a second test user and two new helpers. No test additions yet; the build and lint gates verify the extraction didn't break the production behavior.

### Changes Required

#### 1. Add `restoreAtIndex` to `src/lib/daily.ts`

**File**: `src/lib/daily.ts`

**Intent**: Export a generic pure function that re-inserts an item at a captured index into an array. This is the operation the undo mechanism's `restore()` function performs; exporting it enables unit testing without React state or jsdom.

**Contract**: Add one export below `applyBudgetFilter`. Signature: `export function restoreAtIndex<T>(arr: T[], idx: number, item: T): T[]`. Body: return a new array with `item` inserted at position `idx`. No mutation; returns a fresh array.

#### 2. Update `restore()` in `DailyView.tsx`

**File**: `src/components/daily/DailyView.tsx`

**Intent**: Wire the component to use the extracted function, keeping the restore behavior byte-for-byte identical.

**Contract**: Add `restoreAtIndex` to the import from `@/lib/daily`. In the `restore()` function (lines ~57–63), replace the inline spread expressions with calls to `restoreAtIndex(prev, idx, task)` for both `setOverdueTasks` and `setTodayTasks`.

#### 3. Extend `.env.test.example`

**File**: `.env.test.example`

**Intent**: Document the second test user credentials so anyone setting up a fresh test environment knows both users are required.

**Contract**: Append two lines to `.env.test.example`:
```
TEST_USER2_EMAIL=test2@example.com
TEST_USER2_PASSWORD=Test1234!
```
The corresponding `.env.test` (gitignored) must also receive these values before Phase 3 tests run.

#### 4. Extend `src/test/global-setup.ts`

**File**: `src/test/global-setup.ts`

**Intent**: Create the second test user in local Supabase once before all test suites, using the same idempotent pattern as the first user.

**Contract**: After the existing `createUser` call for `TEST_USER_EMAIL`, add a second call for `TEST_USER2_EMAIL` and `TEST_USER2_PASSWORD` from `process.env`. Apply the same "already been registered" error suppression.

#### 5. Add `signInSecondTestUser()` to `src/test/supabase.ts`

**File**: `src/test/supabase.ts`

**Intent**: Provide an authenticated Supabase client for the second test user, following the same pattern as `signInTestUser()`.

**Contract**: Export `async function signInSecondTestUser(): Promise<SupabaseClient>`. Implementation mirrors `signInTestUser()` exactly, reading `TEST_USER2_EMAIL` and `TEST_USER2_PASSWORD` from `process.env`. Include the same local-URL guard (`url.startsWith("http://127.0.0.1")`).

#### 6. Add `cleanupTestSettings()` to `src/test/supabase.ts`

**File**: `src/test/supabase.ts`

**Intent**: Delete the authenticated user's `user_settings` row, giving settings tests a clean slate analogous to how `cleanupTestTasks` resets the tasks table.

**Contract**: Export `async function cleanupTestSettings(client: SupabaseClient): Promise<void>`. Call `client.auth.getUser()` to get `user.id`, then `client.from("user_settings").delete().eq("user_id", data.user.id)`. Throw if no user is authenticated or if the delete returns an error.

### Success Criteria

#### Automated Verification

- `npm run build` succeeds with no errors
- `npm run lint` passes on all modified files
- No TypeScript errors in `src/lib/daily.ts`, `src/components/daily/DailyView.tsx`, or `src/test/supabase.ts`

#### Manual Verification

- Start dev server (`npm run dev`) and open the daily view — tasks appear, undo functions identically to before Phase 1; optimistic removal, restore, and error toast all work

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Unit Tests + API Validation Test

### Overview

Add the `restoreAtIndex` unit tests and the Risk #7 handler import test. The handler test does not hit the database — it mocks `@/lib/supabase` and calls the route handler directly with a constructed `Request`, proving the route calls `safeParse` and returns 400 before any Supabase interaction.

### Changes Required

#### 1. Add `restoreAtIndex` unit tests to `src/lib/daily.test.ts`

**File**: `src/lib/daily.test.ts`

**Intent**: Prove the restore-at-index invariant under all boundary conditions the undo mechanism encounters.

**Contract**: Add a `describe("restoreAtIndex")` block with five `it()` cases. Import `restoreAtIndex` from `@/lib/daily`. All cases use plain arrays — no Supabase, no async.

| # | Case | Input | Expected output |
|---|------|-------|-----------------|
| 1 | Insert at position 0 (start) | `restoreAtIndex([2, 3], 0, 1)` | `[1, 2, 3]` |
| 2 | Insert at last index (end) | `restoreAtIndex([1, 2], 2, 3)` | `[1, 2, 3]` |
| 3 | Insert in middle | `restoreAtIndex([1, 3], 1, 2)` | `[1, 2, 3]` |
| 4 | Insert into empty array | `restoreAtIndex([], 0, "x")` | `["x"]` |
| 5 | Captured index matches remove-and-restore round-trip | Remove element at index 1 from `[a, b, c]`, restore with `restoreAtIndex(arr_without_b, 1, b)` | `[a, b, c]` |

#### 2. Create `src/test/integration/api-validation.test.ts`

**File**: `src/test/integration/api-validation.test.ts` *(new)*

**Intent**: Prove that `POST /api/tasks` calls `CreateTaskSchema.safeParse` and returns 400 (not 200 or 500) when the payload is invalid — verifying the route uses the schema, not just that the schema exists.

**Contract**: Use `vi.mock` to replace `@/lib/supabase` before the handler is loaded. Dynamically import `POST` from `@/pages/api/tasks/index` inside `beforeAll`. Build a reusable helper that constructs a mock context with `locals.user` set and a `Request` with the given JSON body. Four `it()` cases, no Supabase calls, no async DB work:

| # | Case | Payload / setup | Expected status | Expected body |
|---|------|-----------------|-----------------|---------------|
| 1 | Invalid priority (4) | `{ name: "T", target_date: "2026-06-15", priority: 4, time_estimate_minutes: 30 }` | 400 | `body.error.priority` is defined |
| 2 | Missing required field | `{ name: "T", priority: 1, time_estimate_minutes: 30 }` (no `target_date`) | 400 | `body.error` is defined |
| 3 | Non-JSON body | Raw string `"not-json"` as body | 400 | `body.error === "Invalid JSON"` |
| 4 | No authenticated user | `locals.user: null`, valid payload | 401 | `body.error === "Unauthorized"` |

The mock context for cases 1–3: `{ locals: { user: { id: "test-user-id" } }, cookies: {}, request: <Request> }`. For case 4: `locals.user: null`.

`vi.mock("@/lib/supabase", () => ({ createClient: () => ({}) }))` must appear at the top of the file (Vitest hoists it). The dynamic import of `POST` must be inside `beforeAll`:
```typescript
let POST: (ctx: unknown) => Promise<Response>;
beforeAll(async () => {
  ({ POST } = await import("@/pages/api/tasks/index"));
});
```

### Success Criteria

#### Automated Verification

- `npm test` reports all prior tests plus 5 `restoreAtIndex` unit tests and 4 API validation tests passing (0 failing)
- `npm run lint` passes on new files

#### Manual Verification

- Run `npm test` without `supabase start` — the unit and handler tests pass (they do not need a running DB); the integration tests from Phase 1 may fail if Supabase is not running, but Phase 2 tests must not

**Implementation Note**: Pause after this phase for manual confirmation that the API validation tests pass without a running Supabase instance, before proceeding to Phase 3.

---

## Phase 3: Integration Tests (Risk #4, #5, #6)

### Overview

Write three integration test files against the real local Supabase DB. The IDOR test uses two authenticated clients. The undo-reversal and settings tests use one client. All follow the established `beforeAll` / `afterEach` (or `afterAll`) cleanup pattern.

### Changes Required

#### 1. `src/test/integration/cross-user-isolation.test.ts` (Risk #4)

**File**: `src/test/integration/cross-user-isolation.test.ts` *(new)*

**Intent**: Prove that RLS prevents User B from reading, modifying, or deleting User A's tasks — even when User B knows the task's UUID.

**Contract**: `beforeAll` signs in both users (via `signInTestUser()` and `signInSecondTestUser()`), captures User A's `userId`, pre-cleans User A's tasks, then inserts one task as User A and captures its `id`. `afterAll` calls `cleanupTestTasks(userAClient)`. Three `it()` cases:

| # | Case | User B action | Assertion |
|---|------|---------------|-----------|
| 1 | RLS hides task on SELECT | `.from("tasks").select().eq("id", taskId).maybeSingle()` | `data` is `null` |
| 2 | RLS blocks UPDATE; original is unchanged | `.from("tasks").update({ name: "hacked" }).eq("id", taskId).select()` | returned `data` array has length 0; User A re-fetches task and `name` is unchanged |
| 3 | RLS blocks DELETE; task still exists | `.from("tasks").delete().eq("id", taskId)` (no assertion on delete call itself); then User A re-fetches | `data` is non-null (task survived) |

Use `afterAll` (not `afterEach`) because all three tests share the single fixture task created in `beforeAll`.

#### 2. `src/test/integration/undo-reversal.test.ts` (Risk #5)

**File**: `src/test/integration/undo-reversal.test.ts` *(new)*

**Intent**: Prove the server accepts the full status transition cycle (`pending → complete → pending`) so the undo reversal PATCH path works end-to-end at the database layer.

**Contract**: `beforeAll` signs in, pre-cleans, and inserts one task with `status: "pending"`. `afterAll` cleans up. Two `it()` cases:

| # | Case | Action | Assertion |
|---|------|--------|-----------|
| 1 | PATCH to `"complete"` updates status | `.update({ status: "complete" }).eq("id", taskId).select().single()` | `data.status === "complete"` |
| 2 | PATCH back to `"pending"` (undo reversal) restores status | `.update({ status: "pending" }).eq("id", taskId).select().single()` | `data.status === "pending"` |

Use `afterAll` (tests run sequentially and share the same task row).

#### 3. `src/test/integration/settings-persistence.test.ts` (Risk #6)

**File**: `src/test/integration/settings-persistence.test.ts` *(new)*

**Intent**: Prove that a `user_settings` upsert reaches the DB with the correct value and that a second upsert updates the existing row (simulating what the debounced PATCH does on each `availableHours` change).

**Contract**: `beforeAll` signs in, captures `userId`, and calls `cleanupTestSettings(client)` (pre-clean). `afterEach` calls `cleanupTestSettings(client)` so each test starts with no row. Three `it()` cases:

| # | Case | Setup | Assertion |
|---|------|-------|-----------|
| 1 | Upsert creates row when none exists | Upsert `{ user_id, available_hours: 12 }` | Re-query: `data.available_hours === 12` |
| 2 | Second upsert updates existing row | Upsert 12, then upsert 6 | Re-query: `data.available_hours === 6` (not 12) |
| 3 | No row → query returns null (default behavior) | (no upsert; afterEach from test 2 already cleaned) | `.maybeSingle()` returns `data === null` — confirms page will use 8h default |

#### 4. Update `context/foundation/test-plan.md`

**File**: `context/foundation/test-plan.md`

**Intent**: Mark Phase 2 as complete in the rollout table.

**Contract**: In the `## 3. Phased Rollout` table, change Phase 2's `Status` cell from `not started` to `complete` and set the `Change folder` cell to `context/changes/testing-interaction-isolation-coverage/`.

### Success Criteria

#### Automated Verification

- `npm test` (with `supabase start` running) reports all tests passing — including the 8 new integration test cases across 3 new files
- `npm run lint` passes
- No TypeScript errors

#### Manual Verification

- Run `supabase start`, then `npm test` twice in a row — both runs pass (cleanup is working correctly, no stale state between runs)
- Check Supabase Studio (`http://127.0.0.1:54323`) after a test run: `tasks` table is empty, `user_settings` table is empty
- Confirm the second test user (`test2@example.com`) appears in the auth users table alongside the first

**Implementation Note**: After all integration tests pass locally, update `context/foundation/test-plan.md` Phase 2 status.

---

## Testing Strategy

### Unit Tests

`src/lib/daily.test.ts` — 5 cases for `restoreAtIndex`:
- Insert at start, insert at end, insert in middle, insert into empty array, round-trip remove-and-restore

### Handler Import Tests

`src/test/integration/api-validation.test.ts` — 4 cases for `POST /api/tasks` handler:
- `priority: 4` → 400 with error body, missing `target_date` → 400, non-JSON body → 400 with "Invalid JSON", no user → 401

### Integration Tests

`src/test/integration/cross-user-isolation.test.ts` — Risk #4:
- User B SELECT returns null, User B UPDATE affects 0 rows (task unchanged), User B DELETE affects 0 rows (task survives)

`src/test/integration/undo-reversal.test.ts` — Risk #5:
- PATCH to "complete" succeeds, PATCH to "pending" succeeds (reversal)

`src/test/integration/settings-persistence.test.ts` — Risk #6:
- First upsert creates row, second upsert updates row, no row returns null

### Manual Testing

1. `supabase start` → `npm test` → all tests pass
2. Run `npm test` a second time → all tests pass (idempotent cleanup)
3. `npm run dev` → open daily view → undo a task → verify it disappears optimistically, undo toast appears, clicking Undo restores the task to its original position

### Deliberate Gap

The undo abort-no-PATCH invariant ("clicking Undo within 5s cancels the in-flight PATCH") is not automatically tested. The `AbortController` behavior and the `let undone = false` closure are browser/React concerns that require `jsdom`. This gap is acceptable: the reversal PATCH integration test proves the server side works; the abort behavior is verified by the manual undo test in step 3 above.

## References

- Research: `context/changes/testing-interaction-isolation-coverage/research.md`
- Phase 1 plan (structural reference): `context/changes/testing-critical-path-coverage/plan.md`
- Test plan (risks and protection criteria): `context/foundation/test-plan.md`
- DailyView undo mechanism: `src/components/daily/DailyView.tsx:50–116`
- restoreAtIndex source location: `src/components/daily/DailyView.tsx:57–63`
- POST handler (Risk #7): `src/pages/api/tasks/index.ts:21–29`
- Schemas: `src/lib/schemas.ts`
- Existing helpers: `src/test/supabase.ts`
- Vitest config: `vitest.config.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Production Code Change + Infrastructure Extension

#### Automated

- [x] 1.1 `npm run build` succeeds with no errors — 05c89f5
- [x] 1.2 `npm run lint` passes on all modified files — 05c89f5
- [x] 1.3 No TypeScript errors in `src/lib/daily.ts`, `src/components/daily/DailyView.tsx`, or `src/test/supabase.ts` — 05c89f5

#### Manual

- [x] 1.4 Daily view tasks appear and undo functions identically to before (optimistic removal, restore, and error toast) — 05c89f5

### Phase 2: Unit Tests + API Validation Test

#### Automated

- [x] 2.1 `npm test` reports all existing tests plus 5 `restoreAtIndex` unit tests and 4 API validation tests passing — 1af4239
- [x] 2.2 `npm run lint` passes on `src/lib/daily.test.ts` and `src/test/integration/api-validation.test.ts` — 1af4239

#### Manual

- [x] 2.3 `npm test` (without `supabase start`) passes the Phase 2 tests — confirms they do not require a running DB — 1af4239

### Phase 3: Integration Tests (Risk #4, #5, #6)

#### Automated

- [x] 3.1 `npm test` (with `supabase start`) reports all tests passing, including 8 new integration cases
- [x] 3.2 `npm run lint` passes

#### Manual

- [x] 3.3 Second consecutive `npm test` run passes (cleanup is idempotent)
- [x] 3.4 `tasks` and `user_settings` tables are empty in Supabase Studio after a test run
- [x] 3.5 Second test user (`test2@example.com`) visible in Supabase Studio auth table
- [x] 3.6 Update `context/foundation/test-plan.md` Phase 2 status to `complete`
