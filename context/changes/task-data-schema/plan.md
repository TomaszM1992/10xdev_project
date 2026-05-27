# Task Data Schema Implementation Plan

## Overview

Create the foundational database layer for Todoer: write a single Supabase migration that defines the `tasks`, `task_tags`, and `user_settings` tables with row-level security; start the local Supabase Docker stack and wire credentials into `.dev.vars`; then verify auth sign-up/sign-in/sign-out works end-to-end against the local instance.

## Current State Analysis

- `src/lib/supabase.ts`: server-side Supabase client factory wired with `@supabase/ssr`; returns `null` when credentials are absent.
- `src/middleware.ts`: resolves `context.locals.user` on every request; protects `/dashboard`.
- `src/pages/api/auth/{signin,signup,signout}.ts`: auth endpoints fully implemented.
- `supabase/config.toml`: local project configured (`project_id: 10x-astro-starter`); `schema_paths = []`; `./seed.sql` referenced in `sql_paths` but file does not exist yet.
- `supabase/migrations/`: empty — no tables exist yet.
- `.dev.vars`: file exists but holds empty values for `SUPABASE_URL` and `SUPABASE_KEY`.
- `zod ^4.4.3`: already installed.
- `src/types.ts`: does not exist yet.

## Desired End State

When this plan is complete:
1. `npx supabase db reset` applies `20260527000000_task_data_schema.sql` cleanly — three tables (`tasks`, `task_tags`, `user_settings`), one enum (`task_status`), shared trigger functions, 12 RLS policies (4 per table), and composite indexes on `tasks` exist in the local DB.
2. `npm run dev` starts against local Supabase with no "Supabase is not configured" warning.
3. A browser walkthrough confirms sign-up → sign-in → `/dashboard` → sign-out works against the connected local instance.
4. `src/types.ts` exports TypeScript types matching the schema, ready for S-01 to import.

### Key Discoveries:

- `supabase/config.toml` references `./seed.sql` in `sql_paths` — this file must exist (even empty) or `supabase db reset` may fail.
- RLS on `task_tags` cannot use `user_id = auth.uid()` directly (no `user_id` column on the table); policies must use a correlated subquery back to `tasks`.
- The 5-tag-per-task limit from FR-009 cannot be enforced with a column-level CHECK constraint; it requires a BEFORE INSERT trigger.
- `updated_at` auto-update is handled by a shared `set_updated_at()` trigger function, called by a BEFORE UPDATE trigger on each table that has an `updated_at` column.

## What We're NOT Doing

- No task CRUD API routes (S-01 scope).
- No daily view UI (S-02 scope).
- No Zod validation schemas (S-01 will add those when API routes are built).
- No seed data beyond what Supabase auto-inserts for the auth schema.
- No cloud Supabase project setup (local Docker only for F-01).
- No `timezone` field in `user_settings` (deferred — not needed until S-02 overdue logic is built).
- No tag-filtering query patterns (FR-010, parked in roadmap).

## Implementation Approach

Single migration file covering all three tables in dependency order (trigger functions → enum → `tasks` → `task_tags` → `user_settings`). RLS is enabled immediately after each `CREATE TABLE`, before any policies are added, to avoid a window of unprotected access. Phase 1 bootstraps the runtime (Docker + credentials); Phase 2 writes and applies the schema and creates `src/types.ts`; Phase 3 is a manual browser smoke test.

## Critical Implementation Details

**RLS for `task_tags` requires a correlated subquery.** `task_tags` has no `user_id` column, so every policy (SELECT, INSERT, UPDATE, DELETE) must verify ownership via the parent `tasks` row:
`EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = auth.uid())`

**INSERT policies use `WITH CHECK`, not `USING`.** For `tasks` and `user_settings` INSERT policies, the correct clause is `WITH CHECK (user_id = auth.uid())`. The USING clause is for filtering existing rows on SELECT/UPDATE/DELETE; WITH CHECK is for validating rows on INSERT and the new values on UPDATE.

**`supabase db reset` is the correct apply command** for first-run local development. It drops and recreates the DB deterministically. Do not use `supabase migration up` for first setup — it can leave partial state if the DB is empty.

---

## Phase 1: Local Supabase Bootstrap

### Overview

Start the local Supabase Docker stack, extract the local API URL and anon key, and populate `.dev.vars` so the dev server connects.

### Changes Required:

#### 1. Start local Supabase stack

**File**: terminal (no file change)

**Intent**: Launch the local Supabase services so a PostgreSQL database, Auth server, and REST API are available at `http://127.0.0.1:54321` for all subsequent phases.

**Contract**: Run `npx supabase start` from the project root. On first run this pulls Docker images (~2 GB total); subsequent starts are fast (seconds). After it completes, `npx supabase status` prints the `API URL` and `anon key` needed for `.dev.vars`.

#### 2. Populate `.dev.vars`

**File**: `.dev.vars`

**Intent**: Wire the local Supabase credentials into the Cloudflare local dev environment so `SUPABASE_URL` and `SUPABASE_KEY` resolve and `createClient()` returns a non-null client.

