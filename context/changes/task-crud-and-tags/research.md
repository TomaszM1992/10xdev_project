---
date: 2026-05-28T00:00:00+00:00
researcher: Claude Sonnet 4.6
git_commit: 28598017836094d36e17edae267dad1f45e76aa4
branch: feature/task-crud-and-tags
repository: 10xdev_project
topic: "Task CRUD with tags — S-01 codebase integration points"
tags: [research, codebase, api-routes, frontend, supabase, zod, shadcn-ui, task-crud]
status: complete
last_updated: 2026-05-28
last_updated_by: Claude Sonnet 4.6
---

# Research: Task CRUD with tags — S-01 codebase integration points

**Date**: 2026-05-28
**Researcher**: Claude Sonnet 4.6
**Git Commit**: 2859801
**Branch**: feature/task-crud-and-tags
**Repository**: TomaszM1992/10xdev_project

## Research Question

What are the existing codebase patterns, conventions, and integration points that S-01 (task CRUD with tags) must build on? Goal: give `/10x-plan` enough evidence to write a contract without re-deriving what's already settled.

## Summary

F-01 is fully complete and reviewed. The schema (`tasks`, `task_tags`, `user_settings`), TypeScript types, Supabase client, and auth flow are all in place. S-01 builds directly on top of them. The key integration constraints are: (1) API routes must export named HTTP method functions and check `context.locals.user` for auth; (2) interactive forms are React islands with `client:load`; (3) Zod v4 is installed but unused — S-01 will be the first consumer; (4) only `button.tsx` from shadcn/ui is installed — the task form requires several more components; (5) `PROTECTED_ROUTES` needs extending to cover task pages.

---

## Detailed Findings

### 1. Database Schema (from F-01 — fully applied)

All three tables are live. Key invariants S-01 must respect:

**`tasks` table** — `supabase/migrations/20260527000000_task_data_schema.sql:46-56`
```sql
id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY
user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
name                  text        NOT NULL CHECK (char_length(name) > 0)
target_date           date        NOT NULL
priority              smallint    NOT NULL CHECK (priority BETWEEN 1 AND 3)
time_estimate_minutes integer     NOT NULL CHECK (time_estimate_minutes > 0)
status                task_status NOT NULL DEFAULT 'pending'
created_at            timestamptz NOT NULL DEFAULT now()
updated_at            timestamptz NOT NULL DEFAULT now()
```

**`task_tags` table** — `supabase/migrations/20260527000000_task_data_schema.sql:88-91`
```sql
task_id  uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE
tag_name text NOT NULL CHECK (char_length(tag_name) BETWEEN 1 AND 50)
PRIMARY KEY (task_id, tag_name)
```
- Tag names are **lowercased automatically** by `normalize_tag_name()` trigger on INSERT/UPDATE
- **5-tag limit** enforced by `enforce_task_tags_limit()` BEFORE INSERT trigger
- RLS uses correlated subquery to `tasks` (no `user_id` column on `task_tags`)

**`task_status` enum**: `'pending' | 'complete' | 'dismissed'`

**Indexes**: `tasks_user_id_idx ON tasks(user_id)` and `tasks_user_date_idx ON tasks(user_id, target_date)` — the composite index is the S-02 performance investment; S-01 queries benefit from `user_id_idx`.

### 2. TypeScript Types (ready to import)

`src/types.ts` — all types needed for S-01 are already defined:

```typescript
// src/types.ts:1-29
export type TaskStatus = "pending" | "complete" | "dismissed";

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

export interface TaskTag { task_id: string; tag_name: string; }
export interface TaskWithTags extends Task { task_tags: TaskTag[]; }
export interface UserSettings { user_id: string; available_hours: number; updated_at: string; }
```

### 3. API Route Patterns

**Supabase client instantiation** — `src/lib/supabase.ts:9`
```typescript
// All API routes use this exact pattern:
const supabase = createClient(context.request.headers, context.cookies);
// supabase can be null if env vars missing — always null-check
```

**User identity** — middleware pre-resolves the user:
- `src/middleware.ts:13` sets `context.locals.user = user ?? null`
- Type: `import("@supabase/supabase-js").User | null` (declared in `src/env.d.ts:1-5`)
- API routes access it as `context.locals.user` — no separate `getUser()` call needed for auth check

**Existing route shape** — `src/pages/api/auth/signin.ts:4`
```typescript
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  // ... returns context.redirect(...)
};
```

**Critical distinction**: Auth routes use form submission + `context.redirect()`. Task CRUD routes should use **JSON request/response** since the React island UI will use `fetch()`. CLAUDE.md says auth routes must not return `Response.json()` — that restriction is auth-specific.

