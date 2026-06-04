# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-01 (Phase 1 complete)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic check that already catches the
   regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in area Y"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase signal (churn, structure, test base). It does NOT
   claim to know which line owns the failure. That knowledge is produced by
   `/10x-research` during each rollout phase. If the plan and research
   disagree about where the failure lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `src/` (excluded: `node_modules`, `dist`, build output). Last 30 days.

---

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Task set for "today" appears on the wrong date in the daily view due to UTC offset on server-side date derivation | High | High | interview Q2 (user burned by this); hot-spot dir `src/components/daily/` (7 commits/30d) |
| 2 | Task created in one session is missing on the next login — silent INSERT failure not surfaced by the API or UI | High | Medium | PRD guardrail ("task data must never be silently lost"); interview Q1; hot-spot dir `src/pages/api/tasks/` (5 commits/30d) |
| 3 | Daily view shows wrong order or wrong budget cutoff — ranking regression at edge cases (equal priority+time, overdue+today mix, exact budget boundary) | High | Medium | interview Q4 ("core claim, nothing verifies edge cases"); hot-spot dir `src/components/daily/` (7 commits/30d); PRD US-01 AC |
| 4 | Authenticated user reads or modifies another user's tasks by guessing a task ID — RLS exists but is never automatically verified | High | Low | PRD NFR ("isolation is absolute at all layers"); CLAUDE.md auth conventions |
| 5 | Complete/dismiss undo leaves task missing after PATCH failure, or restores to wrong position — optimistic state machine breaks silently | Medium | Medium | interview Q3 (useRef/setTimeout wiring "feels fragile"); hot-spot dir `src/components/daily/` (7 commits/30d) |
| 6 | Available-hours preference silently reverts to 8h default on next session — debounced PATCH fails, UI shows new value but DB has old | Medium | Medium | interview Q3; hot-spot dir `src/lib/` (8 commits/30d) |
| 7 | Malformed API payload bypasses validation and stores corrupted task data (invalid priority or time), skewing ranking output | Medium | Low | hot-spot dir `src/lib/` (8 commits/30d); CLAUDE.md Zod at API boundaries |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | Task set for "today" in a UTC-offset timezone appears on the correct local date in the daily view | "target_date is a string so timezone is irrelevant" — it matters when the server derives the default date via UTC | How the Astro page derives the default date; how target_date flows from browser input through the API to the daily view query filter | Integration (POST task with explicit date → query daily view, assert correct date) | Testing only in UTC (hides the bug entirely) |
| #2 | A task created via the API is retrievable in a subsequent request by the same user | "Toast showed success so the task was saved" — UI optimism does not confirm the DB write | How the POST handler signals success vs. error; whether the client verifies the inserted record exists; what Supabase returns on a failed INSERT | Integration (POST then GET, assert presence) | Mocking Supabase (hides real DB errors) |
| #3 | Tasks ordered P1 < P2 < P3, shorter-first within equal priority; budget cutoff lands at exactly the cumulative sum limit | "Happy-path ordering with distinct priorities proves the algorithm" — edge cases require identical priority+time and exact budget match | Whether sorting is SQL-side or JS-side; what happens at an exact budget boundary; how overdue tasks interact with today's in the filter | Unit (budget filter logic extracted) + integration (SQL ordering with fixture tasks) | Asserting current output as the oracle — implementation mirror |
| #4 | Cross-user task access returns 404 — RLS enforces ownership at the DB level | "RLS is enabled so it's safe" — the policy must be verified by an actual cross-user query against the real DB | RLS policy structure; whether the API handler checks user_id explicitly or relies solely on RLS | Integration (two authenticated sessions, cross-user PATCH/DELETE attempt) | Testing with the same user (does not prove isolation) |
| #5 | After PATCH failure, the task restores to its original position in the list; Undo within 5s fires no PATCH | "The undo toast appeared so state is correct" — toast and state are decoupled | The useRef map lifecycle; how restore-at-index works when the list is also budget-filtered | Unit (undo state machine) | Happy-path-only (PATCH success path only) |
| #6 | After a 600ms wait following an hours change, a fresh page load shows the updated value | "UI shows the new value so it was saved" — React state and DB state can diverge | How the debounce timer and PATCH interact; whether settings are read from DB or React state on page load | Integration (change hours → wait → reload → verify DB value) | Asserting React state as the source of truth |
| #7 | A direct API call with `priority: 4` returns 400, not 500 or 200 | "Zod validates client-side so the server is protected" — a direct HTTP call skips client-side validation | Whether the API route calls `safeParse` and returns 400 on failure, or passes raw data to Supabase | Integration (direct fetch with invalid payload) | Schema unit test only (does not verify the route uses the schema) |