**Contract**: `SUPABASE_URL` = `API URL` value from `npx supabase status` (typically `http://127.0.0.1:54321`). `SUPABASE_KEY` = `anon key` value (a long JWT). Both values already have placeholders in the file — replace them. Do not commit this file (it is gitignored).

#### 3. Create empty seed file

**File**: `supabase/seed.sql`

**Intent**: Prevent `npx supabase db reset` from erroring on the missing seed file referenced in `supabase/config.toml`'s `sql_paths`.

**Contract**: The file can be empty or contain only a comment. No actual seed data is added in F-01.

### Success Criteria:

#### Automated Verification:

- `npx supabase status` exits 0 and prints an `API URL` and `anon key`.

#### Manual Verification:

- `npm run dev` starts; visiting `http://localhost:4321` shows no "Supabase is not configured" banner (the `configStatuses` check in `src/lib/config-status.ts` must find both env vars set).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 2.

---

## Phase 2: Schema Migration and TypeScript Types

### Overview

Write the full SQL migration (enum, 3 tables, trigger functions, 5-tag-limit trigger, composite indexes, 12 RLS policies). Apply it with `npx supabase db reset`. Create `src/types.ts` with the TypeScript types S-01 and S-02 will import.

### Changes Required:

#### 1. SQL migration file

**File**: `supabase/migrations/20260527000000_task_data_schema.sql`

**Intent**: Define the complete Todoer data schema in a single migration, establishing the exact column names, types, constraints, indexes, and security policies that all subsequent slices build on.

**Contract**: The migration executes in this dependency order:

1. **Shared trigger functions** (must precede the triggers that call them)
2. **`task_status` enum** (must precede `tasks` which uses it as a column type)
3. **`tasks` table** → enable RLS → indexes → `updated_at` trigger → 4 RLS policies
4. **`task_tags` table** → enable RLS → lowercase trigger → 5-tag-limit trigger → 4 RLS policies
5. **`user_settings` table** → enable RLS → `updated_at` trigger → 4 RLS policies

Key schema invariants the implementer must preserve exactly — downstream slices depend on these names and types:

```sql
-- Shared trigger function (reused by tasks and user_settings)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Lowercase normalization (used by task_tags)
CREATE OR REPLACE FUNCTION normalize_tag_name()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.tag_name = lower(NEW.tag_name); RETURN NEW; END;
$$;

-- 5-tag limit (BEFORE INSERT on task_tags)
CREATE OR REPLACE FUNCTION enforce_task_tags_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM task_tags WHERE task_id = NEW.task_id) >= 5 THEN
    RAISE EXCEPTION 'Task cannot have more than 5 tags';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TYPE task_status AS ENUM ('pending', 'complete', 'dismissed');

CREATE TABLE tasks (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name                  text NOT NULL CHECK (char_length(name) > 0),
  target_date           date NOT NULL,
  priority              smallint NOT NULL CHECK (priority BETWEEN 1 AND 3),
  time_estimate_minutes integer NOT NULL CHECK (time_estimate_minutes > 0),
  status                task_status NOT NULL DEFAULT 'pending',
  created_at            timestamptz DEFAULT now() NOT NULL,
  updated_at            timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE task_tags (
  task_id  uuid REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  tag_name text NOT NULL CHECK (char_length(tag_name) BETWEEN 1 AND 50),
  PRIMARY KEY (task_id, tag_name)
);

CREATE TABLE user_settings (
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  available_hours numeric NOT NULL DEFAULT 8 CHECK (available_hours > 0 AND available_hours <= 24),
  updated_at      timestamptz DEFAULT now() NOT NULL
);
```

RLS policy naming convention: `"<role>_<operation>_<table>"`.
- `tasks` policies: `authenticated_select_tasks`, `authenticated_insert_tasks`, `authenticated_update_tasks`, `authenticated_delete_tasks`
- `task_tags` policies: same pattern; USING/WITH CHECK uses the EXISTS subquery above
- `user_settings` policies: same pattern with `user_id = auth.uid()`
- No `anon` policies — implicit deny via RLS

Indexes: `tasks_user_id_idx ON tasks(user_id)` and `tasks_user_date_idx ON tasks(user_id, target_date)`. The composite index is the primary performance investment for S-02's daily view query.

#### 2. TypeScript entity types

**File**: `src/types.ts` (create new)

**Intent**: Export the shared TypeScript types that API routes (S-01) and UI components (S-02) will import. Defined here because the types are directly derived from the migration schema and must be stable before downstream slices reference them.

**Contract**:

