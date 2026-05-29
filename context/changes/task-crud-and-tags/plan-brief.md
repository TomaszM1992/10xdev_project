# Task CRUD with Tags — Plan Brief

> Full plan: `context/changes/task-crud-and-tags/plan.md`
> Research: `context/changes/task-crud-and-tags/research.md`

## What & Why

Build S-01: the task CRUD layer that lets users create, edit, and delete tasks with name, date, priority, time estimate, and up to 5 tags. Without this slice, the north-star S-02 (daily prioritized view) cannot be validated — it needs real tasks in the database.

## Starting Point

F-01 is fully complete and reviewed: `tasks`, `task_tags`, and `user_settings` tables are live with RLS, triggers, and composite indexes. `src/types.ts` exports all needed TypeScript types. The auth flow, React island pattern, and `FormField`/`Button`/`cn()` components are all in place and reusable.

## Desired End State

An authenticated user can navigate to `/tasks`, see their task list, create new tasks with all required fields and up to 5 tag chips, edit existing tasks, and delete them — with a Sonner toast confirming each action. Unauthenticated users hitting any `/tasks` page are redirected to sign-in; unauthenticated API calls receive 401 JSON.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Form submission | `fetch()` + JSON | Enables inline toast feedback and no full-page reset on error | Plan |
| Component strategy | Extend `FormField` (minimal installs) | Fast, consistent with cosmic theme; date/number inputs work via `type=` prop | Plan |
| Tag UX | Chip-style custom `TagInput` | Standard pattern; ~50 lines, no new dependency | Plan |
| Error feedback | Sonner toast for all outcomes | Unified for all operations including delete (no form context needed) | Plan |
| Testing | vitest Zod schema unit tests | Schema constraints are pure logic — zero infrastructure beyond vitest | Plan |
| Tag update strategy | DELETE-all + INSERT-new | Simple and correct; diff adds complexity without benefit at S-01 scope | Research |
| Date input | Native `<input type="date">` via FormField | Avoids Calendar+Popover install; consistent with existing component | Research |
| Priority input | Segmented 1/2/3 Button group | 3 values → buttons outperform a dropdown; no new component needed | Research |

## Scope

**In scope:** `POST /api/tasks`, `PATCH /api/tasks/[id]`, `DELETE /api/tasks/[id]`; Zod schemas + vitest unit tests; `TagInput`, `TaskForm`, `TaskList` React islands; `/tasks`, `/tasks/new`, `/tasks/[id]/edit` Astro pages; `PROTECTED_ROUTES` middleware update; Tasks link in Topbar.

**Out of scope:** Task status changes (complete/dismiss) — S-02; date filtering / daily view — S-02; `GET /api/tasks` endpoint (list is always server-rendered); user settings UI; pagination UI; Zod validation on existing auth routes.

## Architecture / Approach

Astro SSR pages handle server-side data fetching for initial renders (task list, edit pre-population). React islands (`client:load`) handle all interactivity: `fetch()` → parse JSON response → Sonner toast → navigate or update local state. Zod schemas in `src/lib/schemas.ts` are imported by both API routes (server validation) and React components (client pre-flight). A single `<Toaster client:load />` in `Layout.astro` receives `toast()` calls from any island — Sonner's module-level state is shared across all islands on the page.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Foundation | vitest + Sonner + Zod schemas + schema tests | `<Toaster client:load />` in Astro must render correctly; smoke-test toast before Phase 2 |
| 2. API Routes | 3 JSON handlers + PROTECTED_ROUTES update | Tag two-step write (DELETE + INSERT) — partial failure leaves task with zero tags; return 500, let user retry |
| 3. React Components | TagInput, TaskForm, TaskList | `SubmitButton` uses `useFormStatus()` which doesn't fire for `fetch()` — use standard `<button disabled={submitting}>` instead |
| 4. Astro Pages | Full CRUD flow accessible in browser | Edit page must redirect to `/tasks` if task not found (RLS silently returns null for other users' tasks) |

**Prerequisites:** F-01 complete (confirmed), local Supabase running, `.dev.vars` populated, `npm run dev` starts without errors.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- Sonner `toast()` from a React island and `<Toaster client:load />` from the Layout island share the same module state — assumed correct based on Sonner's global store design. Verified in Phase 1 manual smoke test.
- Tag DELETE + INSERT is not atomic — if INSERT fails after DELETE, the task has zero tags. Acceptable for S-01; user can retry the edit.
- `FormField`'s `onChange` is typed `(value: string) => void` — `TaskForm` must parse numeric fields to `number` before JSON serialization to satisfy `z.number()` on the server.

## Success Criteria (Summary)

- `npm test` passes (Zod schema unit tests green)
- `npm run lint` and `npm run build` pass across all 4 phases
- Full create-edit-delete flow works in the browser with Sonner toasts; unauthenticated access is blocked at both page level (redirect) and API level (401 JSON)
