# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`
- Auth API endpoints use form submission + redirect (not JSON responses). Do not return `Response.json()` from auth routes.

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when the component requires `useState`, `useEffect`, event handlers, or browser-only APIs.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod (`zod` is not yet installed — run `npm install zod` before first use).
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Enable RLS on every new table. Write separate policies for each operation (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) and each role (`anon`, `authenticated`). Never use a single catch-all policy. (Folder created after `npx supabase init`.)
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **React 19 compiler**: ESLint enforces `eslint-plugin-react-compiler` rules at `error` level. Hooks must follow compiler-compatible patterns (no conditional hook calls, no dynamic dependency arrays).
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs): create `src/types.ts` when the first shared type is needed (file does not exist yet).
- **Vite pinned**: `package.json` overrides vite to `^7.3.2`. Do not upgrade without testing `@astrojs/cloudflare` adapter compatibility.

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- `wrangler.jsonc` sets `compatibility_date: "2026-05-08"` and `nodejs_compat` flag — do not change without verifying Cloudflare Worker compatibility.
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)

## Testing

### Commands

- `npm test` — run all tests once (`vitest run`)
- `npx vitest` — run in watch mode during development
- `npx stryker run` — mutation testing (full scope; prefer `--mutate` to narrow)

### Layout

- **Unit tests**: co-located with source — `src/lib/*.test.ts`
- **Integration tests**: `src/test/integration/*.test.ts`
- **Test helpers**: `src/test/`
  - `global-setup.ts` — creates the test user via Supabase admin API once before all suites
  - `setup.ts` — loads `.env.test` via dotenv before each test file
  - `supabase.ts` — `signInTestUser()` (returns authenticated client) and `cleanupTestTasks()` helpers

### Environment

Integration tests require a local Supabase stack (`npx supabase start`). Copy `.env.test.example` to `.env.test` and fill in:

- `SUPABASE_URL` — must be `http://127.0.0.1:…`; the helper refuses to run against any other URL
- `SUPABASE_ANON_KEY` — anon key for the local stack
- `SUPABASE_SERVICE_ROLE_KEY` — used by `global-setup.ts` to create the test user
- `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`

### Conventions

- `fileParallelism: false` in `vitest.config.ts` — test files run serially to prevent DB race conditions; do not override.
- Integration suites: call `cleanupTestTasks` in both `beforeAll` (pre-seed wipe) and `afterAll` (post-run wipe).
- No mocking the database — integration tests hit the real local Supabase stack. Mock-based tests masked real migration failures in the past.
- Unit tests cover pure business logic (e.g. `applyBudgetFilter`); integration tests cover DB behaviour, RLS, and ordering guarantees.

### Mutation testing

Repo uses Stryker for selective mutation testing on risk-critical modules.
Run it only for code covered by the current change or a risk from test-plan.md,
prefer narrowed scope with --mutate "path/to/file.ts:start-end", and do not chase
100% mutation score. Survived mutants should be reviewed one by one: add an
assertion only when the mutant represents a user-visible or business-relevant bug.

## CI
-GitHub Actions workflow (`.github/workflows/ci.yml`) runs lint + build on every push and PR to master. Requires `SUPABASE_URL` and `SUPABASE_KEY` repository -secrets for the build step. 
@.github/workflows/ci.yml

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 4

Prepare for a harder implementation stream with the **research-backed planning chain**:

```
internal research (/10x-research) + external research (exa.ai, Context7) -> /10x-plan -> /10x-implement -> success
```

The lesson focus is distinguishing internal from external research and using evidence to back planning decisions.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Internal research (lesson focus)** | |
| `/10x-research <change-id>` | You need evidence from the existing codebase — patterns, conventions, integration points, or existing implementations. Runs parallel sub-agents over the repo and writes structured findings to `research.md`. |
| **External research (lesson focus)** | |
| exa.ai | You need AI-native web search for library comparisons, best practices, or ecosystem context that the codebase cannot answer. |
| Context7 (`resolve-library-id` → `get-library-docs`) | You need live, current documentation for a specific library or framework. Resolves a library ID first, then fetches relevant doc pages. |
| **Framing spare wheel** | |
| `/10x-frame <change-id>` | The plan won't converge, the plan doesn't deliver expected results, or persistent drift keeps breaking the implementation. Use as an escape hatch on a separate problem (demonstrated on Space Explorers example), not as pre-research ritual. |
| **Planning and execution** | |
| `/10x-plan <change-id>` / `/10x-implement <change-id> phase <n>` | Use the same planning and execution chain from Lesson 2, now with upstream research evidence feeding the plan. |

### Research discipline

- Internal research (`/10x-research`) answers "what does our codebase already do?" — patterns, schemas, conventions, integration points.
- External research (exa.ai, Context7) answers "what should we do?" — library capabilities, API docs, ecosystem best practices.
- Combine both as evidence-backed input to `/10x-plan`. A plan without research evidence on a non-trivial stream is a guess.
- Agent-friendly docs (`llms.txt`, markdown-for-agents, `/md` endpoints) are a quality signal for library selection — libraries that publish agent-readable docs integrate faster.

### `/10x-frame` as spare wheel

Three triggers for reaching for `/10x-frame`:
1. The plan won't converge — research keeps opening more questions instead of narrowing to a contract.
2. The plan doesn't deliver — implementation repeatedly fails to meet success criteria.
3. Persistent drift — the implementation keeps diverging from the plan in ways that suggest the problem was mis-framed.

Demonstrated on a Space Explorers example, not the SRS path. It is an escape hatch, not a mandatory step.

### Paths used by this lesson

- `context/changes/<change-id>/research.md` - internal research output
- `context/changes/<change-id>/frame.md` - framing output when needed
- `context/changes/<change-id>/plan.md` - evidence-backed implementation contract
- `context/foundation/lessons.md` - recurring rules and pitfalls

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
