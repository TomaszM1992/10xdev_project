# Task CRUD with Tags Implementation Plan

## Overview

Build the full S-01 CRUD layer for tasks with tags: Zod validation schemas with unit tests, three JSON API handlers (create, update, delete), three React island components (`TagInput`, `TaskForm`, `TaskList`), and three Astro SSR pages (`/tasks`, `/tasks/new`, `/tasks/[id]/edit`). Every task mutation triggers a Sonner toast. The F-01 foundation (schema, types, auth) is complete and unchanged.

## Current State Analysis

- F-01 fully implemented and reviewed: `tasks`, `task_tags`, `user_settings` tables live with RLS, triggers (5-tag limit, lowercase normalization, `updated_at`), and composite indexes. `src/types.ts` exports `Task`, `TaskTag`, `UserSettings`, `TaskWithTags`.
- `src/lib/supabase.ts:9` — `createClient(headers, cookies)`, nullable, same pattern used in all auth routes.
- `context.locals.user` (type: `User | null`) populated by `src/middleware.ts:13` on every request; task API routes consume it for auth checks.
- `src/components/auth/FormField.tsx`, `SubmitButton.tsx`, `ServerError.tsx` are reusable. `src/components/ui/button.tsx` provides the CVA variant system. `lucide-react` is installed.
- `PROTECTED_ROUTES = ["/dashboard"]` at `src/middleware.ts:4` — must be extended to include `"/tasks"`.
- Zod 4.4.3 installed, no existing usage. Vitest and Sonner not yet installed.

## Desired End State

When this plan is complete:
1. `npm test` passes — all Zod schema unit tests green.
2. `npm run lint` and `npm run build` pass.
3. An authenticated user can visit `/tasks`, see their task list, navigate to `/tasks/new` to create a task (name, date, priority, time estimate, up to 5 tags), see it appear in the list, click edit to modify it, and delete it — with a Sonner toast confirming each action.
4. An unauthenticated user accessing any `/tasks/*` page is redirected to `/auth/signin`. An unauthenticated request to any `/api/tasks/*` endpoint returns 401 JSON.

### Key Discoveries

- `task_tags` has no `user_id` column; RLS uses a correlated subquery to `tasks`. Tag updates require two sequential Supabase calls: DELETE existing rows for `task_id`, then INSERT new ones — `context/changes/task-data-schema/plan.md`.
- The 5-tag limit and lowercase normalization are enforced at the DB layer (triggers), but must also be enforced client-side in `TagInput` for responsive UX.
- `context.locals.user` is guaranteed non-null inside `/tasks/*` page routes (middleware redirect), but API routes must check it explicitly and return 401 JSON — API routes are not in `PROTECTED_ROUTES`.
- Sonner uses module-level state; all React islands on the same page share it. A single `<Toaster client:load />` in `Layout.astro` receives `toast()` calls from any island on the page.
- In Zod v4, use `z.iso.date()` (standalone, not chained from `z.string()`) to validate YYYY-MM-DD format. `z.string().date()` exists but is `@deprecated` in Zod 4.4.3.
- `SubmitButton` (in `src/components/auth/SubmitButton.tsx`) uses `useFormStatus()` from `react-dom`, which only fires for native HTML form submissions. Since task forms use `fetch()`, `TaskForm` must use a standard `<button disabled={submitting}>` instead.
- `FormField`'s `onChange` callback is typed `(value: string) => void`. Numeric form fields (`time_estimate_minutes`) must parse the string to `number` before JSON serialization to match the `z.number()` schema constraint.

## What We're NOT Doing

- No task status changes (complete/dismiss) — these are S-02 scope.
- No task filtering or date-based grouping — S-02 scope.
- No `GET /api/tasks` endpoint — the task list is always server-rendered in Astro; client-side mutations either update local state or navigate away.
- No user settings UI — not in S-01 scope.
- No pagination UI — tasks are silently limited to 50 (`.limit(50)` in the server-side query).
- No toast for list-load errors — if the server fetch fails on `/tasks`, the island receives an empty array and shows the empty state.
- No confirm dialog before delete — one-click delete with immediate toast feedback.
- No Zod validation added to existing auth routes — out of S-01 scope.

## Implementation Approach

Each phase has a clean verification gate before the next starts. Phase 1 lays foundation (vitest, Sonner, Zod schemas + tests). Phase 2 builds the JSON API surface. Phase 3 builds the React islands that consume the API. Phase 4 wires them into Astro SSR pages and navigation.