---

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Critical-path coverage | Prove task persistence, date assignment correctness, and ranking edge cases | #1, #2, #3 | integration + unit | complete | context/changes/testing-critical-path-coverage/ |
| 2 | Interaction & isolation coverage | Prove user isolation (IDOR), undo state machine, settings persistence, and API input validation | #4, #5, #6, #7 | integration + unit | complete | context/changes/testing-interaction-isolation-coverage/ |
| 3 | CI quality gate | Wire `npm test` into CI and make Phases 1+2 coverage permanent | cross-cutting | gates (CI config) | not started | — |

**Status vocabulary** (parser literals — do not rename):
`not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`

---

## 4. Stack

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | ^4.1.7 | configured in `vitest.config.ts`; `@` alias wired; `npm test` runs `vitest run` |
| API mocking | none yet | — | see Phase 1 — research will determine whether real Supabase test project or MSW is cheaper |
| e2e | none | — | not planned; integration tests cover the same regressions at lower cost for a single-user MVP |
| accessibility | none | — | out of current rollout scope |

**Test-base profile:** sparse — 1 test file (`src/lib/schemas.test.ts`), 19 Zod schema unit tests. No API, component, or integration tests. CI does not run `npm test` (Phase 3 closes this gap).

**Stack grounding tools (current session):**
- Docs: Context7 MCP — available; not invoked for this strategy phase (no library-specific API questions); checked: 2026-06-01
- Search: Exa.ai — available but requires auth; not used for this session; checked: 2026-06-01
- Runtime/browser: Playwright MCP — not available in this session; checked: 2026-06-01
- Provider/platform: Supabase MCP (docs search) — available; not invoked at strategy phase; Cloudflare MCP — not confirmed in session; checked: 2026-06-01

---

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required now | syntactic / type drift |
| build | local + CI | required now | adapter + compile errors |
| unit + integration (`npm test`) | local + CI | required after §3 Phase 3 | logic regressions, persistence, isolation |
| pre-prod smoke | manual | optional | environment-specific failures |

---

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section fills in once the
relevant rollout phase ships; before that, the sub-section reads "TBD."

### 6.1 Adding a unit test

Place the file next to the module under test (e.g., `src/lib/foo.test.ts`). Import `describe`, `it`, `expect` from `vitest` explicitly (no globals). Construct plain objects that satisfy the relevant TypeScript types — no Supabase, no async. Reference: `src/lib/daily.test.ts` (6 cases for `applyBudgetFilter`).

### 6.2 Adding an integration test

Place the file under `src/test/integration/`. Standard shape:

```typescript
import { beforeAll, afterEach, describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "@/types";
import { signInTestUser, cleanupTestTasks } from "../supabase";

describe("my feature", () => {
  let client: SupabaseClient;
  let userId: string;

  beforeAll(async () => {
    client = await signInTestUser();
    const { data } = await client.auth.getUser();
    userId = data.user.id;
    await cleanupTestTasks(client);   // pre-clean from any prior run
  });

  afterEach(async () => { await cleanupTestTasks(client); });

  it("...", async () => {
    const result = await client.from("tasks").insert({ user_id: userId, ... }).select().single();
    const row = result.data as Task;   // cast away `any`
    // assertions
  });
});
```

Use `afterAll` instead of `afterEach` when fixtures are shared across tests in a suite (see `ranking.test.ts`). Tests run sequentially across files (`fileParallelism: false` in `vitest.config.ts`) to prevent DB interference.

### 6.3 Adding a test for a new API endpoint

TBD — see §3 Phase 1. Pattern will cover: auth setup, happy-path + error-path + unauthenticated-path for a POST/PATCH/DELETE handler.

### 6.4 Adding a test for a cross-user isolation boundary

TBD — see §3 Phase 2. Pattern will cover: two-session fixture, cross-user request, expected 404 assertion.

### 6.5 Adding a test for a new interactive React behavior

TBD — see §3 Phase 2. Pattern: undo state machine test — covers the useRef/setTimeout-based interaction loop without a full browser.

### 6.6 Per-rollout-phase notes

(Filled in as phases ship.)

---

## 7. What We Deliberately Don't Test

Exclusions agreed during the Phase 2 interview. Future contributors should
respect these unless the underlying assumption changes.

- **Topbar and navigation links** — pure layout, no business logic. Re-evaluate if nav links gain conditional logic (e.g., role-based visibility). (Source: Phase 2 interview Q5.)
- **Auth pages (sign-in, sign-up, confirm-email)** — Supabase-managed flows with no custom logic. Re-evaluate if custom auth middleware is added. (Implicit from CLAUDE.md: auth pages are standard SSR wrappers.)
- **Marketing / static pages** — no business logic, no user data. (Implicit from PRD scope.)

---

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-04
- Stack versions last verified: 2026-06-01
- AI-native tool references last verified: 2026-06-01

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
