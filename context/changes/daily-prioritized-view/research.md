---
date: 2026-05-29T22:00:00+02:00
researcher: Claude Sonnet 4.6
git_commit: c2f78a01d8a5c20452041895dec3043129fa75ef
branch: feature/daily-prioritized-view
repository: TomaszM1992/10xdev_project
topic: "S-02: Daily prioritized view — codebase research for planning"
tags: [research, codebase, daily-view, tasks, user-settings, ranking, supabase, cloudflare]
status: complete
last_updated: 2026-05-29
last_updated_by: Claude Sonnet 4.6
---

# Research: S-02 Daily Prioritized View

**Date**: 2026-05-29T22:00:00+02:00
**Researcher**: Claude Sonnet 4.6
**Git Commit**: c2f78a01d8a5c20452041895dec3043129fa75ef
**Branch**: feature/daily-prioritized-view
**Repository**: TomaszM1992/10xdev_project

## Research Question

What does the existing codebase provide for implementing S-02 (daily prioritized view with complete/dismiss, date navigation, and available-hours ranking)? What gaps must be filled, and what constraints shape the architecture?

## Summary

The schema, types, and auth infrastructure needed for S-02 are already in place from F-01 and S-01. Three targeted gaps must be closed before building the UI: (1) `status` is missing from `UpdateTaskSchema`, blocking complete/dismiss API calls; (2) no user-settings API endpoint exists for the available-hours editor; (3) `/daily` is not in `PROTECTED_ROUTES`. The dominant architectural constraint is the **Cloudflare Workers 10 ms CPU budget**: `ORDER BY` for the priority × time ranking must live in SQL, never in JavaScript on the server. The cumulative-time filter (which tasks fit within available hours) is too complex for a plain `SELECT` but is trivially O(n) in JS after SQL already returns a sorted list — this split is the recommended implementation strategy.

---

## Detailed Findings

### 1. Database Schema

All three tables required by S-02 are present in `supabase/migrations/20260527000000_task_data_schema.sql`.

#### tasks table (`migrations/…_task_data_schema.sql:46–66`)
```sql
CREATE TABLE tasks (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                  text        NOT NULL CHECK (char_length(name) > 0),
  target_date           date        NOT NULL,
  priority              smallint    NOT NULL CHECK (priority BETWEEN 1 AND 3),
  time_estimate_minutes integer     NOT NULL CHECK (time_estimate_minutes > 0),
  status                task_status NOT NULL DEFAULT 'pending',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

`task_status` enum: `'pending' | 'complete' | 'dismissed'` — all three values S-02 needs exist in the DB already.

Indexes already in place:
- `tasks_user_id_idx ON tasks(user_id)` — general user filtering
- `tasks_user_date_idx ON tasks(user_id, target_date)` — **placed explicitly for S-02 date-filtered queries**

#### user_settings table (`migrations/…_task_data_schema.sql:141–145` + `…_narrow_available_hours.sql`)
```sql
CREATE TABLE user_settings (
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  available_hours numeric(4,1) NOT NULL DEFAULT 8 CHECK (available_hours > 0 AND available_hours <= 24),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);
```

`available_hours` defaults to 8, supports one decimal place (e.g., 8.5 hours). The row may not exist yet for a given user — code must handle the null/missing case and apply the 8-hour default.

#### RLS
All three tables have RLS enabled. `task_tags` has no `user_id` column; its RLS uses a correlated subquery through `tasks`. All S-02 queries automatically inherit user isolation. No manual `WHERE user_id = $uid` is needed in queries.

---

### 2. TypeScript Types

`src/types.ts:1–28` — all types needed are already declared:

```typescript
export type TaskStatus = "pending" | "complete" | "dismissed";

