# Task Data Schema — Plan Brief

> Full plan: `context/changes/task-data-schema/plan.md`

## What & Why

Create the foundational database schema for Todoer: three tables (`tasks`, `task_tags`, `user_settings`) with row-level security and the auth verification that proves the product can persist user data. Without this foundation, S-01 (task CRUD) and S-02 (daily prioritized view) cannot be built — every subsequent roadmap slice depends on these tables existing with correct RLS.

## Starting Point

Supabase client is wired and auth code is fully implemented (`src/pages/api/auth/`), but no database tables exist yet. The local Docker stack has never been started (`.dev.vars` holds empty credentials). This plan bridges that gap: from "Supabase connected but empty" to "schema live, auth verified end-to-end."

## Desired End State

A single migration applies cleanly via `npx supabase db reset`, the local dev server connects to Supabase without configuration warnings, and a browser walkthrough confirms sign-up/sign-in/sign-out works against the local instance. `src/types.ts` exports the TypeScript entity types S-01 and S-02 will import.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Supabase environment | Local Docker | No cloud project needed for F-01; roadmap-approved fallback exists | Plan |
| Tags storage | `task_tags(task_id, tag_name)` composite PK | Matches roadmap's named tables; cleaner than `text[]` for per-task tag queries | Plan |
| Time estimate unit | Integer minutes | Exact integer arithmetic in SQL cumulative-sum comparisons for S-02's available-hours filter | Plan |
| Task status | PostgreSQL enum `task_status` | DB enforces exact value set; cleaner TypeScript type generation | Plan |
| Tag name constraints | 1–50 chars, lowercase-normalized via trigger | Prevents 'Work' and 'work' as distinct tags without application-layer enforcement | Plan |
| `user_settings` scope | `available_hours` only (DEFAULT 8) | YAGNI — timezone deferred until S-02 overdue logic needs it | Plan |
| Auth verification | Manual browser walkthrough | Auth code already exists; walkthrough confirms credentials and stack wiring | Plan |

## Scope

**In scope:** Docker stack bootstrap, `.dev.vars` wiring, `supabase/seed.sql` placeholder, `20260527000000_task_data_schema.sql` (enum + 3 tables + triggers + 12 RLS policies + indexes), `src/types.ts`, auth smoke test.

**Out of scope:** Task CRUD API routes (S-01), daily view (S-02), Zod validation schemas, seed data, cloud Supabase setup, tag filtering (parked in roadmap), `timezone` in user_settings.

## Architecture / Approach

One migration file, applied in dependency order: shared trigger functions → `task_status` enum → `tasks` (with composite index on `user_id, target_date`) → `task_tags` (lowercase trigger + 5-tag-limit trigger) → `user_settings`. RLS is enabled immediately after each `CREATE TABLE` before any policies are added. `task_tags` policies use a correlated subquery back to `tasks` (the table has no `user_id` column). `src/types.ts` mirrors the SQL schema 1:1 and is the contract surface for downstream slices.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Local Supabase Bootstrap | Docker stack running; `.dev.vars` populated; dev server connects without warnings | Docker Desktop not available / image pull fails |
| 2. Schema Migration + Types | Migration applied; 3 tables + 12 RLS policies live in local DB; `src/types.ts` exported | SQL error in migration (especially correlated-subquery RLS syntax on `task_tags`) |
| 3. Auth Smoke Test | Sign-up/sign-in/dashboard/sign-out verified against local Supabase | Credentials copied incorrectly from `supabase status` |

**Prerequisites:** Docker Desktop installed and running on the development machine.
**Estimated effort:** ~1 session across 3 phases (mostly environment setup and SQL authoring).

## Open Risks & Assumptions

- Docker Desktop must be installed and running — if unavailable, the local path is blocked (cloud Supabase fallback exists but was deprioritized; revisit if Docker fails).
- `supabase/config.toml` references `./seed.sql` — Phase 1 creates an empty placeholder to prevent `db reset` from erroring.
- The 5-tag limit is enforced by a DB trigger; an off-by-one in the count check could silently allow a 6th tag or incorrectly reject the 5th — verify manually in Studio after Phase 2.

## Success Criteria (Summary)

- `npx supabase db reset` applies cleanly; Studio shows all 3 tables, the `task_status` enum, and 12 RLS policies.
- `npm run dev` starts without Supabase configuration errors; `npm run lint` and `npm run build` pass.
- A test account can sign up, sign in, reach `/dashboard`, and sign out against the local instance.