**Protected route gap** — `src/middleware.ts:4`
```typescript
const PROTECTED_ROUTES = ["/dashboard"]; // needs "/tasks" added for S-01 pages
```
- Middleware uses `pathname.startsWith(route)` so adding `"/tasks"` covers all `/tasks/*`
- `/api/tasks` routes should **not** be in PROTECTED_ROUTES (they return 401 JSON, not redirect)

**No Zod in any existing route** — `src/pages/api/auth/signin.ts:5-7` uses raw `formData().get()` with `as string` cast. S-01 will be the first code to use Zod for validation.

### 4. Frontend Page Patterns

**Protected Astro page structure** — `src/pages/dashboard.astro:1-5`
```astro
---
import Layout from "@/layouts/Layout.astro";
const user = Astro.locals.user;  // guaranteed non-null by middleware
---
<Layout title="...">
```

**React island pattern** — `src/pages/auth/signin.astro:16`
```astro
<SignInForm serverError={error} client:load />
```
- Islands use `client:load` for immediate hydration
- Server-side error (from API redirect query param) is extracted in Astro frontmatter and passed as prop
- Pattern: `const error = Astro.url.searchParams.get("error")`

**Auth form component anatomy** (matches what task form should replicate):
- State: field values + `errors` object (`Record<string, string | undefined>`)
- Client-side validation in `handleSubmit` before native form submit
- Form element: `method="POST" action="/api/..."` + `onSubmit={handleSubmit}` + `noValidate`
- Uses `useFormStatus()` from `react-dom` for pending state (NOT `useState` for loading)

### 5. Reusable UI Components

**`FormField`** — `src/components/auth/FormField.tsx:8-20` — the primary input primitive:
```typescript
interface FormFieldProps {
  id: string; name?: string; label: string; type?: string;
  value: string; onChange: (value: string) => void;
  placeholder?: string; error?: string; hint?: ReactNode;
  icon: ReactNode; endContent?: ReactNode;
}
```
- Requires an icon (Lucide) — all task form fields need icons
- `type` prop supports any HTML input type (`text`, `number`, `date`)
- Error/hint slot at bottom

**`SubmitButton`** — `src/components/auth/SubmitButton.tsx` — uses `useFormStatus()` for pending state. Reusable as-is.

**`ServerError`** — `src/components/auth/ServerError.tsx` — renders if `message` is non-null. Reusable as-is.

**`Button`** — `src/components/ui/button.tsx` — full CVA variant system (default, destructive, outline, secondary, ghost, link). Available for action buttons (delete, cancel).

**`cn()`** — `src/lib/utils.ts` — Tailwind class merging. Use everywhere.

### 6. shadcn/ui Component Gaps

Only `button.tsx` is installed. Task form fields not covered by `FormField`:

| Field | Gap | Solution |
|---|---|---|
| name (text) | FormField covers this | None — reuse FormField |
| target_date | FormField with `type="date"` works; native styling may clash with cosmic theme | Use `type="date"` on FormField first; install Calendar+Popover only if UX is poor |
| priority (1-3) | No radio/segmented control | Custom inline buttons or install `npx shadcn@latest add radio-group` |
| time_estimate_minutes | FormField with `type="number"` works | None — reuse FormField |
| tags (up to 5) | No tag input | Custom tag chip component |

Minimum installs needed: none if reusing FormField + custom inline controls. If richer UX wanted: `input`, `select`, `badge`, `radio-group`.

### 7. Zod v4 Validation

Zod **4.4.3** is installed (`package.json:36`). **No existing usage** — S-01 is the first consumer.

**Zod v4 key differences from v3**:
- Date strings: use `z.string().date()` (validates YYYY-MM-DD format)
- Coercion: `z.coerce.number()` converts string `"90"` → `90` (needed if form data is used; not needed for JSON body)
- Union literals: `z.literal(1).or(z.literal(2)).or(z.literal(3))` OR `z.union([z.literal(1), z.literal(2), z.literal(3)])`

**Recommended schema location**: `src/lib/schemas.ts` (new file)

```typescript
// Sketch for S-01 Zod schemas
export const CreateTaskSchema = z.object({
  name: z.string().min(1).max(255),
  target_date: z.string().date(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  time_estimate_minutes: z.number().int().positive(),
  tags: z.array(z.string().min(1).max(50)).max(5).optional().default([]),
});

export const UpdateTaskSchema = CreateTaskSchema.partial().extend({
  status: z.enum(["pending", "complete", "dismissed"]).optional(),
});
```

### 8. Environment and Config

**Env access pattern** — `src/lib/supabase.ts:3`
```typescript
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
```
- Both vars are `optional: true` in `astro.config.mjs:17-22` — always handle null client

**Astro config** — `astro.config.mjs`: `output: "server"` (full SSR), Cloudflare adapter. API routes work out-of-the-box; no `prerender = false` needed when global output is `server`.