export interface Task {
  id: string;
  user_id: string;
  name: string;
  target_date: string;         // ISO date YYYY-MM-DD
  priority: 1 | 2 | 3;
  time_estimate_minutes: number;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface TaskWithTags extends Task {
  task_tags: { task_id: string; tag_name: string }[];
}

export interface UserSettings {
  user_id: string;
  available_hours: number;
  updated_at: string;
}
```

No new types need to be created for S-02's data layer.

---

### 3. Existing API Routes (S-01)

All routes live in `src/pages/api/tasks/`. Pattern: named uppercase exports (`POST`, `PATCH`, `DELETE`) as `APIRoute`. Auth guard is always manual (not middleware): check `context.locals.user` → 401; check `createClient(...)` null → 503.

| Method | Path | File | Notes |
|--------|------|------|-------|
| POST | `/api/tasks` | `src/pages/api/tasks/index.ts` | Creates task + tags; returns `TaskWithTags` |
| PATCH | `/api/tasks/[id]` | `src/pages/api/tasks/[id].ts` | Updates task scalar fields + tag replacement; returns `TaskWithTags` |
| DELETE | `/api/tasks/[id]` | `src/pages/api/tasks/[id].ts` | Deletes task; returns 204 |
| **GET** | **`/api/tasks`** | **missing** | Deliberately omitted in S-01; the task list is server-rendered |

**Critical gap — no `status` field in `UpdateTaskSchema`** (`src/lib/schemas.ts:11–17`):

```typescript
export const UpdateTaskSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  target_date: z.iso.date().optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  time_estimate_minutes: z.number().int().positive().optional(),
  tags: z.array(z.string().min(1).max(50)).max(5).optional(),
  // status ← MISSING; must be added for complete/dismiss
});
```

Once `status: z.enum(["pending", "complete", "dismissed"]).optional()` is added, the existing `PATCH /api/tasks/[id]` handler will carry it through the `scalarFields` spread to the Supabase UPDATE call without any further changes to the route handler.

---

### 4. React Components (S-01, Reuse Candidates)

| Component | File | Reuse in S-02 |
|-----------|------|---------------|
| `TaskForm` | `src/components/tasks/TaskForm.tsx` | No — create/edit form, not needed in daily view |
| `TaskList` | `src/components/tasks/TaskList.tsx` | No — general list with edit/delete; daily view has different card actions |
| `TagInput` | `src/components/tasks/TagInput.tsx` | No — tag editing, not relevant |

Pattern to inherit: React islands receive `initialData` as props from Astro SSR, call `fetch()` + JSON for mutations, and use `toast.success()` / `toast.error()` from `sonner`.

The `formatDate(iso: string)` helper in `src/components/tasks/TaskList.tsx:12–22` can be extracted to `src/lib/utils.ts` and reused in the daily-view card.

---

### 5. Astro Page Patterns

**Query-param access** (`src/pages/auth/signin.astro:5`):
```typescript
const date = Astro.url.searchParams.get("date") ?? todayISO;
```
This is the established pattern for reading URL parameters in SSR pages. The daily view should use `?date=YYYY-MM-DD` — no path segment routing needed.

**Page structure** (from `src/pages/tasks/index.astro`, `src/pages/tasks/new.astro`):
```astro
---
import Layout from "@/layouts/Layout.astro";
import Topbar from "@/components/Topbar.astro";
// SSR data fetching here
---
<Layout title="...">
  <div class="bg-cosmic min-h-screen p-4">
    <div class="mx-auto max-w-2xl">
      <Topbar />
      <!-- content + React islands with client:load -->
    </div>
  </div>