The form uses `fetch()` + JSON (not HTML form POST + redirect): the React island calls `fetch()`, parses the response, shows a Sonner toast, and either navigates to `/tasks` on success or shows an error toast on failure. This is a deliberate departure from the auth form pattern — CRUD forms need inline feedback without full-page reset on error.

## Critical Implementation Details

**Tag update requires two sequential Supabase calls**: DELETE all `task_tags` rows for the `task_id`, then INSERT new ones. There is no upsert path because the composite PK is `(task_id, tag_name)`. If DELETE succeeds but INSERT fails, the task is left with zero tags — return 500 and let the user retry. Do not attempt rollback.

**Numeric state must be stored as `number`, not `string`, in `TaskForm`**: `priority` is set by button click (always a number literal); `time_estimate_minutes` arrives as a string from `FormField`'s `onChange` and must be parsed (`parseInt(v) || 1`) before storing in state. The JSON body passed to `fetch()` must contain numbers for both fields to satisfy `z.number()` on the server.

**PROTECTED_ROUTES covers page routes only**: Adding `"/tasks"` protects `/tasks`, `/tasks/new`, and `/tasks/[id]/edit`. It does NOT match `/api/tasks` because `/api/tasks` does not start with `/tasks`. API routes perform their own 401 check via `context.locals.user`.

---

## Phase 1: Foundation — Vitest, Sonner, and Zod Schemas

### Overview

Install vitest and Sonner; add the `<Toaster />` mount point to Layout; write the Zod schemas S-01 validates against; write schema unit tests. No UI or server changes in this phase — purely additive infrastructure that later phases depend on.

### Changes Required

#### 1. Install vitest

**File**: `package.json`

**Intent**: Add vitest as a dev dependency and add a `"test"` script so `npm test` runs schema unit tests without any separate config file.

**Contract**: Run `npm install -D vitest`. Add `"test": "vitest run"` to the `scripts` object. Create `vitest.config.ts` at the project root — Vitest does not read `tsconfig.json` path aliases automatically, so without a config file `import { … } from "@/lib/schemas"` will fail to resolve. The config must set `resolve.alias` to map `@` → `./src`:

```typescript
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": resolve(__dirname, "./src") } },
});
```

#### 2. Install Sonner toast

**File**: terminal + `src/components/ui/sonner.tsx` (auto-generated)

**Intent**: Add the Sonner library and its shadcn wrapper component so all task pages can trigger toasts via the global `toast()` function.

**Contract**: Run `npx shadcn@latest add sonner`. This installs the `sonner` npm package and writes `src/components/ui/sonner.tsx` (the shadcn-wrapped `<Toaster />` component with theme wiring).

#### 3. Mount Toaster in Layout

**File**: `src/layouts/Layout.astro`

**Intent**: Mount `<Toaster />` once in the root layout so every page in the app can trigger toasts without adding a per-page mount point.

**Contract**: Import the Toaster component from `@/components/ui/sonner`. Render `<Toaster client:load />` inside the `<body>` element, just before the closing tag. The `client:load` directive is required because Toaster is a React component.

#### 4. Zod validation schemas

**File**: `src/lib/schemas.ts` (new file)

**Intent**: Define the input validation contracts for task create and update. These schemas are imported by both the API route handlers (server-side validation) and the React form components (client-side pre-flight), making the API contract explicit and the same code enforces it in both places.

**Contract**:

```typescript
import { z } from "zod";

export const CreateTaskSchema = z.object({
  name: z.string().min(1).max(255),
  target_date: z.iso.date(), // Zod v4 canonical API for YYYY-MM-DD; z.string().date() is @deprecated
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  time_estimate_minutes: z.number().int().positive(),
  tags: z.array(z.string().min(1).max(50)).max(5).default([]),
});

export const UpdateTaskSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  target_date: z.iso.date().optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  time_estimate_minutes: z.number().int().positive().optional(),
  tags: z.array(z.string().min(1).max(50)).max(5).optional(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
```

#### 5. Zod schema unit tests

**File**: `src/lib/schemas.test.ts` (new file)

**Intent**: Verify that the schemas accept valid inputs and reject invalid ones. Catches regressions if constraints are accidentally loosened during future edits.

**Contract**: Write vitest `describe`/`it` tests (using `expect(...).toBe(true)` on `.success`) covering at minimum: valid create payload passes; missing `name` fails; `priority: 4` fails; `target_date: "not-a-date"` fails; 6-element `tags` array fails; tag with length 51 fails; `UpdateTaskSchema` with only `name` provided passes (partial allowed); `UpdateTaskSchema` with empty object passes (all fields optional).

