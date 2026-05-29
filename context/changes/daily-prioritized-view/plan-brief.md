# Daily Prioritized View — Plan Brief

> Full plan: `context/changes/daily-prioritized-view/plan.md`
> Research: `context/changes/daily-prioritized-view/research.md`

## What & Why

Build `/daily?date=YYYY-MM-DD` — the north-star slice (S-02) that answers "what from my list fits in my remaining time today?" Tasks are ranked by priority × time estimate and filtered to the user's declared available hours. Users can complete or dismiss tasks directly from this view. This is the first end-to-end test of the product's core hypothesis: surfacing priority × time fit changes whether users complete tasks rather than dismiss them.

## Starting Point

The F-01 and S-01 work is complete: the `tasks` table has a `status` enum (`pending`/`complete`/`dismissed`) and a `target_date` column; `user_settings` has `available_hours`; a composite index `tasks_user_date_idx ON (user_id, target_date)` is already in place. Three gaps remain: `UpdateTaskSchema` is missing the `status` field, no `/api/settings` endpoint exists, and `/daily` is not in `PROTECTED_ROUTES`.

## Desired End State

`/daily` shows a ranked, budget-filtered task list split into two sections (overdue carried-over tasks above, today's tasks below). The user can complete or dismiss any task with a 5-second undo window. An inline available-hours field re-filters the list immediately and debounced-saves after 500 ms. Prev/next links navigate between dates.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|------------------|--------|
| Overdue task budget | Overdue tasks share the budget pool with today's (ranked first) | Consistent time-budget model; overdue tasks still take priority over today's within the filter | Plan |
| Cumulative filter location | Browser (React island), not Cloudflare Worker | `client:load` islands run in the browser — no CPU constraint; SQL `ORDER BY` handles the expensive sort | Research |
| Available-hours save trigger | Debounced 500 ms PATCH | Fewer API calls than per-keystroke; no extra UI element vs. save button | Plan |
| Complete/dismiss undo | Sonner toast with 5-second timer before PATCH fires | Safety net with no extra UI — Sonner's `action` API supports this natively | Plan |
| First-visit settings | Lazy upsert — GET returns 8h default if no row; PATCH creates on first edit | Avoids an extra write on every new user's first page load | Plan |
| Live re-filter | Island re-runs cumulative filter whenever `availableHours` state changes | Immediate feedback when hours are adjusted; already-sorted props make re-filter O(n) | Plan |
| Task card styling | Tailwind glassmorphism only (no new shadcn components) | Only `Button` is installed; existing pages use raw Tailwind — consistent with S-01 pattern | Research |
| Date navigation | `?date=YYYY-MM-DD` query param; prev/next `<a>` links only | Matches Astro SSR query-param pattern; FR-012 scopes to prev/next only, no date picker | Research / PRD |

## Scope

**In scope:**
- `/daily` SSR Astro page with `?date=` query param
- Two Supabase queries (overdue + today) with SQL `ORDER BY priority, time_estimate_minutes`
- Cumulative budget filter in React island (browser)
- Complete/dismiss with 5-second undo (delayed PATCH)
- Inline available-hours editor with debounced save and live re-filter
- `GET` + `PATCH /api/settings` endpoint with lazy upsert
- `status` field added to `UpdateTaskSchema`
- `/daily` added to `PROTECTED_ROUTES`; "Daily" link in Topbar

**Out of scope:**
- Tag filtering (FR-010, parked)
- Date picker (FR-012: prev/next only)
- Status timestamps (`completed_at` / `dismissed_at`)
- New Supabase migrations
- New shadcn components

## Architecture / Approach

Two parallel Supabase queries per page load (overdue tasks + today's tasks), both SQL-ordered by `priority ASC, time_estimate_minutes ASC`. Results passed as SSR props to a `client:load` React island. The island concatenates `[...overdue, ...today]`, applies a single O(n) cumulative sum pass to filter tasks within the available-hours budget, then splits the result into two display sections. When the user completes or dismisses a task, the island removes it from state immediately and starts a 5-second setTimeout; a Sonner undo toast can clear the timer and restore the task before the PATCH fires.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Backend Extensions | `status` in UpdateTaskSchema, `/api/settings` GET+PATCH, middleware + Topbar | Low — all follow established S-01 patterns |
| 2. Daily View SSR Page | `/daily` page with ranked data, date navigation, static island scaffold | Low-Medium — two-query + cumulative filter logic must produce correct ordering |
| 3. React Island | Complete/dismiss undo, live re-filter, available-hours editor | Medium — undo timer management (`useRef` Map) is the trickiest state interaction |

**Prerequisites:** S-01 merged to main (PR #5)
**Estimated effort:** ~3 sessions across 3 phases

## Open Risks & Assumptions

- Overdue tasks compete for the same budget pool as today's tasks (user-confirmed). If this feels overwhelming with many overdue tasks, a follow-up could cap the overdue section — not MVP scope.
- UTC date as "today" is used throughout. Users in UTC-far-west timezones may see tomorrow's date near midnight — acceptable for MVP; a timezone preference belongs to a future `user_settings` field.
- Sonner's 5-second timer means a page navigation within that window silently loses the PATCH. This is an accepted limitation — the undo UI clearly indicates the window.

## Success Criteria (Summary)

- Tasks appear in the correct priority × time order and disappear when they exceed the available-hours budget
- Completing or dismissing a task removes it immediately; the change persists after page reload; Undo within 5 seconds reverses it
- Changing available hours re-filters the task list before the next page load