</Layout>
```

**Protected routes** (`src/middleware.ts:4`):
```typescript
const PROTECTED_ROUTES = ["/dashboard", "/tasks"];
```
`/daily` must be added. Middleware uses `pathname.startsWith()` so `/daily` covers all sub-paths.

---

### 6. Available UI Components

Only **one** shadcn component is installed: `src/components/ui/button.tsx` (`Button` with variants: default, destructive, outline, secondary, ghost, link).

No Card, Badge, Select, Input, Label, Separator, or Skeleton exist. The existing pages use raw Tailwind classes (glassmorphism: `border-white/10 bg-white/5 backdrop-blur`) rather than shadcn Card.

**Recommendation**: Follow the existing Tailwind-only pattern for task cards rather than installing new shadcn components. Install `Badge` (`npx shadcn@latest add badge`) only if priority labels need standardized chip styling that Button can't provide — otherwise `<span>` with Tailwind suffices.

Icons: `lucide-react` is installed and used throughout (`Pencil`, `Trash2`, `Calendar`, `Clock`, `CircleAlert`). Use `CheckCircle2` and `XCircle` for complete/dismiss actions.

---

### 7. Date Handling

No date library (`dayjs`, `date-fns`, `luxon`, `temporal`) is installed anywhere in the project. S-02 must use:

- **Display**: `new Date(task.target_date).toLocaleDateString("en-US", {...})` — same as `formatDate()` in `TaskList.tsx:12–22`
- **Navigation**: Native `Date` arithmetic for ±1 day:
  ```typescript
  function offsetDate(iso: string, days: number): string {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  ```
- **Today's date** (SSR-safe, timezone-aware): `new Date().toISOString().slice(0, 10)` gives UTC date — fine for this use case.
- **Validation**: `z.iso.date()` (Zod v4 API) — already established in `src/lib/schemas.ts`.

---

### 8. Infrastructure Constraints

#### Cloudflare Workers 10 ms CPU limit
Documented in `context/foundation/infrastructure.md` (Risk Register) and `context/foundation/roadmap.md:87`.

> "The 10ms CPU time limit (free tier) is per-request. The daily view's sort + filter over 200 tasks can exceed this, producing a Cloudflare 1101 error. Mitigation: move heavy computation server-side to Supabase query (ORDER BY in SQL) rather than JS."

**Architectural mandate**: `ORDER BY priority ASC, time_estimate_minutes ASC` must be in the Supabase query, not a JavaScript `.sort()` call. I/O (Supabase round-trip) does not count against the CPU budget; computation does.

#### Cumulative time filter
The "tasks whose cumulative time fits within available_hours" rule is not expressible as a simple SQL `WHERE` — it requires a running sum. Options:

| Option | Mechanism | Tradeoff |
|--------|-----------|----------|
| **SQL window function via RPC** | PostgreSQL `SUM() OVER (ORDER BY ...)` in a DB function | Correct and all server-side, but requires a new Supabase migration for the function |
| **JS filter on sorted results** | Fetch SQL-ordered tasks, iterate once in Astro SSR frontmatter | O(n) on an already-sorted array — microseconds; runs in Worker CPU budget (safe for ≤200 tasks) |

**Recommendation**: Use the JS filter in Astro SSR. SQL handles `ORDER BY` (no CPU cost from Worker perspective). The cumulative JS filter is a single O(n) pass — negligible CPU time vs. the 10ms budget. No additional migration needed.

```typescript
// In Astro SSR frontmatter — runs in Worker but is trivially fast
const availMinutes = (settings?.available_hours ?? 8) * 60;
let cum = 0;
const fittingTasks = todayTasks.filter(t => {
  cum += t.time_estimate_minutes;
  return cum <= availMinutes;
});
```

#### Supabase client
`src/lib/supabase.ts` — `createClient(headers, cookies)` returns `null` if env vars are absent. All API routes and pages must null-check before use (established S-01 pattern).

---

## Code References

- `supabase/migrations/20260527000000_task_data_schema.sql:46–66` — tasks table
- `supabase/migrations/20260527000000_task_data_schema.sql:141–145` — user_settings table
- `supabase/migrations/20260527000002_narrow_available_hours.sql` — constrains to numeric(4,1)
- `src/types.ts:1–28` — TaskStatus, Task, TaskWithTags, UserSettings types
- `src/lib/schemas.ts:11–17` — UpdateTaskSchema (missing status field)
- `src/pages/api/tasks/index.ts` — POST handler pattern
- `src/pages/api/tasks/[id].ts` — PATCH/DELETE handler pattern
- `src/middleware.ts:4` — PROTECTED_ROUTES array
- `src/components/tasks/TaskList.tsx:12–22` — formatDate() helper
- `src/lib/supabase.ts` — createClient factory

---

## Architecture Insights

### What S-02 Inherits from S-01

| Decision | Location |
|----------|----------|
| JSON API route shape: named uppercase exports, auth guard, 401/503 | `src/pages/api/tasks/` |
| `createClient(headers, cookies)` with null-check | `src/lib/supabase.ts` |
| `context.locals.user` for auth in pages; manual check in API routes | `src/middleware.ts` |
| React islands: `client:load`, `fetch()` + JSON, `sonner` toasts | `src/components/tasks/TaskList.tsx` |
| Zod schemas in `src/lib/schemas.ts`, types in `src/types.ts` | established convention |
| `tasks_user_date_idx` composite index — already placed for this feature | `migrations/…_task_data_schema.sql` |

### What S-02 Introduces

| Need | Decision |
|------|----------|
| Daily route | `src/pages/daily.astro` with `?date=YYYY-MM-DD` query param |
| Status mutations | Extend `UpdateTaskSchema` with `status` field; no route changes needed |
| User settings read | SSR in Astro page frontmatter (single Supabase call) |
| User settings write | New `src/pages/api/settings.ts` with `GET` + `PATCH` exports |
| Complete/dismiss UI | New `src/components/daily/DailyView.tsx` React island |
| Task card with actions | New `src/components/daily/TaskCard.tsx` |
| Available-hours editor | New `src/components/daily/AvailableHoursInput.tsx` |
| Protected route | Add `/daily` to `PROTECTED_ROUTES` in `src/middleware.ts` |
| Topbar navigation | Add "Daily" link to `src/components/Topbar.astro` |

---

## Historical Context (from prior changes)

- `context/changes/task-crud-and-tags/plan.md:34–43` — S-01 explicitly deferred: task status changes, date filtering, user-settings UI, GET /api/tasks — all handed to S-02.
- `context/changes/task-crud-and-tags/plan.md:36` — "No task status changes (complete/dismiss) — these are S-02 scope. The task_status enum exists in the DB; S-02 only needs to add an API endpoint and UI."
- `context/foundation/roadmap.md:87` — CPU constraint and SQL-side sorting mandate documented as a known risk before S-02 started.
- `context/foundation/infrastructure.md:65,113` — 10 ms CPU risk register entry; mitigation documented as SQL ORDER BY.

---

## Open Questions

1. **user_settings upsert on first visit**: Should `daily.astro` auto-upsert a default user_settings row (available_hours=8) when none exists, or should the settings API handle creation lazily on first write? Lazy creation on first PATCH is simpler and avoids an extra write on every new user's first page load.

2. **Overdue task time budget**: PRD says overdue tasks "appear at the top, visually distinct" with no mention of the time budget filter. Interpretation: overdue tasks are always shown regardless of available hours — only today's tasks are filtered by the budget. Needs explicit confirmation before planning.

3. **Dismissed/completed in daily view**: PRD says "completing or dismissing a task removes it from the active list immediately." This is optimistic UI — client removes the task on success. The task's `status` is now `complete`/`dismissed` in the DB so it won't appear in the next page load either (query filters `status = 'pending'` or `status != 'complete'` only).

4. **Available-hours update trigger**: Should the available-hours field call PATCH on blur (after editing), on change (debounced), or on an explicit save button? The PRD says users can "adjust" hours directly on the view — blur or debounced change avoids an extra button while minimizing excessive API calls. Blur is simpler to implement.

5. **Navigation: "today" shortcut**: When the user is on a past date, should prev/next links alone be sufficient, or should there be a "Today" button to jump back? PRD says "prev/next only" (FR-012) — no shortcut needed for MVP.