### Success Criteria

#### Automated Verification

- `npm test` — all schema unit tests pass
- `npm run lint` — no lint errors in new files
- `npm run build` — build succeeds

#### Manual Verification

- Toast smoke test: temporarily add `import { toast } from "sonner"` and a `toast.success("test")` call to any existing page, verify the toast renders in the browser, then remove it.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the toast renders correctly before proceeding to Phase 2.

---

## Phase 2: API Routes

### Overview

Add three JSON API handlers (POST create, PATCH update, DELETE delete) and extend `PROTECTED_ROUTES` to guard task pages. All handlers share the same auth guard pattern: check `context.locals.user` → 401 JSON if null; check Supabase client → 503 JSON if null; then proceed.

### Changes Required

#### 1. Extend PROTECTED_ROUTES

**File**: `src/middleware.ts`

**Intent**: Guard all `/tasks/*` page routes so unauthenticated users are redirected to sign-in, matching the existing `/dashboard` protection.

**Contract**: Change `const PROTECTED_ROUTES = ["/dashboard"]` to `const PROTECTED_ROUTES = ["/dashboard", "/tasks"]`. The existing `pathname.startsWith(route)` check covers `/tasks`, `/tasks/new`, and `/tasks/[id]/edit`. It does not match `/api/tasks`.

#### 2. POST /api/tasks — create task

**File**: `src/pages/api/tasks/index.ts` (new file)

**Intent**: Accept a JSON body, validate with `CreateTaskSchema`, insert the task row, insert tag rows, and return the created task with its tags as a 201 JSON response.

**Contract**: Export `POST: APIRoute`. Auth guard (401/503). Parse `context.request.json()`, run `CreateTaskSchema.safeParse()` — on failure return 400 with `error.flatten()`. Separate `tags` from the remaining task fields. INSERT into `tasks` with `user_id: user.id`; capture `task.id`. If `tags` is non-empty, INSERT rows into `task_tags` (`[{ task_id: task.id, tag_name: tag }]`). Re-query `tasks` with `.select("*, task_tags(*)")` by `id` and return as 201 JSON. Return 500 on any Supabase error.

#### 3. PATCH /api/tasks/[id] — update task

**File**: `src/pages/api/tasks/[id].ts` (new file)

**Intent**: Accept a partial JSON body, validate with `UpdateTaskSchema`, update the task's scalar fields, replace all tags (DELETE + INSERT), and return the updated task with tags.

**Contract**: Export `PATCH: APIRoute`. Auth guard (401/503). Extract `id` from `context.params`. Validate body with `UpdateTaskSchema.safeParse()` — return 400 on failure. Separate `tags` from the scalar fields. If any scalar fields present, UPDATE `tasks` WHERE `id = id` (RLS scopes the update to `auth.uid()`). If `tags` is defined in the body: DELETE all `task_tags` WHERE `task_id = id`, then INSERT new rows. Re-query task with `*, task_tags(*)` — if null (task not found or not owned by caller), return 404. Otherwise return 200 with task + tags. Note: a body containing only `tags` (no scalar fields) does not touch the `tasks` row and therefore does not bump `updated_at` — acceptable for S-01.

#### 4. DELETE /api/tasks/[id] — delete task

**File**: `src/pages/api/tasks/[id].ts` (same file as PATCH, add `DELETE` export)

**Intent**: Delete the task. `ON DELETE CASCADE` on `task_tags` removes associated tags automatically.

**Contract**: Export `DELETE: APIRoute`. Auth guard (401/503). Extract `id` from `context.params`. SELECT the task by `id` first (RLS scopes to caller) — return 404 if null. DELETE the task by `id`. Return 204 No Content.

### Success Criteria

#### Automated Verification

- `npm run lint` — no lint errors
- `npm run build` — no type errors

#### Manual Verification

- `POST /api/tasks` with valid JSON body and authenticated session → 201 with task + tags in body.
- `POST /api/tasks` without a session → 401.
- `POST /api/tasks` with missing `name` → 400 with validation error.
- `PATCH /api/tasks/[id]` with updated `name` → 200 with updated task.
- `PATCH /api/tasks/[id]` with a new `tags` array → 200; response tags match the new array only.
- `DELETE /api/tasks/[id]` → 204; task absent from Supabase Studio.
- `DELETE /api/tasks/[id]` using another user's task id → 404.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that all seven API test cases pass before proceeding to Phase 3.

