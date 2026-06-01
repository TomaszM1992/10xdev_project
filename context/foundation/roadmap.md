---
project: Todoer
version: 1
status: draft
created: 2026-05-25
updated: 2026-06-01
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: todoer

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Existing to-do apps show priority but ignore time — they cannot answer "what from my list fits in my remaining 90 minutes?" The result is that users manually dismiss tasks rather than completing them. This product closes that gap: a personal daily view that ranks tasks by priority × time fit within the user's declared available hours, turning a backlog browser into a daily action engine.

## North star

**S-02: user can view tasks ranked by priority × time, complete or dismiss them, and navigate adjacent dates.**

This is the north star — the smallest end-to-end slice whose delivery proves the product's central, unproven claim. That claim: surfacing priority × time fit for a given day changes whether users complete tasks rather than dismiss them. Everything else (task CRUD, tags, auth) only matters if this ordering mechanic works. The primary Success Criterion (60% completion rate in first two weeks) is only measurable once this slice is live.

## At a glance

| ID   | Change ID              | Outcome (user can …)                                                                                        | Prerequisites | PRD refs                                      | Status   |
|------|------------------------|-------------------------------------------------------------------------------------------------------------|---------------|-----------------------------------------------|----------|
| F-01 | task-data-schema       | (foundation) tasks, task_tags, and user_settings tables with RLS live; Supabase connected; auth verified    | —             | FR-001, FR-002, FR-003, FR-004, FR-009, US-01 | done     |
| S-01 | task-crud-and-tags     | create, edit, and delete tasks with name, date, priority (1–3), time estimate, and up to 5 tags             | F-01          | FR-004, FR-005, FR-006, FR-009                | proposed |
| S-02 | daily-prioritized-view | see today's tasks ranked by priority × time fit, complete or dismiss them, navigate to adjacent dates       | S-01          | US-01, FR-007, FR-008, FR-011, FR-012         | proposed |

## Baseline

What's already in place in the codebase as of 2026-05-25 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 + shadcn/ui + Tailwind 4; file-based routing in `src/pages/`; UI components in `src/components/ui/`
- **Backend / API:** partial — 3 auth endpoints (`/api/auth/signin`, `/api/auth/signup`, `/api/auth/signout`); no task CRUD routes yet; Zod in `package.json` but unused
- **Data:** partial — Supabase client wired in `src/lib/supabase.ts`; `supabase/config.toml` exists but `schema_paths = []` (no migrations yet)
- **Auth:** present — Supabase `@supabase/ssr`; session cookies managed; middleware protects `/dashboard` (`src/middleware.ts`); auth pages in `src/pages/auth/`
- **Deploy / infra:** present — Cloudflare Workers (`wrangler.jsonc`); GitHub Actions CI runs lint + build on push/PR to main (no deploy step yet)
- **Observability:** absent — no logging library, no error tracking, no metrics

## Foundations

### F-01: Task, tags, and user-settings data schema

- **Outcome:** (foundation) `tasks`, `task_tags`, and `user_settings` tables created via Supabase migration with RLS enabled; Supabase project connected to local dev; auth sign-up/login/logout verified end-to-end.
- **Change ID:** `task-data-schema`
- **PRD refs:** FR-001 (register), FR-002 (login), FR-003 (logout), FR-004 (task fields: name, date, priority, time_estimate), FR-009 (tags), US-01 AC (available hours → user_settings table)
- **Unlocks:** S-01 (task CRUD requires `tasks` + `task_tags` tables), S-02 (daily view requires `tasks` + `user_settings` for sort + available-hours filter)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** Local Supabase requires Docker (`npx supabase start`); if Docker is unavailable, use a Supabase cloud project directly — Owner: user. Block: no (cloud fallback available).
- **Risk:** Every slice in this roadmap depends on this foundation. Supabase migrations must enable RLS on every table and write separate policies per role per operation (per CLAUDE.md convention) — skipping RLS would violate the user-isolation NFR ("no authenticated user can read, write, or modify another user's tasks").
- **Status:** done

## Slices

### S-01: Task CRUD with tags

- **Outcome:** user can create, edit, and delete tasks with name, target date, priority (1–3), time estimate, and up to 5 tags; tasks survive between sessions.
- **Change ID:** `task-crud-and-tags`
- **PRD refs:** FR-004, FR-005, FR-006, FR-009
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Core data entry path; S-02 cannot be verified without real tasks in the database. Time estimate and priority fields are the inputs to the ranking algorithm in S-02 — if the creation form omits or allows invalid values, the north star slice cannot be validated end-to-end.
- **Status:** proposed

### S-02: Daily prioritized view (north star)

- **Outcome:** user can view tasks for today ranked by priority × time fit within declared available hours, mark tasks complete or dismissed, navigate to the previous/next day, and see overdue tasks visually distinct from same-day tasks.
- **Change ID:** `daily-prioritized-view`
- **PRD refs:** US-01, FR-007, FR-008, FR-011, FR-012
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - What should "available hours" default to on first login before the user sets a value? — Owner: user. Block: no (can default to 8 hours; user can adjust on the view).
  - Will the priority × time sort and filter exceed Cloudflare Workers' 10ms free-tier CPU limit? — Owner: user. Block: no (push sort + filter to SQL ORDER BY / WHERE in Supabase query rather than JavaScript; documented as a known risk in `context/foundation/infrastructure.md`).
- **Risk:** North star slice; this is the first end-to-end test of the ranking hypothesis. Sort logic must live in SQL (not server-side JS) to stay within the Workers CPU budget. Test with a representative dataset of 50–200 tasks before treating the slice as complete.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID              | Suggested issue title                                | Ready for `/10x-plan` | Notes                             |
|------------|------------------------|------------------------------------------------------|-----------------------|-----------------------------------|
| F-01       | task-data-schema       | Set up task, tags, and user-settings Supabase schema | yes                   | Run `/10x-plan task-data-schema`  |
| S-01       | task-crud-and-tags     | Build task CRUD UI with tag support                  | no                    | Awaits F-01                       |
| S-02       | daily-prioritized-view | Build daily prioritized view with complete/dismiss   | no                    | Awaits S-01; north star slice     |

## Open Roadmap Questions

_(none)_

## Parked

- **Tag filtering (FR-010)** — Why parked: explicit nice-to-have in PRD; `main_goal: speed` means anything not on the must-have path defers; filter UI adds work before the core habit (complete > dismiss) is proven.
- **Calendar view** — Why parked: PRD §Non-Goals; date navigation is prev/next only; month/week grid deferred until daily-view habit is proven.
- **AI task prioritization** — Why parked: PRD §Non-Goals; manual priority (1–3) ships first; AI suggestions are v2+ after the ordering rule is validated with real usage.
- **Social login / 3rd-party auth** — Why parked: PRD §Non-Goals; email + password only for v1.
- **External calendar integration** — Why parked: PRD §Non-Goals; import/sync from Google Calendar etc. out of scope until core product is proven.
- **Pomodoro / time-boxing** — Why parked: PRD §Non-Goals; the product shapes *what* to work on, not *how* to work.
- **Task import from other apps** — Why parked: PRD §Non-Goals; migration tooling adds scope before any users exist.
- **Native mobile app** — Why parked: PRD §Non-Goals; responsive web only.
- **Team workspaces / task sharing** — Why parked: PRD §Non-Goals; single-user only.

## Done

- **F-01: (foundation) tasks, task_tags, and user_settings tables with RLS live; Supabase connected; auth verified** — Archived 2026-06-01 → `context/archive/2026-05-27-task-data-schema/`. Lesson: —.