**Path aliases** — `tsconfig.json`: `@/*` → `./src/*`. Use `@/lib/...`, `@/types`, `@/components/...` everywhere.

---

## Code References

- `src/types.ts:1-29` — Task, TaskTag, UserSettings, TaskWithTags types
- `src/lib/supabase.ts:1-24` — createClient factory (takes headers + cookies, returns null if unconfigured)
- `src/middleware.ts:1-25` — PROTECTED_ROUTES, user resolution, route protection
- `src/env.d.ts:1-5` — App.Locals type (user: User | null)
- `src/pages/api/auth/signin.ts:1-21` — canonical API route shape
- `src/pages/dashboard.astro:1-27` — canonical protected Astro page shape
- `src/pages/auth/signin.astro:1-22` — Astro page + React island handoff pattern
- `src/components/auth/SignInForm.tsx:1-87` — canonical React form island with validation
- `src/components/auth/FormField.tsx:8-68` — reusable input primitive
- `src/components/auth/SubmitButton.tsx:1-31` — pending-state submit button
- `src/components/auth/ServerError.tsx:1-16` — server error display
- `src/components/ui/button.tsx:7-48` — shadcn Button with CVA variants
- `src/lib/utils.ts:1-6` — cn() Tailwind class merger
- `supabase/migrations/20260527000000_task_data_schema.sql` — full schema
- `supabase/migrations/20260527000001_fix_task_tags_update_policy.sql` — task_tags UPDATE fix
- `supabase/migrations/20260527000002_narrow_available_hours.sql` — available_hours precision fix

---

## Architecture Insights

**Form strategy**: The existing auth form pattern (React island + POST + `useFormStatus`) works for task create/edit. The key adaptation is: auth forms submit via HTML form POST and follow a redirect; task forms should instead use `fetch()` to call JSON API endpoints and handle the response client-side (no full-page redirect on success). This allows inline error display and optimistic list updates.

**Tag handling strategy**: Two options — (A) include `tags: string[]` in the task create/update JSON body and have the API route manage INSERT/DELETE on `task_tags` in sequence; (B) separate `/api/tasks/[id]/tags` endpoint. Option A is simpler for S-01. The tag 5-limit and lowercase normalization are enforced at the DB level but should also be validated client-side for UX.

**RLS is the security layer**: API routes do not need manual `WHERE user_id = X` checks — Supabase RLS policies on `tasks` and `task_tags` automatically scope all queries to `auth.uid()`. However, routes still need to check `context.locals.user !== null` before calling Supabase to return a proper 401.

**`task_tags` atomic update pattern**: When updating tags, the cleanest approach is DELETE existing tags for the task + INSERT new ones in a single Supabase call sequence. Supabase doesn't support multi-statement transactions in the REST API, so this is two sequential calls — acceptable for S-01 scope.

---

## Historical Context (from prior changes)

- `context/changes/task-data-schema/plan.md` — F-01 established the complete schema, types, and auth verification. The "What We're NOT Doing" section explicitly defers Zod schemas to S-01.
- `context/changes/task-data-schema/reviews/impl-review.md` (F4 observation) — `PROTECTED_ROUTES` needs extending when S-01 task pages land; marked SKIPPED in F-01, must be addressed in S-01.
- `context/changes/task-data-schema/plan.md` (Migration Notes) — future migrations use `npx supabase migration new <name>` + `npx supabase db reset`.

---

## Open Questions

1. **Tag update atomicity**: Should the API do DELETE-all + INSERT-new on every edit (simple but lossy), or diff the old/new tag sets (correct but more complex)? — *Recommend DELETE-all + INSERT-new for S-01; low risk since tags are value objects.*

2. **Date input UX**: Use native `<input type="date">` via FormField (works, but platform-native styling may look inconsistent) or install shadcn Calendar+Popover (better UX, more components to add)? — *Recommend native date input for S-01 speed; Calendar upgrade can be a cosmetic followup.*

3. **Priority input UX**: Radio buttons, segmented control (inline 1/2/3 buttons), or select dropdown? — *Recommend inline segmented button group (3 buttons) — simpler than a dropdown for a 3-value field, no new component needed.*

4. **Fetch vs form POST for task form**: Should the task form use a React `fetch()` call (enables inline error handling + optimistic UI) or HTML form POST + redirect (simpler, matches auth pattern)? — *Recommend fetch() + JSON for task CRUD; form POST + redirect is auth-specific per CLAUDE.md.*

5. **Task list route**: Should the task list live at `/tasks` (natural CRUD URL) or stay on `/dashboard`? — *Recommend `/tasks` (clean separation; dashboard can link there); `/dashboard` can redirect to `/tasks` or become a hub.*

6. **Pagination**: How many tasks per page? Any infinite scroll? — *Recommend simple limit/offset for S-01 (no infinite scroll); 50 tasks per page is safe given the composite index.*