---

## Phase 3: React Components

### Overview

Three React components: `TagInput` (chip-style tag entry), `TaskForm` (create/edit form via `fetch()` + Sonner toasts), and `TaskList` (server-initialized list with delete and edit navigation). All use existing `FormField`, `Button`, `cn()`, and Lucide icons. No additional shadcn installs beyond Sonner from Phase 1.

### Changes Required

#### 1. TagInput component

**File**: `src/components/tasks/TagInput.tsx` (new file)

**Intent**: Provide a chip-style tag entry control that enforces the 5-tag limit and 1–50 char constraint client-side, mirroring the DB triggers so the user receives instant feedback without a round trip.

**Contract**: Props: `{ tags: string[]; onChange: (tags: string[]) => void; error?: string }`. Render a `FormField` (type="text", `Tag` Lucide icon) alongside an "Add" button. On "Add" click or Enter keypress: trim and lowercase the input value (matching DB normalization trigger); validate: length 1–50, not a duplicate of existing tags, current count < 5 — if all pass, call `onChange([...tags, newTag])` and clear the input; if invalid, show an inline message. Render each existing tag as a chip (`<span>`) with a `×` remove button that calls `onChange(tags.filter(...))`. Display the `error` prop below the input area if provided.

#### 2. TaskForm component

**File**: `src/components/tasks/TaskForm.tsx` (new file)

**Intent**: Render the create-or-edit task form. In create mode (no `task` prop), calls `POST /api/tasks`. In edit mode (`task` prop provided), calls `PATCH /api/tasks/[id]`. Shows field-level validation errors before fetch; shows a Sonner toast for API outcomes.

**Contract**: Props: `{ task?: TaskWithTags }`. Import `Task`, `TaskWithTags` from `@/types`; `CreateTaskSchema`, `UpdateTaskSchema` from `@/lib/schemas`; `toast` from `sonner`.

State: `name: string` (default `""`); `targetDate: string` (YYYY-MM-DD, default `""`); `priority: 1 | 2 | 3` (default `2`); `timeEstimate: number` (default `30`, stored as number); `tags: string[]` (default `[]`); `errors: Partial<Record<string, string>>` (default `{}`); `submitting: boolean` (default `false`).

Initialize state from `task` prop when editing.

Fields:
- `FormField` for `name` — type="text", `PencilLine` icon, error from `errors.name`.
- `FormField` for `targetDate` — type="date", `Calendar` icon, error from `errors.target_date`.
- Priority segmented control — three `Button` components with labels "1", "2", "3"; selected uses `variant="default"`, unselected uses `variant="outline"`; clicking sets `priority` state.
- `FormField` for `timeEstimate` — type="number", `Clock` icon; `value={String(timeEstimate)}`; `onChange={(v) => setTimeEstimate(parseInt(v) || 1)}`.
- `TagInput` for `tags` — pass `tags` state and `onChange={(t) => setTags(t)}`; error from `errors.tags`.

Submit handler: client-side `CreateTaskSchema.safeParse()` (or `UpdateTaskSchema` in edit mode) on `{ name, target_date: targetDate, priority, time_estimate_minutes: timeEstimate, tags }` — on failure, map `error.flatten().fieldErrors` into `errors` state and return. On pass: set `submitting = true`; call `fetch()` with `Content-Type: application/json` to `POST /api/tasks` (create) or `PATCH /api/tasks/${task.id}` (edit). On 2xx: `toast.success("Task created" | "Task updated")`; `window.location.href = "/tasks"`. On error: parse JSON body for `error` message; `toast.error(message ?? "Failed to save task")`; clear `submitting`.

Form element: `<form onSubmit={handleSubmit}>` — no `method`/`action` attributes (fetch handles submission). Submit button: `<button type="submit" disabled={submitting}>` styled with `Button` component's `variant="default"` — do NOT use `SubmitButton` (its `useFormStatus()` does not fire for `fetch()`-based forms).

#### 3. TaskList component

**File**: `src/components/tasks/TaskList.tsx` (new file)

**Intent**: Display the task list passed from the server as initial data. Handle deletes client-side (fetch + local state removal + toast) so the list updates without a page reload.

