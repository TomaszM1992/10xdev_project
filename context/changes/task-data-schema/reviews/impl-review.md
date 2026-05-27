<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Task Data Schema Implementation Plan

- **Plan**: context/changes/task-data-schema/plan.md
- **Scope**: All Phases (1–3 of 3)
- **Date**: 2026-05-27
- **Verdict**: APPROVED (after fixes)
- **Findings**: 0 critical  1 warning  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Automated Verification

- `npm run lint` — PASS
- `npm run build` — PASS
- `npx supabase db reset` — PASS (Phase 2)

## Findings

### F1 — task_tags UPDATE policy missing WITH CHECK clause

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260527000000_task_data_schema.sql:121-128
- **Detail**: `authenticated_update_task_tags` has only a USING clause. Both `tasks` and `user_settings` UPDATE policies use USING + WITH CHECK. The plan's "Critical Implementation Details" explicitly states "WITH CHECK is for validating the new values on UPDATE." PostgreSQL falls back to USING as WITH CHECK when omitted, making it functionally equivalent, but the inconsistency violates the stated convention.
- **Fix**: Add `WITH CHECK (EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = auth.uid()))` to the UPDATE policy in a new migration.
  - Strength: One-line addition; makes the policy explicit and uniform with sibling UPDATE policies.
  - Tradeoff: Requires a new migration file.
  - Confidence: HIGH — identical fix pattern on both sibling tables.
  - Blind spot: None significant.
- **Decision**: FIXED — supabase/migrations/20260527000001_fix_task_tags_update_policy.sql

### F2 — tag_name lowercase invariant not enforced at column level

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260527000000_task_data_schema.sql:88-91
- **Detail**: `normalize_tag_name()` lowercases on INSERT/UPDATE via trigger, but direct psql or Studio inserts bypass the trigger. No CHECK constraint enforces `tag_name = lower(tag_name)` at column level. A developer inserting 'Work' via Studio alongside an existing 'work' creates two distinct rows for the same task.
- **Fix**: Add `CHECK (tag_name = lower(tag_name))` to the task_tags column in a follow-up migration.
- **Decision**: SKIPPED

### F3 — available_hours precision unbounded

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260527000000_task_data_schema.sql:143
- **Detail**: `available_hours` is plain `numeric` with no precision/scale. Values like 7.999999999 pass the CHECK constraint. S-02's hour-budget arithmetic (summing `time_estimate_minutes` against `available_hours × 60`) could produce unexpected results. `numeric(4,1)` caps at 24.0 and enforces single-decimal input.
- **Fix**: `ALTER TABLE user_settings ALTER COLUMN available_hours TYPE numeric(4,1)` in a new migration.
- **Decision**: FIXED — supabase/migrations/20260527000002_narrow_available_hours.sql

### F4 — PROTECTED_ROUTES will not cover S-01 API routes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/middleware.ts (PROTECTED_ROUTES constant)
- **Detail**: `PROTECTED_ROUTES` currently contains only `["/dashboard"]`. S-01 will add /api/tasks and /api/settings; those routes will rely on Supabase session resolution but won't get the middleware redirect layer.
- **Fix**: Extend `PROTECTED_ROUTES` (or add a `/api/*` prefix check) when S-01 API routes land. Record as a S-01 prerequisite.
- **Decision**: SKIPPED
