<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Task CRUD with Tags Implementation Plan

- **Plan**: context/changes/task-crud-and-tags/plan.md
- **Mode**: Deep
- **Date**: 2026-05-28
- **Verdict**: SOUND (after fixes)
- **Findings**: 0 critical · 0 warnings · 1 observation accepted

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

8/8 existing paths ✓, 4/4 symbols ✓, brief↔plan ✓, src/pages/api/tasks/ absent ✓ (correct)

## Findings

### F1 — TaskList contract has "DELETE" in the fetch URL string

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3, TaskList component contract
- **Detail**: Contract read `fetch("DELETE /api/tasks/${task.id}", { method: "DELETE" })` — "DELETE" in the URL string is not a valid URL and throws at runtime.
- **Fix**: Changed URL to backtick template `` `/api/tasks/${task.id}` `` with "DELETE" only in method.
- **Decision**: FIXED

### F2 — vitest.config.ts missing; @/ alias fails in tests

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1, vitest install contract
- **Detail**: astro.config.mjs has no vite.resolve.alias. Vitest does not auto-read tsconfig paths. Import of `@/lib/schemas` in test files would fail without a config file.
- **Fix A ⭐ Applied**: Added `vitest.config.ts` creation to the Phase 1 vitest install contract, including the `resolve.alias` for `@` → `./src`.
- **Decision**: FIXED via Fix A

### F3 — z.string().date() is @deprecated in Zod 4.4.3

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, Zod schemas contract
- **Detail**: Verified in node_modules/zod/v4/classic/schemas.d.ts:162 — `@deprecated Use z.iso.date() instead`. Works at runtime but deprecated.
- **Fix**: Replaced `z.string().date()` with `z.iso.date()` in both CreateTaskSchema and UpdateTaskSchema contracts. Updated Key Discoveries note.
- **Decision**: FIXED

### F4 — Astro.params.id needs type narrowing in edit page

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4, edit task page contract
- **Detail**: Astro types dynamic route params as `string | undefined`. Strict TypeScript rejects passing it to `.eq()` without narrowing.
- **Fix**: Added `const { id } = Astro.params; if (!id) return Astro.redirect("/tasks")` to the edit page contract.
- **Decision**: FIXED

### F5 — Tags-only PATCH doesn't bump tasks.updated_at

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2, PATCH /api/tasks/[id] contract
- **Detail**: A body containing only tags skips the tasks UPDATE, so set_updated_at() never fires. Acceptable for S-01 (sorted by created_at); S-02 should be aware.
- **Fix**: Added a documentation note to the PATCH contract.
- **Decision**: FIXED

### F6 — Toaster client:load in Layout.astro is first island in a layout

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1, Mount Toaster in Layout contract
- **Detail**: Layout.astro currently has no client: directives. Adding Toaster is new pattern for layouts but technically correct. Phase 1 smoke test covers it.
- **Decision**: ACCEPTED