**Contract**: Props: `{ initialTasks: TaskWithTags[] }`. Import `TaskWithTags` from `@/types`; `toast` from `sonner`. State: `tasks: TaskWithTags[]` initialized from `initialTasks`. Render each task in a card or row showing: `name`, `target_date` (formatted as a human-readable date), `priority` (e.g., "P1"/"P2"/"P3" badge), `time_estimate_minutes` (e.g., "90 min"), and `task_tags` as small chips. Per-task actions: "Edit" — `<a href={/tasks/${task.id}/edit}>` link; "Delete" — button that on click calls `fetch(\`/api/tasks/${task.id}\`, { method: "DELETE" })`; on 2xx: `toast.success("Task deleted")`, filter task from `tasks` state; on error: `toast.error("Failed to delete task")`. When `tasks.length === 0`, render an empty-state message with a link to `/tasks/new`.

### Success Criteria

#### Automated Verification

- `npm run lint` — no lint or type errors in new component files
- `npm run build` — build succeeds

#### Manual Verification

- `TaskForm` renders all fields: name input, date input, priority 1/2/3 buttons, time estimate input, TagInput area.
- Selecting a priority button highlights it and deselects the others.
- `TagInput`: typing a tag and pressing Enter adds a chip; clicking `×` removes it; attempting to add a 6th tag is rejected with an inline message.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the components render and behave correctly before proceeding to Phase 4.

---

## Phase 4: Astro Pages and Navigation

### Overview

Wire the components into three protected Astro SSR pages and add a Tasks link to the Topbar so authenticated users can reach the task section from anywhere in the app.

### Changes Required

#### 1. Task list page

**File**: `src/pages/tasks/index.astro` (new file)

**Intent**: Render the task list. Fetch all tasks server-side (limit 50, ordered by `created_at DESC`), pass as `initialTasks` to the `TaskList` island. If Supabase is unavailable, pass an empty array.

**Contract**: In the Astro frontmatter, call `createClient(Astro.request.headers, Astro.cookies)`. If non-null, query `.from("tasks").select("*, task_tags(*)").order("created_at", { ascending: false }).limit(50)`. Pass `data ?? []` as `initialTasks` to `<TaskList initialTasks={tasks} client:load />`. Include a prominent "New task" link/button pointing to `/tasks/new`. Page title: "My Tasks".

#### 2. New task page

**File**: `src/pages/tasks/new.astro` (new file)

**Intent**: Render the empty create form. No server-side data fetching needed.

**Contract**: `<Layout title="New Task">` wrapping `<TaskForm client:load />`. Include a "← Back to tasks" link above the form pointing to `/tasks`.

#### 3. Edit task page

**File**: `src/pages/tasks/[id]/edit.astro` (new file)

