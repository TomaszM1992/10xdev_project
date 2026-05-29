<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Task CRUD with Tags

- **Plan**: context/changes/task-crud-and-tags/plan.md
- **Scope**: All phases (1–4 of 4)
- **Date**: 2026-05-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  3 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated Checks

- `npm test` — 11/11 PASS ✅
- `npm run lint` — PASS ✅
- `npm run build` — PASS ✅

## Findings

### F1 — PATCH mutations have no user_id filter (RLS-only ownership)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/tasks/[id].ts:41, 49, 56
- **Detail**: The scalar UPDATE, the tag DELETE, and the tag INSERT all filter only by `id`, relying on Supabase RLS to enforce ownership. The plan explicitly describes this ("RLS scopes the update to auth.uid()"), so it's Plan Adherence = MATCH. However, RLS misconfiguration or a future service-role leak would make these mutations world-writable. The DELETE handler adds an ownership pre-check (select by id); the PATCH handler has none at all.
- **Fix A ⭐ Recommended**: Add `.eq("user_id", user.id)` to the UPDATE and a select-by-id-and-user_id pre-check before touching tags.
  - Strength: Closes the defence-in-depth gap with a two-line change; identical pattern used in the DELETE handler.
  - Tradeoff: Minor verbosity; query is slightly redundant if RLS is always correct.
  - Confidence: HIGH — the DELETE handler already demonstrates the pre-check pattern.
  - Blind spot: None significant.
- **Fix B**: Accept RLS-only approach, add a comment documenting the intentional design.
  - Strength: Follows Supabase's idiomatic design; plan explicitly documented this choice.
  - Tradeoff: Single point of failure; a service-role bug or RLS policy mistake silently grants cross-user writes.
  - Confidence: MED — acceptable if RLS is audited and locked.
  - Blind spot: Future developers may not realise RLS is the only ownership guard here.
- **Decision**: FIXED via Fix A — added `.maybeSingle()` ownership pre-check before all PATCH mutations; added `.eq("user_id", user.id)` to UPDATE filter.

### F2 — DELETE pre-check ignores select error; wrong status on DB failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/tasks/[id].ts:97
- **Detail**: The ownership pre-check destructures only `data`: `const { data: existing } = await supabase.from("tasks")...`. The `error` return is discarded. If the SELECT fails with a database error, `existing` is null, so the handler returns 404 (task not found) instead of 500 (internal error). Security is not broken — the DELETE never runs — but the caller gets a misleading status code and the error goes undetected.
- **Fix**: Destructure and check `error` from the pre-check select; return 500 if it is non-null, 404 only if data is null.
- **Decision**: FIXED — switched both DELETE and PATCH pre-checks to `.maybeSingle()`; added error check returning 500 on DB failure.

### F3 — `??` used instead of `||` in redirect guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/tasks/[id]/edit.astro:17
- **Detail**: `if (error ?? !data) return Astro.redirect("/tasks")` — nullish coalescing means: use `error` when it is not null/undefined, else fall back to `!data`. Supabase error objects are truthy so the redirect fires correctly today. But `??` is the wrong operator here — the intent is "redirect if either condition is true", which is `||`. Future Supabase SDK changes returning a falsy error object would silently skip the redirect and pass a null task to TaskForm.
- **Fix**: Change line 17 to `if (error || !data) return Astro.redirect("/tasks");`
- **Decision**: FIXED — changed `??` to `||` on edit.astro:17.

### F4 — index.astro: Supabase null renders silent empty list

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/tasks/index.astro:11-19
- **Detail**: If `createClient` returns null (missing env vars), `tasks` stays `[]` and the page renders the empty-state UI — indistinguishable from "you have no tasks". The plan acknowledges this ("if Supabase is unavailable, pass an empty array") so it's intentional, but the user gets no indication the app is misconfigured.
- **Fix**: Add a visible error banner (using the existing Banner component) in the `else` branch when `supabase` is null.
- **Decision**: FIXED — imported Banner, added `serviceUnavailable` flag, rendered error banner when supabase is null.

### F5 — next-themes remains as an unused production dependency

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: package.json:32
- **Detail**: `next-themes` was installed as a transitive dependency by `npx shadcn add sonner`, but the simplified sonner.tsx wrapper no longer imports it. It sits in `dependencies` (not devDeps), adding unnecessary weight to the production bundle.
- **Fix**: `npm uninstall next-themes`
- **Decision**: SKIPPED

### F6 — eslint-disable scope on Supabase insert is wider than needed

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/tasks/index.ts:36-41
- **Detail**: The `// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment` comment suppresses the rule for the entire multi-line Supabase call. Any future field accidentally added to the insert would not be caught by the type checker on that line.
- **Fix**: Break the call into two lines — assign the result first, then destructure with the disable comment only on the destructure statement.
- **Decision**: FIXED — split insert call so eslint-disable-next-line covers only the destructure statement.
