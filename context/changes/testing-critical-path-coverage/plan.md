# Phase 1 Critical-Path Coverage — Implementation Plan

## Overview

Add Phase 1 test coverage: prove task persistence (Risk #2), date-filter correctness (Risk #1), and ranking edge cases (Risk #3). Covers one production code change (deterministic tiebreaker in `ORDER BY`), one refactor prerequisite (extract pure budget filter), then Vitest infrastructure and three integration + six unit tests.

## Current State Analysis

One test file exists (`src/lib/schemas.test.ts`, 23 Zod schema unit tests). No integration tests, no Supabase connection in tests, no auth session helpers. The cumulative budget filter lives inside a React component (`DailyView.tsx:41-51`) — not unit-testable under the current `environment: node` Vitest config. The two daily-view Supabase queries (`daily.astro:42-55`) sort by `priority, time_estimate_minutes` but have no tiebreaker for equal values.

## Desired End State

`npm test` runs cleanly after `supabase start` and produces:
- 6 passing unit tests for `applyBudgetFilter` (pure function, no DB)
- 3 passing integration test suites (persistence, date-filter, ranking) against a real local Supabase DB

All three Phase 1 risks have automated regression coverage. The test run is self-contained: no running dev server, no mocks, no snapshot oracles.

### Key Discoveries

- `src/pages/daily.astro:12-14` — `localISO()` uses local-time getters that equal UTC on Workers. The URL `?date=` param path is safe; the server-side default is broken. **Phase 1 does not fix the bug** — the integration tests use explicit dates, bypassing the defaulting.
- `src/pages/daily.astro:42-55` — Two parallel queries (`overdue` + `today`) both need `created_at` added as third ORDER BY key.
- `src/components/daily/DailyView.tsx:41-51` — Budget filter loop to extract verbatim into a pure function.
- `src/lib/supabase.ts` — Uses `@supabase/ssr` cookie-based client. Tests use `@supabase/supabase-js` `createClient` directly (no cookie plumbing needed).
- `supabase/migrations/` — Runs cleanly on `supabase start`. Tasks table: `user_id uuid NOT NULL`, so all inserts from test code must include the authenticated user's `user_id`.
- `user_settings` upsert is lazy — no row until first PATCH. Integration tests that need a specific `available_hours` must upsert settings first; tests that don't care accept the 8h default.
- Tag normalization trigger lowercases `tag_name` on INSERT. Integration tests that create tasks with tags should expect lowercase.
- Vitest 4 is configured with `environment: node` and no globals — tests must import `describe`, `it`, `expect` explicitly.

## What We're NOT Doing

- Fixing the UTC date defaulting bug in `daily.astro` — tracked as a follow-up; Phase 1 tests work around it via explicit `?date=` params.
- Adding `npm test` to CI — that is Phase 3.
- Testing Astro middleware, cookie auth, or the HTTP layer — integration tests call Supabase directly.
- Testing tag creation, editing, or deletion — Risk #7 (input validation) is Phase 2.
- Testing the undo state machine or settings persistence — Risks #5 and #6 are Phase 2.

## Implementation Approach

Three phases with clear gate between each:

1. **Production changes** — `created_at` ORDER BY tiebreaker and budget filter extraction. No test additions yet; existing build and lint gates verify nothing regressed.
2. **Infrastructure + unit tests** — Wire the local Supabase test client, global setup for test user creation, and the six unit tests for the now-extractable pure function.
3. **Integration tests** — Three test files using the helpers from Phase 2, each directly mapping to one risk.

Integration tests call `supabase.auth.signInWithPassword()` to get an authenticated session, then make direct Supabase JS client calls (no running dev server). Each test suite cleans up its own tasks in `afterEach` plus a `beforeAll` pre-clean in case a prior run left state.

---

## Phase 1: Production Code Changes

### Overview

Two targeted changes with no test additions: add a deterministic tiebreaker to the daily view SQL queries, and extract the budget filter into a pure function that Phase 2 can unit-test.

### Changes Required

#### 1. Add `created_at` as third ORDER BY key

**File**: `src/pages/daily.astro`

**Intent**: Make task ordering deterministic when two tasks share the same `priority` and `time_estimate_minutes`. Without this, PostgreSQL can return equal-ranked tasks in any order, making integration tests unreliable and creating subtle UX regressions if the planner changes.

**Contract**: Both Supabase query chains in the overdue block (~line 42–48) and the today block (~line 49–55) currently end with `.order("time_estimate_minutes", { ascending: true })`. Append `.order("created_at", { ascending: true })` to both. No other changes to query logic.

#### 2. Create `applyBudgetFilter` as a pure function

**File**: `src/lib/daily.ts` *(new file)*

**Intent**: Extract the cumulative budget filter from `DailyView.tsx` into a standalone pure function so it can be unit-tested without jsdom or React rendering infrastructure.

**Contract**: The function takes `tasks: Task[]` and `availableHours: number`, returns `Set<string>` of task IDs whose cumulative `time_estimate_minutes` fits within `availableHours * 60`. Boundary is inclusive (`cum + time <= budgetMinutes` means the task is included). Import `Task` from `@/types`. Body is a verbatim lift of the for-loop currently at `DailyView.tsx:41-51`.

#### 3. Replace inline budget filter in DailyView

**File**: `src/components/daily/DailyView.tsx`

**Intent**: Wire the component to use the extracted function, keeping behavior byte-for-byte identical.

**Contract**: Add import `import { applyBudgetFilter } from "@/lib/daily"`. Remove the inline `budgetMinutes`, `fittingIds`, `cum` declarations and the for-loop (lines 41–51). Replace with:
```typescript
const all = [...overdueTasks, ...todayTasks];
const fittingIds = applyBudgetFilter(all, availableHours);
```
The `all` variable is unchanged (overdue first). Everything else in the component is untouched.

### Success Criteria

#### Automated Verification

- Build succeeds: `npm run build`
- Lint passes: `npm run lint`
- TypeScript compiles: no errors on `npx astro check` (or `tsc --noEmit` if configured)

#### Manual Verification

- Start dev server (`npm run dev`) and open the daily view — tasks appear in the same order as before Phase 1
- Budget cutoff still works: tasks exceeding the available hours limit are excluded from the display

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Test Infrastructure + Unit Tests

### Overview

Install the two test devDependencies, wire Vitest's global setup, create the `.env.test` credential file, implement the Supabase test client helpers, and write the six unit tests for `applyBudgetFilter`.

### Changes Required

#### 1. Install devDependencies

**File**: `package.json` (via `npm install`)

**Intent**: Make `@supabase/supabase-js` an explicit devDependency (currently only a transitive dep via `@supabase/ssr`) and add `dotenv` for loading `.env.test` in the global setup file.

**Contract**: Run `npm install -D @supabase/supabase-js dotenv`. Both appear in `devDependencies` in `package.json`.

#### 2. Update Vitest config to add globalSetup

**File**: `vitest.config.ts`

**Intent**: Register a global setup file that runs once before all test suites to create the test user in the local Supabase instance.

**Contract**: Add `globalSetup: ["./src/test/global-setup.ts"]` to the `test` object. The existing `environment: "node"` and `resolve.alias` remain unchanged.

#### 3. Create `.env.test` and protect it from git

**File**: `.env.test` *(new, gitignored)*  
**File**: `.env.test.example` *(new, committed)*  
**File**: `.gitignore` *(update)*

**Intent**: Hold the local Supabase credentials and test user credentials. Local Supabase defaults are dev-only values — not production secrets — but keeping them out of git is good hygiene.

**Contract**: `.env.test` contains:
```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<paste from: supabase status>
SUPABASE_SERVICE_ROLE_KEY=<paste from: supabase status>
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=Test1234!
```
`.env.test.example` is identical with placeholder values instead of real keys. Add `.env.test` (not `.env.test.example`) to `.gitignore`.

#### 4. Create `src/test/global-setup.ts`

**File**: `src/test/global-setup.ts` *(new)*

**Intent**: Create the test user in the local Supabase instance exactly once before any test suite runs. Idempotent: silently skips if the user already exists.

**Contract**: Export an async `setup()` function. Inside it: call `config({ path: ".env.test" })` from `dotenv`, then create a service-role Supabase client (with `autoRefreshToken: false, persistSession: false`), then call `adminClient.auth.admin.createUser({ email, password, email_confirm: true })`. If the returned error message includes `"already been registered"`, swallow it. Any other error is re-thrown.

#### 5. Create `src/test/supabase.ts`

**File**: `src/test/supabase.ts` *(new)*

**Intent**: Provide the two reusable helpers all integration tests share: authenticated client factory and task cleanup.

**Contract**: Export two functions:

`signInTestUser(): Promise<SupabaseClient>` — creates a `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` instance, calls `signInWithPassword({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })`, throws on error, returns the authenticated client.

`cleanupTestTasks(client: SupabaseClient): Promise<void>` — calls `client.auth.getUser()` to get `user.id`, then `client.from("tasks").delete().eq("user_id", user.id)`. Throws if no user is authenticated.

#### 6. Write `src/lib/daily.test.ts`

**File**: `src/lib/daily.test.ts` *(new)*

**Intent**: Unit-test `applyBudgetFilter` against six cases that cover the boundaries the test plan identified as unverified.

**Contract**: One `describe("applyBudgetFilter")` block with six `it()` cases. Each test constructs a plain object array (type-compatible with `Task` — only `id` and `time_estimate_minutes` are needed by the function). No Supabase, no async, no fixtures.

| # | Case | Setup | Assert |
|---|------|-------|--------|
| 1 | Happy path — all tasks fit | 3 tasks totalling 60 min, budget = 2h | All 3 IDs in Set |
| 2 | Exact boundary — inclusive | 2 tasks: 30 + 60 min, budget = 1.5h (90 min) | Both IDs included |
| 3 | Over-budget task skipped, smaller later task fits | Tasks: 60, 60, 20 min; budget = 1h | ID 1 included, ID 2 excluded (120 > 60), ID 3 included (60 + 20 = 80... wait) |

Hold on — let me recalculate case 3. Budget = 60 min. Task 1: 60 min → fits (cum=60). Task 2: 60 min → 60+60=120 > 60, skip. Task 3: 20 min → cum is still 60, 60+20=80 > 60, skip. So task 3 is also excluded. That doesn't test "smaller later task fits". Let me restructure:

Tasks: 50, 60, 20 min; budget = 70 min.
- Task 1: 50 → fits (cum=50)
- Task 2: 60 → 50+60=110 > 70, skip
- Task 3: 20 → 50+20=70 ≤ 70, fits (cum=70)
- Assert: IDs 1 and 3 in Set, ID 2 not in Set

| # | Case | Setup | Assert |
|---|------|-------|--------|
| 1 | Happy path — all tasks fit | 3 tasks: 20+30+40 min, budget = 2h | All 3 IDs in Set |
| 2 | Exact boundary — inclusive | Tasks: 30 + 60 min, budget = 1.5h (90 min) | Both IDs included |
| 3 | Over-budget task skipped; smaller later task fits | Tasks: 50, 60, 20 min; budget = 70 min | IDs 1 and 3 in Set, ID 2 not |
| 4 | Overdue-first ordering | Array = [overdueTask(P2, 40min), todayTask(P1, 40min)]; budget = 40 min | Only overdueTask's ID in Set |
| 5 | Empty array | `[]`, any budget | Empty Set |
| 6 | Zero budget | Any tasks, budget = 0 | Empty Set (no task has time ≤ 0) |

This is solid. Let me use these in the plan.

**Contract** (continued):

| # | Case | Setup | Assert |
|---|------|-------|--------|
| 1 | All tasks fit | 3 tasks: 20 + 30 + 40 min, budget = 2h | All 3 IDs in Set |
| 2 | Exact boundary (inclusive) | 2 tasks: 30 + 60 min, budget = 1.5h | Both IDs in Set |
| 3 | Over-budget task skipped; smaller later task still fits | 3 tasks: 50 + 60 + 20 min, budget = 70 min | IDs 1 and 3 in Set, ID 2 absent |
| 4 | Overdue-first ordering | `[overdueTask(40 min), todayTask(40 min)]`, budget = 40 min | Only overdue task's ID in Set |
| 5 | Empty array | `[]`, budget = 2h | Empty Set |
| 6 | Zero budget | Any tasks, budget = 0 | Empty Set |

### Success Criteria

#### Automated Verification

- `npm test` runs and reports 6 passing tests, 0 failing
- `npm run lint` passes with no new errors
- No TypeScript errors in new files

#### Manual Verification

- Run `supabase start` (if not already running), then `npm test` — no env-var-missing errors, no Supabase connection errors in the global setup output
- The test user (`test@example.com`) appears in the Supabase Studio auth users table after the first run (`http://127.0.0.1:54323`)

**Implementation Note**: After this phase, pause for manual verification of the test user creation before proceeding to Phase 3.

---

## Phase 3: Integration Tests

### Overview

Write the three integration test files — one per risk — using the helpers from Phase 2. Each file follows the same shape: `beforeAll` auth + pre-clean, `afterEach` cleanup, named `it()` cases.

### Changes Required

#### 1. `src/test/integration/task-persistence.test.ts` (Risk #2)

**File**: `src/test/integration/task-persistence.test.ts` *(new)*

**Intent**: Prove that a task inserted via an authenticated Supabase client is retrievable in a subsequent query — eliminating the unverified end-to-end persistence assumption.

**Contract**: `beforeAll` signs in and pre-cleans. `afterEach` cleans up. Two `it()` cases:

- *"inserted task is retrievable by id in a subsequent select"*: insert a task (`name`, `target_date`, `priority`, `time_estimate_minutes`, `status`, `user_id`), capture returned `id`, immediately query `.from("tasks").select().eq("id", id).single()`, assert `data` is non-null and `data.name` / `data.priority` / `data.target_date` match the inserted values.

- *"task is absent from a select after it is deleted"*: insert a task, capture `id`, delete it via `.from("tasks").delete().eq("id", id)`, query again, assert `data` is null (Supabase `maybeSingle()` returns null when not found).

#### 2. `src/test/integration/date-filter.test.ts` (Risk #1)

**File**: `src/test/integration/date-filter.test.ts` *(new)*

**Intent**: Prove that the daily view's date filter correctly matches tasks by `target_date` string and does not exhibit UTC contamination at the Supabase query layer.

**Contract**: `beforeAll` signs in, pre-cleans. `afterEach` cleans up. Three `it()` cases:

- *"task with target_date 2026-06-15 appears when filtering for 2026-06-15"*: insert task with `target_date: "2026-06-15"`, query `.from("tasks").select().eq("target_date", "2026-06-15")`, assert array length ≥ 1 and the inserted task's `id` is in the result.

- *"task with target_date 2026-06-15 does not appear when filtering for 2026-06-14"*: same insert, query with `.eq("target_date", "2026-06-14")`, assert no result contains the inserted `id`.

- *"task with target_date in the past appears in an overdue query"*: insert task with `target_date: "2020-01-01"`, query with `.lt("target_date", "2026-06-01").eq("status", "pending")`, assert the task's `id` appears in results. This validates the overdue filter logic (`lt` not `lte`, and only `pending` status).

#### 3. `src/test/integration/ranking.test.ts` (Risk #3)

**File**: `src/test/integration/ranking.test.ts` *(new)*

**Intent**: Prove that the SQL ordering query (priority ASC, time ASC, created_at ASC) produces the correct order at edge cases — equal priority+time tiebreak and the exact budget boundary.

**Contract**: `beforeAll` signs in, pre-cleans, then inserts five fixture tasks in a specific order and captures their IDs. Insert sequentially (not via `Promise.all`) so `created_at` reflects insertion order:

| Alias | priority | time_estimate_minutes | target_date  | Inserted |
|-------|----------|-----------------------|--------------|----------|
| A     | 1        | 30                    | 2026-06-15   | 1st      |
| B     | 1        | 30                    | 2026-06-15   | 2nd      |
| C     | 1        | 60                    | 2026-06-15   | 3rd      |
| D     | 2        | 30                    | 2026-06-15   | 4th      |
| E     | 1        | 5                     | 2026-06-15   | 5th      |

`afterAll` cleans up (use `afterAll` here since fixtures are created once in `beforeAll`).

Three `it()` cases:

- *"tasks are ordered priority ASC, time ASC, created_at ASC"*: query all five with `.order("priority", {ascending:true}).order("time_estimate_minutes", {ascending:true}).order("created_at", {ascending:true})`. Assert the returned `id` array equals `[E.id, A.id, B.id, C.id, D.id]`. (E: P1-5min; A: P1-30min 1st; B: P1-30min 2nd; C: P1-60min; D: P2-30min.)

- *"budget filter includes task at exact cumulative boundary"*: call `applyBudgetFilter([E, A, B, C, D], 1.5)` (budget = 90 min). Assert E (5 min, cum=5), A (30 min, cum=35), B (30 min, cum=65), C (60 min, cum=125 > 90 — excluded), D (30 min, cum=95 > 90 — excluded). So fittingIds = {E.id, A.id, B.id}. Then try with budget = 65/60 = ~1.083h → use budget `(65/60)` and assert B is still included (65 exactly). This tests the inclusive boundary.

  Actually let me be more precise. Use these tasks:
  - Budget = 65 minutes (65/60 hours)
  - E: 5 min (cum=5, included)
  - A: 30 min (cum=35, included)  
  - B: 30 min (cum=65, included — exact boundary)
  - C: 60 min (65+60=125 > 65, excluded)
  - D: 30 min (65+30=95 > 65, excluded)
  - Assert fittingIds has {E.id, A.id, B.id}, not C.id or D.id

- *"overdue tasks consume budget before today's tasks regardless of priority"*: call `applyBudgetFilter([D, A], 0.5)` — D is P2-30min (overdue, appears first), A is P1-30min (today). Budget = 30 min. D fits (cum=30). A: 30+30=60 > 30, excluded. Assert fittingIds = {D.id} only, even though A has higher priority. This proves overdue-first ordering.

Wait, but in the actual app, the overdue and today task arrays are separate and the concatenation happens in DailyView. For the unit test of `applyBudgetFilter`, we just pass the array in the right order (overdue first). The integration test here is using `applyBudgetFilter` as a pure function call with the integration-tested task objects. This is valid.

Actually, I need to think about what the `Task[]` objects look like when we pass them to `applyBudgetFilter` in the integration test. They're the Supabase-returned objects (which have all Task fields). That's fine since `Task` is the type used by the function.

But wait — in the integration test, we're calling `applyBudgetFilter` with the fetched Supabase data. The fetched data is typed as `any` or with a Supabase-generated type. Since `TaskWithTags extends Task` and our function accepts `Task[]`, we'd need the fetched data to conform to `Task`. This should work if we properly type the data.

Actually, for simplicity in the integration tests, I can just pass the relevant subset of the fetched data. Or cast appropriately.

OK, I've thought about this enough. Let me write the plan now with clear enough contracts and let the implementer handle the TypeScript details.

### Success Criteria

#### Automated Verification

- `npm test` runs and reports 9 passing tests total (6 unit + 3 integration suites), 0 failing
- Each integration test completes in < 5 seconds
- `npm run lint` passes
- No TypeScript errors

#### Manual Verification

- Run `supabase start`, then `npm test` — all tests pass in a clean local environment
- Run `npm test` a second time immediately — tests pass again (cleanup is working correctly, no stale state)
- Check Supabase Studio (`http://127.0.0.1:54323`) after the test run — the `tasks` table is empty (cleanup ran)

**Implementation Note**: After all integration tests pass locally, update the test-plan.md Phase 1 status from `implementing` to `complete`.

---

## Testing Strategy

### Unit Tests

`src/lib/daily.test.ts` — 6 cases for `applyBudgetFilter`:
- All fit, exact boundary (inclusive), skip + fit later, overdue-first, empty, zero budget

### Integration Tests

`src/test/integration/task-persistence.test.ts` — Risk #2:
- Insert → select by id → assert present
- Insert → delete → select → assert absent

`src/test/integration/date-filter.test.ts` — Risk #1:
- Task appears for correct date
- Task absent for wrong date
- Past target_date appears in overdue filter (`lt` comparison)

`src/test/integration/ranking.test.ts` — Risk #3:
- Five-task SQL ordering assertion (priority, time, created_at tiebreak)
- Inclusive boundary: task at exact cumulative budget is included
- Overdue-first: lower-priority overdue task beats higher-priority today task

### Manual Testing

1. `supabase start` → `npm test` → all 9+ tests pass
2. Re-run `npm test` without `supabase start` to confirm a clear error (not a silent skip)
3. `npm run build` + `npm run dev` → daily view behavior unchanged from pre-Phase-1

## Migration Notes

Phase 1 modifies the production ORDER BY in `daily.astro`. The change is additive (third sort key) and only affects tie cases. Users with equal-priority, equal-time tasks will now see a deterministic insertion-order ranking instead of undefined PostgreSQL ordering — a user-visible improvement with no data model changes.

## References

- Research: `context/changes/testing-critical-path-coverage/research.md`
- Test plan: `context/foundation/test-plan.md`
- Budget filter source: `src/components/daily/DailyView.tsx:41-51`
- Supabase queries: `src/pages/daily.astro:42-55`
- Existing test pattern: `src/lib/schemas.test.ts`
- Vitest config: `vitest.config.ts:1-7`
- Task schema: `supabase/migrations/20260527000000_task_data_schema.sql:46-56`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Production Code Changes

#### Automated

- [x] 1.1 `npm run build` succeeds — 8e8dff5
- [x] 1.2 `npm run lint` passes — 8e8dff5

#### Manual

- [x] 1.3 Daily view tasks appear in correct order with no visual regression
- [x] 1.4 Budget cutoff still excludes tasks exceeding available hours

### Phase 2: Test Infrastructure + Unit Tests

#### Automated

- [x] 2.1 `npm test` reports 6 passing unit tests, 0 failing
- [x] 2.2 `npm run lint` passes on new files
- [x] 2.3 No TypeScript errors in `src/test/` or `src/lib/daily.ts`

#### Manual

- [x] 2.4 `supabase start` + `npm test` runs without env-var or connection errors
- [x] 2.5 Test user `test@example.com` appears in Supabase Studio auth table

### Phase 3: Integration Tests

#### Automated

- [ ] 3.1 `npm test` reports all integration tests passing (persistence, date-filter, ranking)
- [ ] 3.2 `npm run lint` passes

#### Manual

- [ ] 3.3 Second consecutive `npm test` run passes (cleanup is working)
- [ ] 3.4 `tasks` table is empty in Supabase Studio after the test run
- [ ] 3.5 Update `context/foundation/test-plan.md` Phase 1 status to `complete`