**Intent**: Fetch the requested task from Supabase (RLS scopes the query to the caller's user), pass it to the pre-populated `TaskForm` island. Redirect to `/tasks` if the task is not found or not owned by the caller.

**Contract**: Extract and narrow `id`: `const { id } = Astro.params; if (!id) return Astro.redirect("/tasks")` — Astro types dynamic params as `string | undefined`; without this guard strict TypeScript will reject passing `id` to `.eq()`. Call `createClient`. If null, redirect to `/tasks`. Query `.from("tasks").select("*, task_tags(*)").eq("id", id).single()`. If `data` is null or `error` is non-null, `return Astro.redirect("/tasks")`. Pass `task={data}` to `<TaskForm task={task} client:load />`. Include "← Back to tasks" link.

#### 4. Tasks nav link in Topbar

**File**: `src/components/Topbar.astro`

**Intent**: Give authenticated users a persistent link to `/tasks` from the navigation bar. Without this, there is no way to navigate to the task section from the homepage or dashboard.

**Contract**: In the authenticated user branch (where the "Dashboard" link and sign-out form are rendered), add an `<a href="/tasks">Tasks</a>` link alongside the existing Dashboard link.

### Success Criteria

#### Automated Verification

- `npm run lint` — no lint or type errors
- `npm run build` — build succeeds with all new pages

#### Manual Verification

- Visit `/tasks` while unauthenticated → redirected to `/auth/signin`.
- Sign in → Topbar shows "Tasks" link → click → `/tasks` loads with empty state and "New task" link.
- Create a task with all fields filled and 2 tags → success toast → redirected to `/tasks` → task visible in list.
- Click "Edit" on the task → `/tasks/[id]/edit` loads with all fields pre-populated including tags.
- Update the name and remove one tag → success toast → redirected to `/tasks` → changes visible.
- Click "Delete" → success toast → task disappears from list without page reload.
- Sign out → attempt `/tasks/new` directly → redirected to sign-in.

**Implementation Note**: This is the final phase. After manual verification passes, update `change.md` status to `implemented` and record the final commit SHA in `## Progress`.

---

## Testing Strategy

### Unit Tests

- `CreateTaskSchema.safeParse()` with valid data → success
- `CreateTaskSchema.safeParse()` with missing `name` → failure
- `CreateTaskSchema.safeParse()` with `priority: 4` → failure
- `CreateTaskSchema.safeParse()` with `target_date: "not-a-date"` → failure
- `CreateTaskSchema.safeParse()` with 6-element `tags` array → failure
- `CreateTaskSchema.safeParse()` with tag of length 51 → failure
- `UpdateTaskSchema.safeParse()` with only `name` provided → success
- `UpdateTaskSchema.safeParse()` with empty object → success

### Integration Tests

None in S-01 scope. S-02 will add query-level tests when the daily view ranking logic is introduced.

### Manual Testing Steps

1. Full create-edit-delete happy path (Phase 4 manual verification).
2. Tag edge cases: add 5 tags, attempt to add 6th (rejected client-side with message); submit with 5 tags, verify all 5 appear after reload.
3. Validation edge cases: submit create form with blank `name` → field error shown; try `time_estimate_minutes = 0` → field error.
4. Auth edge cases: unauthenticated `POST /api/tasks` via browser dev tools → 401; authenticated user requesting another user's task id in PATCH URL → 404.

## Performance Considerations

The task list query uses `tasks_user_id_idx ON tasks(user_id)` (F-01) for the RLS-applied `user_id = auth.uid()` filter. `.limit(50)` bounds the result set. No further optimization needed for S-01 scope. The `tasks_user_date_idx ON tasks(user_id, target_date)` index is in place for S-02's date-filtered queries.

## References

- Research: `context/changes/task-crud-and-tags/research.md`
- F-01 plan (schema + type contracts): `context/changes/task-data-schema/plan.md`
- Schema migration: `supabase/migrations/20260527000000_task_data_schema.sql`
- Types: `src/types.ts`
- API route pattern: `src/pages/api/auth/signin.ts`
- Form component pattern: `src/components/auth/SignInForm.tsx`
- FormField props: `src/components/auth/FormField.tsx:8-20`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Foundation — Vitest, Sonner, and Zod Schemas

#### Automated

- [x] 1.1 `npm test` — all schema unit tests pass — eb3c86d
- [x] 1.2 `npm run lint` — no lint errors in new files — eb3c86d
- [x] 1.3 `npm run build` — build succeeds — eb3c86d

#### Manual

- [x] 1.4 Toast smoke test — Toaster renders in browser — eb3c86d

### Phase 2: API Routes

#### Automated

- [x] 2.1 `npm run lint` — no lint errors — ac57b9f
- [x] 2.2 `npm run build` — no type errors — ac57b9f

#### Manual

- [x] 2.3 `POST /api/tasks` with valid body + session → 201 with task + tags — ac57b9f
- [x] 2.4 `POST /api/tasks` without session → 401 — ac57b9f
- [x] 2.5 `POST /api/tasks` with missing `name` → 400 with validation error — ac57b9f
- [x] 2.6 `PATCH /api/tasks/[id]` with updated fields → 200 with updated task — ac57b9f
- [x] 2.7 `PATCH /api/tasks/[id]` with new tags list → 200; tags replaced — ac57b9f
- [x] 2.8 `DELETE /api/tasks/[id]` → 204; task gone — ac57b9f
- [x] 2.9 `DELETE /api/tasks/[id]` for another user's task → 404 — ac57b9f

### Phase 3: React Components

#### Automated

- [x] 3.1 `npm run lint` — no lint or type errors in component files
- [x] 3.2 `npm run build` — build succeeds

#### Manual

- [ ] 3.3 `TaskForm` renders with all fields and priority buttons
- [ ] 3.4 `TagInput` adds chips on Enter; × removes; 6th tag is rejected

### Phase 4: Astro Pages and Navigation

#### Automated

- [ ] 4.1 `npm run lint` — no lint or type errors
- [ ] 4.2 `npm run build` — build succeeds with all new pages

#### Manual

- [ ] 4.3 Unauthenticated `/tasks` → redirected to sign-in
- [ ] 4.4 Full create-edit-delete flow works with toasts
- [ ] 4.5 Delete removes task from list without page reload
- [ ] 4.6 Edit page pre-populates all fields including tags
- [ ] 4.7 Unauthenticated `/tasks/new` → redirected to sign-in
- [ ] 4.8 Topbar shows "Tasks" link for authenticated users
