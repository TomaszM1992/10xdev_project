# Daily Prioritized View Implementation Plan

## Overview

Build `/daily?date=YYYY-MM-DD` — a daily task view that ranks all pending tasks (overdue + today's) by priority and time estimate, filters them to the user's available-hours budget, and lets the user complete or dismiss tasks with a 5-second undo window.

## Current State Analysis

The schema and types for this feature are already in place from F-01 and S-01. Three targeted API gaps must be closed before building the UI.

**What exists (no changes needed):**
- `tasks.status` enum (`pending` / `complete` / `dismissed`) — `supabase/migrations/20260527000000_task_data_schema.sql:46–66`
- `user_settings.available_hours` (`numeric(4,1)`, default 8) — same migration, lines 141–145
- Composite index `tasks_user_date_idx ON (user_id, target_date)` — placed specifically for S-02 date-filtered queries
- `TaskStatus`, `Task`, `TaskWithTags`, `UserSettings` types — `src/types.ts:1–28`
- `PATCH /api/tasks/[id]` handler already spreads all validated scalar fields into Supabase UPDATE — once `status` is added to `UpdateTaskSchema`, no handler changes are needed
- Astro `?date=` query-param pattern — `src/pages/auth/signin.astro:5`

**Gaps (addressed in Phase 1):**
- `UpdateTaskSchema` missing `status` field — `src/lib/schemas.ts:11–17`
- No `/api/settings` endpoint
- `/daily` not in `PROTECTED_ROUTES` — `src/middleware.ts:4`
- No "Daily" link in Topbar — `src/components/Topbar.astro`

## Desired End State

`/daily?date=YYYY-MM-DD` renders an SSR page with all pending tasks (overdue first, then today's) ordered by priority then time estimate, filtered to the user's declared available hours. The user can complete or dismiss any task — each removal is optimistic with a 5-second Sonner undo window. Changing the available-hours input immediately re-filters the visible task list and debounced-saves to the server after 500 ms. Prev/next navigation links move between dates.

### Key Discoveries

- `tasks_user_date_idx ON (user_id, target_date)` already covers the primary date-filter query — no new migration needed
- `PATCH /api/tasks/[id]` spreads all validated fields to Supabase UPDATE — adding `status` to `UpdateTaskSchema` is sufficient; the handler needs no code changes
- Only the `Button` shadcn component is installed — task cards use Tailwind glassmorphism (`border-white/10 bg-white/5`) to match `src/components/tasks/TaskList.tsx`
- No date library is available — use native `Date` arithmetic for ±1 day navigation; the `iso + "T00:00:00"` pattern avoids UTC-offset-day boundary issues
- The cumulative budget filter runs in the React island (browser JS), not in the Cloudflare Worker — no CPU constraint applies to the filter step

## What We're NOT Doing

- No tag filtering on the daily view (FR-010 is parked)
- No date picker — prev/next links only (FR-012 scope)
- No pagination — the budget filter naturally bounds the visible list
- No status timestamps (`completed_at` / `dismissed_at`) — columns do not exist and are not added
- No new Supabase migration — all S-02 changes are application-layer only
- No new shadcn components — Tailwind-only styling for task cards

## Implementation Approach

Three sequentially dependent phases with a clear testing gate after each:

1. **Backend Extensions** — unblock status mutations and settings management; fully verifiable with `curl` before any UI exists.
2. **SSR Daily Page** — static server-rendered view with correct data and navigation; verifiable visually before adding interactivity.
3. **React Island** — complete/dismiss with undo, available-hours editor with live re-filter.

The SQL side handles `ORDER BY priority ASC, time_estimate_minutes ASC`. The cumulative budget filter runs in the React island (browser), so there is no Cloudflare CPU concern.

## Critical Implementation Details

**Ranking and budget filter**: Fetch two separate Supabase queries in parallel (`Promise.all`) in the SSR page — one for overdue tasks, one for today's tasks, both with `ORDER BY priority ASC, time_estimate_minutes ASC`. Pass both sorted lists as props to the React island. In the island, concatenate `[...overdueTasks, ...todayTasks]` (overdue first), iterate once applying a cumulative sum against `availableHours * 60`, then split the fitting subset back by `task.target_date < date` for two display sections. Never sort in JS — the SQL-ordered props are the source of truth for order. Rerun this derivation whenever `availableHours` state changes.

**Undo pattern**: When the user clicks complete/dismiss, remove the task from state immediately, start a 5-second `setTimeout` to fire `PATCH /api/tasks/{id}`, and show a Sonner toast with an `action` callback. If Undo is clicked, `clearTimeout` and restore the task to state. Track pending timeouts in `useRef<Map<string, ReturnType<typeof setTimeout>>>` to avoid re-renders. On PATCH error (after the 5s delay), restore the task and show `toast.error`.

---

## Phase 1: Backend Extensions

### Overview

Add `status` to `UpdateTaskSchema`, create the settings API endpoint, protect `/daily`, and add the Topbar nav link. All changes are verifiable via `curl` before any UI is built.

### Changes Required

#### 1. UpdateTaskSchema and UpdateSettingsSchema

**File**: `src/lib/schemas.ts`

**Intent**: Allow the existing `PATCH /api/tasks/[id]` to accept and persist `status` changes. Add a settings schema for the new settings endpoint. These are the only schema changes — no handler modifications are needed.

**Contract**: Add `status: z.enum(["pending", "complete", "dismissed"]).optional()` to `UpdateTaskSchema`. Add a new export `UpdateSettingsSchema = z.object({ available_hours: z.number().positive().max(24) })`.

#### 2. Settings API endpoint

**File**: `src/pages/api/settings.ts` (new)

**Intent**: Provide `GET` (read available hours, returning 8 as default for new users) and `PATCH` (upsert available hours). Follows the same `APIRoute` pattern as `src/pages/api/tasks/index.ts`.

**Contract**:
- `export const prerender = false`
- Both methods: check `context.locals.user` → 401 if null; check `createClient(...)` → 503 if null
- `GET` — `.from("user_settings").select("available_hours").eq("user_id", user.id).maybeSingle()`; if `data` is null return `{ available_hours: 8 }` with 200; if `error` is non-null return 500
- `PATCH` — validate body with `UpdateSettingsSchema`; call `.from("user_settings").upsert({ user_id: user.id, available_hours: validated.available_hours })`; return 204 No Content (client never reads the body)

#### 3. PROTECTED_ROUTES — add /daily

**File**: `src/middleware.ts`

**Intent**: Redirect unauthenticated users away from the daily view, consistent with all other protected pages.

**Contract**: Add `"/daily"` to the `PROTECTED_ROUTES` array at `src/middleware.ts:4`. Middleware uses `pathname.startsWith()`, so this covers all sub-paths under `/daily`.

#### 4. Topbar — Daily navigation link

**File**: `src/components/Topbar.astro`

**Intent**: Surface the daily view in the primary navigation so authenticated users can reach it from any page.

**Contract**: Add a "Daily" link (`href="/daily"`) in the authenticated-user navigation block alongside the existing "Tasks" link. Style to match existing nav links.

### Success Criteria

#### Automated Verification

- `npm test` — 11 existing tests pass; add unit tests for `UpdateTaskSchema` (valid/invalid `status` values) and `UpdateSettingsSchema` (boundary: `0` → reject, `24` → accept, `24.1` → reject)
- `npm run lint` — clean
- `npm run build` — clean

#### Manual Verification

- `PATCH /api/tasks/{valid-id}` with body `{ "status": "complete" }` returns the updated task with `status: "complete"`
- `GET /api/settings` returns `{ "available_hours": 8 }` for a user with no settings row
- `PATCH /api/settings` with `{ "available_hours": 6 }` persists; subsequent `GET` returns `6`
- Visiting `/daily` without being signed in redirects to `/auth/signin`
- Topbar shows "Daily" link for authenticated users

**Implementation Note**: After all automated checks pass, pause for manual verification before proceeding to Phase 2.

---

## Phase 2: Daily View SSR Page

### Overview

Create the Astro page at `/daily` that fetches ranked task data server-side, computes date navigation, and renders a static initial view. The React island is wired up with full data props; no interactivity is needed to verify this phase.

### Changes Required

#### 1. Daily view Astro page

**File**: `src/pages/daily.astro` (new)

**Intent**: Server-render the daily view with correctly ranked and filtered task data, date navigation links, and the initial scaffold for the React island. No client-side logic lives in this file.

**Contract**:
- Read `Astro.url.searchParams.get("date")`; validate it as an ISO date string. If null or invalid, default to UTC today: `new Date().toISOString().slice(0, 10)`.
- Compute `prevDate` / `nextDate` using `new Date(iso + "T00:00:00")` + `setDate(d.getDate() ± 1)` + `.toISOString().slice(0, 10)`.
- Fetch in parallel via `Promise.all`:
  1. `user_settings` with `.maybeSingle()` — treat null as `{ available_hours: 8 }`
  2. Overdue tasks: `status = 'pending' AND target_date < date`, `ORDER BY priority ASC, time_estimate_minutes ASC`, `select("*, task_tags(*)")`
  3. Today's tasks: `status = 'pending' AND target_date = date`, same order and select
- If Supabase client is null, render `<Banner variant="error">` and pass empty arrays + 8h default to island.
- Pass to island: `initialOverdueTasks`, `initialTodayTasks`, `initialAvailableHours` (number), `date` (string).
- Prev/next navigation renders as server-side `<a>` links outside the island (no JS required).
- Layout: `<Layout title="Daily Tasks">` → `bg-cosmic min-h-screen p-4` → `mx-auto max-w-2xl` → `<Topbar />` → date header + nav links → `<DailyView ... client:load />`.

#### 2. DailyView React island — initial scaffold

**File**: `src/components/daily/DailyView.tsx` (new)

**Intent**: Accept task props, run the cumulative budget filter, and render two static sections (overdue and today). Action buttons are present but unhandled — this phase proves data flow; Phase 3 adds the interaction logic.

**Contract**: Props type: `{ initialOverdueTasks: TaskWithTags[], initialTodayTasks: TaskWithTags[], initialAvailableHours: number, date: string }`. Initialize `overdueTasks` and `todayTasks` state from props. Derive fitting sets: concatenate `[...overdueTasks, ...todayTasks]`, iterate with a running `cum` sum against `availableHours * 60`, collect the fitting task IDs, then filter each array. Render an "Overdue" section (if fitting overdue tasks exist) and a "Today" section. Each task is a placeholder card (name, priority, time estimate, tag pills, two disabled buttons). `availableHours` state is initialized from `initialAvailableHours`.

### Success Criteria

#### Automated Verification

- `npm run lint` — clean
- `npm run build` — clean (Astro type-checks island props at build time)

#### Manual Verification

- `/daily` loads and shows today's pending tasks in the correct order (P1 first; shorter tasks first within equal priority)
- Tasks beyond the available-hours budget are not shown
- Overdue tasks (past dates, status=pending) appear above today's tasks with a visually distinct treatment (e.g., amber border or label)
- `/daily?date=YYYY-MM-DD` shows tasks for that specific date
- Prev/next links navigate to adjacent dates
- Empty state renders gracefully when no tasks exist for the selected date
- No console errors

**Implementation Note**: After all automated checks pass, pause for manual verification before proceeding to Phase 3.

---

## Phase 3: React Island — Actions and Settings Editor

### Overview

Wire up complete/dismiss with optimistic UI and Sonner undo, add the available-hours editor with debounced save and live re-filter, and replace the Phase 2 placeholder cards with the final `TaskCard` component.

### Changes Required

#### 1. DailyView — complete/dismiss state and undo

**File**: `src/components/daily/DailyView.tsx`

**Intent**: Handle status-change actions from child cards — remove the task from state immediately, delay the PATCH 5 seconds, show a Sonner undo toast, and restore the task if Undo is clicked before the timer fires.

**Contract**: Add `pendingTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())`. Implement `handleStatusChange(task, status)`: capture original position before removal — `const isOverdue = overdueTasks.some(t => t.id === task.id); const list = isOverdue ? overdueTasks : todayTasks; const idx = list.findIndex(t => t.id === task.id)`; remove task from the relevant state; store `setTimeout(() => firePatch(task.id, status), 5000)` in the map keyed by `task.id`; show `toast.success(label, { duration: 5000, action: { label: "Undo", onClick: () => { clearTimeout(pending); restore task by splicing back at original index: isOverdue ? setOverdueTasks(prev => [...prev.slice(0, idx), task, ...prev.slice(idx)]) : setTodayTasks(prev => [...prev.slice(0, idx), task, ...prev.slice(idx)]) } } })`. `firePatch` calls `PATCH /api/tasks/{id}` with `{ status }`; on error, splice-restore task at its original index + `toast.error("Failed — task restored")`.

#### 2. TaskCard component

**File**: `src/components/daily/TaskCard.tsx` (new)

**Intent**: Render a single task card with Complete and Dismiss buttons. Calls the parent callback on click — no direct API calls or state in this component.

**Contract**: Props: `task: TaskWithTags`, `isOverdue?: boolean`, `onStatusChange: (task: TaskWithTags, status: "complete" | "dismissed") => void`. Renders: priority badge (P1/P2/P3, color-coded to match `src/components/tasks/TaskList.tsx:59–68`), task name, time estimate in minutes, tag pills, amber "Overdue" label if `isOverdue`, `CircleCheck` complete button and `CircleX` dismiss button (both from lucide-react). Card styling: `border border-white/10 bg-white/5 rounded-xl p-4` (glassmorphism, matching existing task cards).

#### 3. AvailableHoursInput component

**File**: `src/components/daily/AvailableHoursInput.tsx` (new)

**Intent**: Render a controlled number input for available hours. Purely a presentation component — all state and debounce logic lives in DailyView.

**Contract**: Props: `value: number`, `onChange: (hours: number) => void`. Renders `<input type="number" min="0.5" max="24" step="0.5">` with a descriptive label. Calls `onChange(parseFloat(e.target.value))` on every `input` event (no debounce here).

#### 4. DailyView — available-hours editor and debounced PATCH

**File**: `src/components/daily/DailyView.tsx`

**Intent**: Wire the AvailableHoursInput to `availableHours` state so changing hours immediately re-filters the task list, and fire a debounced PATCH to `/api/settings` 500 ms after the last change.

**Contract**: Add `useEffect` watching `availableHours`: clear any pending debounce timer and start a new one for 500 ms; on expiry call `PATCH /api/settings` with `{ available_hours: availableHours }`; on error call `toast.error`. Track the debounce timer in a separate `useRef<ReturnType<typeof setTimeout> | null>`. The cumulative filter derivation already re-runs on every render triggered by `availableHours` state change — no additional wiring needed. Render `<AvailableHoursInput value={availableHours} onChange={setAvailableHours} />` in the island header area.

### Success Criteria

#### Automated Verification

- `npm run lint` — clean
- `npm run build` — clean

#### Manual Verification

- Clicking "Complete" removes task immediately; Sonner toast appears with "Undo" button
- Clicking "Dismiss" works identically
- Clicking Undo within 5 seconds restores the task; no PATCH is fired
- Waiting 5+ seconds: task stays removed; reload `/tasks` and confirm `status: "complete"` or `"dismissed"`
- Changing available hours from 8 to 2 immediately removes tasks that no longer fit; changing back to 8 restores them
- After changing hours and waiting 1 second, reloading `/daily` shows the new hours value
- Completed/dismissed tasks do not reappear on next page load for their target date
- No console errors under all scenarios above

**Implementation Note**: After all automated checks pass, pause for full end-to-end manual verification: create a task in `/tasks`, open `/daily`, complete it, confirm it no longer appears, verify status via the `/tasks` edit page.

---

## Testing Strategy

### Unit Tests

- `UpdateTaskSchema` with `status`: valid values (`"pending"`, `"complete"`, `"dismissed"`), invalid value (e.g., `"done"`), omitted (valid — all fields optional)
- `UpdateSettingsSchema`: valid `{ available_hours: 6.5 }`, boundary cases (`0` → reject, `24` → accept, `24.1` → reject, `-1` → reject)

### Integration Tests (manual — see Manual Verification sections per phase)

### Manual Testing Steps

1. Sign in, create tasks for today with different priorities and time estimates
2. Open `/daily` — verify priority × time ordering (P1 first; shorter within equal priority)
3. Add a task for yesterday — verify overdue treatment and position (above today's tasks)
4. Set available hours to 1 hour — verify only the first task(s) are shown
5. Complete a task — verify immediate removal and Sonner undo toast
6. Click Undo — verify task is restored
7. Complete a task and wait 5+ seconds — verify PATCH fired; check status on `/tasks`
8. Edit available hours to 8 — verify task list re-filters; reload and verify persistence

## Performance Considerations

Two parallel Supabase queries via `Promise.all` minimise SSR latency. `tasks_user_date_idx ON (user_id, target_date)` covers both queries. The cumulative O(n) filter and re-filter run in the browser — no Cloudflare CPU concern for ≤200 tasks.

## References

- Research doc: `context/changes/daily-prioritized-view/research.md`
- PRD (FR-007, FR-008, FR-011, FR-012, US-01): `context/foundation/prd.md`
- Roadmap (S-02): `context/foundation/roadmap.md`
- Established API route pattern: `src/pages/api/tasks/index.ts`
- Established component pattern: `src/components/tasks/TaskList.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend Extensions

#### Automated

- [x] 1.1 npm test — existing + new schema unit tests pass
- [x] 1.2 npm run lint — clean
- [x] 1.3 npm run build — clean

#### Manual

- [x] 1.4 PATCH /api/tasks/{id} with status complete returns updated task
- [x] 1.5 GET /api/settings returns available_hours 8 for new user
- [x] 1.6 PATCH /api/settings persists; subsequent GET returns updated value
- [x] 1.7 /daily without auth redirects to /auth/signin
- [x] 1.8 Topbar shows Daily link for authenticated users

### Phase 2: Daily View SSR Page

#### Automated

- [ ] 2.1 npm run lint — clean
- [ ] 2.2 npm run build — clean

#### Manual

- [ ] 2.3 /daily shows today's tasks in correct priority x time order
- [ ] 2.4 Tasks beyond available-hours budget are not shown
- [ ] 2.5 Overdue tasks appear above today's tasks with distinct visual treatment
- [ ] 2.6 /daily?date=YYYY-MM-DD shows tasks for that date
- [ ] 2.7 Prev/next links navigate to adjacent dates
- [ ] 2.8 Empty state renders when no tasks exist for the selected date

### Phase 3: React Island — Actions and Settings Editor

#### Automated

- [ ] 3.1 npm run lint — clean
- [ ] 3.2 npm run build — clean

#### Manual

- [ ] 3.3 Complete/dismiss removes task immediately with Sonner undo toast
- [ ] 3.4 Undo within 5 seconds restores the task; no PATCH is fired
- [ ] 3.5 After 5 seconds task remains removed; status persists after reload
- [ ] 3.6 Changing available hours re-filters task list immediately
- [ ] 3.7 Changed hours persist after page reload
- [ ] 3.8 Completed/dismissed tasks do not reappear on next page load