```typescript
export type TaskStatus = 'pending' | 'complete' | 'dismissed';

export interface Task {
  id: string;
  user_id: string;
  name: string;
  target_date: string; // ISO date YYYY-MM-DD
  priority: 1 | 2 | 3;
  time_estimate_minutes: number;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface TaskTag {
  task_id: string;
  tag_name: string;
}

export interface UserSettings {
  user_id: string;
  available_hours: number;
  updated_at: string;
}

export interface TaskWithTags extends Task {
  task_tags: TaskTag[];
}
```

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` exits 0 with no SQL errors.
- `npm run lint` passes (new `src/types.ts` must have no ESLint errors).
- `npm run build` passes.

#### Manual Verification:

- Supabase Studio at `http://localhost:54323` shows `tasks`, `task_tags`, and `user_settings` tables with the correct columns, types, and "RLS enabled" indicator.
- `task_status` enum is visible under Database → Types.
- All 12 RLS policies (4 per table) appear in each table's RLS policies section.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 3.

---

## Phase 3: Auth Smoke Test

### Overview

Verify that auth sign-up, sign-in, access to `/dashboard`, and sign-out all work correctly against the local Supabase instance, confirming that credentials and the auth schema are correctly wired.

### Changes Required:

#### 1. Manual walkthrough (no code changes)

**File**: none

**Intent**: Confirm the auth flow works end-to-end against the local Supabase instance, validating that `.dev.vars` credentials are correct and Supabase's `auth` schema is functional. The auth endpoints already exist; this phase surfaces misconfiguration before S-01 builds on this foundation.

**Contract**: The walkthrough exercises these code paths: `src/pages/auth/signup.astro` → `src/pages/api/auth/signup.ts` → Supabase `auth.signUp` → redirect to `/auth/confirm-email`. Then `src/pages/api/auth/signin.ts` → `auth.signInWithPassword` → redirect to `/`. Then `src/middleware.ts` auth check → `/dashboard` renders. Then `src/pages/api/auth/signout.ts` → `auth.signOut` → redirect to `/`.

### Success Criteria:

#### Automated Verification:

- (None — this phase is verification-only with no code changes.)

#### Manual Verification:

- Visit `/auth/signup` → create account with a test email/password → confirmation page shows "Registration successful" with "Go to sign in" link (dev auto-confirm mode).
- Sign in with the same credentials → browser redirects to `/`.
- Navigate to `/dashboard` → page loads and displays the user's email address.
- Submit the sign-out form → browser redirects to `/`.
- Supabase Studio at `http://localhost:54323` → Authentication → Users shows the test account.

**Implementation Note**: This is the final phase. After manual verification passes, update `change.md` status to `implemented` and record phase SHAs in `## Progress`.

---

## Testing Strategy

### Unit Tests:

- Not applicable for F-01 (schema-only change with no application logic).

### Integration Tests:

- Not applicable at F-01 scope. S-01 will add API-level tests when CRUD routes are built.

### Manual Testing Steps:

1. Confirm `npx supabase status` output matches values in `.dev.vars`.
2. Confirm Supabase Studio shows all 3 tables with RLS enabled and 12 total policies.
3. Run the auth walkthrough in Phase 3.

## Performance Considerations

`tasks_user_date_idx ON tasks(user_id, target_date)` is the primary performance investment for S-02's daily view. It allows a single index scan to retrieve all tasks for a given user on a given date without a full table scan — critical for the <200ms render NFR with up to 200 tasks. The composite order (`user_id` first) is intentional: all task queries filter by `user_id = auth.uid()` first, then narrow by date.

## Migration Notes

This is the first migration. `npx supabase db reset` is the correct apply command — it drops the database and reapplies all migrations deterministically. For future migrations (S-01+), `npx supabase migration new <name>` creates the next file and `npx supabase db reset` (or `npx supabase migration up` for incremental apply) brings the DB up to date.

## References

- Roadmap F-01: `context/foundation/roadmap.md`
- PRD functional requirements: `context/foundation/prd.md` (FR-004, FR-007, FR-008, FR-009, US-01)
- CLAUDE.md RLS convention: separate policies per operation per role; no catch-all policies.

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Local Supabase Bootstrap

#### Automated

- [x] 1.1 `npx supabase status` exits 0 and prints API URL and anon key — 05e2b23

#### Manual

- [x] 1.2 `npm run dev` starts without "Supabase is not configured" banner — 05e2b23

### Phase 2: Schema Migration and TypeScript Types

#### Automated

- [x] 2.1 `npx supabase db reset` exits 0 with no SQL errors — e1377ef
- [x] 2.2 `npm run lint` passes — e1377ef
- [x] 2.3 `npm run build` passes — e1377ef

#### Manual

- [x] 2.4 Supabase Studio shows all 3 tables with correct columns and RLS enabled — e1377ef
- [x] 2.5 `task_status` enum visible in Studio under Database → Types — e1377ef
- [x] 2.6 All 12 RLS policies (4 per table) appear in each table's RLS section — e1377ef

### Phase 3: Auth Smoke Test

#### Manual

- [x] 3.1 Sign up a new account at `/auth/signup` → confirmation page shows "Registration successful" — bedae2f
- [x] 3.2 Sign in with same credentials → redirected to `/` — bedae2f
- [x] 3.3 Navigate to `/dashboard` → page loads and displays user email — bedae2f
- [x] 3.4 Sign out → redirected to `/` — bedae2f
- [x] 3.5 Test user visible in Supabase Studio under Authentication → Users — bedae2f
