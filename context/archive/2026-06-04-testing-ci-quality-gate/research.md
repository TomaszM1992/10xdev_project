---
date: 2026-06-04T00:00:00+00:00
researcher: Tomasz
git_commit: 10b2e2600ad3b5857d12e98a1ca163772d6e4765
branch: main
repository: 10xdev_project
topic: "CI quality gate — wire npm test into GitHub Actions (Phase 3)"
tags: [research, codebase, ci, github-actions, vitest, supabase]
status: complete
last_updated: 2026-06-04
last_updated_by: Tomasz
---

# Research: CI quality gate — wire npm test into GitHub Actions (Phase 3)

**Date**: 2026-06-04
**Researcher**: Tomasz
**Git Commit**: `10b2e2600ad3b5857d12e98a1ca163772d6e4765`
**Branch**: main
**Repository**: 10xdev_project

---

## Research Question

Wire `npm test` into the CI pipeline so every PR against main automatically runs the
full integration + unit test suite, making the quality floor from Phases 1 and 2
permanent and surfacing regressions automatically.

---

## Summary

The CI workflow currently runs lint and build only — no test step exists anywhere in
`.github/workflows/ci.yml`. The `deploy` job already uses `supabase/setup-cli@v1` for
migration pushes, so the tooling is already installed in the workflow context.

The integration tests guard against non-local Supabase URLs (`http://127.0.0.1` only,
enforced in `src/test/supabase.ts:13-15`), which means the plan **must** spin up a
local Supabase instance inside the GitHub Actions runner — not target a remote test
project. Because GitHub Actions `ubuntu-latest` runners have Docker available, and
`supabase start` binds to `127.0.0.1:54321` on the host, this URL guard passes without
any code changes.

Concretely, Phase 3 needs to add a new `test` job that:
1. Installs the Supabase CLI (`supabase/setup-cli@v1`)
2. Starts the local stack (`supabase start`)
3. Extracts the generated keys (`supabase status`)
4. Runs `npm test` with the seven required env vars

No changes to application code or test helpers are needed. Only the CI workflow changes.

---

## Detailed Findings

### CI Workflow — Current State

**File**: `.github/workflows/ci.yml`

| Job | Steps | Secrets Used |
|-----|-------|--------------|
| `ci` | checkout → setup-node → npm ci → astro sync → lint → build | SUPABASE_URL, SUPABASE_KEY |
| `deploy` | checkout → setup-node → npm ci → build → `supabase/setup-cli@v1` → `supabase db push` → wrangler | SUPABASE_URL, SUPABASE_KEY, SUPABASE_DB_URL, CLOUDFLARE_API_TOKEN |

**Critical gaps:**
- No `npm test` step in `ci` job (`.github/workflows/ci.yml:18-24`)
- No `npm test` step in `deploy` job (`.github/workflows/ci.yml:26-48`)
- `supabase/setup-cli@v1` exists only in `deploy` at line 41; the `ci` job does not install it

Both Phase 1 (`context/changes/testing-critical-path-coverage/plan.md:34`) and
Phase 2 (`context/changes/testing-interaction-isolation-coverage/plan.md:40`)
explicitly deferred adding `npm test` to CI: _"Adding `npm test` to CI — that is Phase 3."_

---

### What `npm test` Actually Runs

**File**: `package.json:10`

```
"test": "vitest run"
```

A one-shot (non-watch) execution of the full suite. Vitest version `^4.1.7`.

**Vitest config** (`vitest.config.ts`):

| Setting | Value | Effect |
|---------|-------|--------|
| `fileParallelism` | `false` | Test files run sequentially (prevents DB race conditions) |
| `globalSetup` | `["./src/test/global-setup.ts"]` | Creates test users once before all suites |
| `setupFiles` | `["./src/test/setup.ts"]` | Loads `.env.test` via dotenv before each file |
| `environment` | `node` | No jsdom, no React rendering |

---

### Test Composition — What Runs and What Each Test Needs

| File | Needs real DB? | Notes |
|------|---------------|-------|
| `src/lib/daily.test.ts` | No | Pure unit tests: `applyBudgetFilter` (6 cases), `restoreAtIndex` (5 cases) |
| `src/test/integration/api-validation.test.ts` | No | Uses `vi.mock("@/lib/supabase")`; 4 handler validation cases; passes without `supabase start` |
| `src/test/integration/task-persistence.test.ts` | **Yes** | Risk #2 — POST then GET, 2 cases |
| `src/test/integration/date-filter.test.ts` | **Yes** | Risk #1 — date assignment, 3 cases |
| `src/test/integration/ranking.test.ts` | **Yes** | Risk #3 — ordering edge cases, 3 cases |
| `src/test/integration/cross-user-isolation.test.ts` | **Yes** | Risk #4 — two-session isolation, 3 cases |
| `src/test/integration/undo-reversal.test.ts` | **Yes** | Risk #5 — undo state machine, 2 cases |
| `src/test/integration/settings-persistence.test.ts` | **Yes** | Risk #6 — settings PATCH, 3 cases |

6 of the 8 test files require a live local Supabase connection. The suite cannot be
split into a "DB-free" CI subset without losing the core integration coverage that
Phases 1 and 2 exist to provide.

---

### Environment Requirements — The Seven Variables

**Source**: `src/test/global-setup.ts:14-16`, `src/test/supabase.ts:9-11`, `.env.test.example`

| Variable | Required by | Where it comes from in CI |
|----------|------------|---------------------------|
| `SUPABASE_URL` | global-setup.ts:7, supabase.ts:4 | Hardcode `http://127.0.0.1:54321` |
| `SUPABASE_ANON_KEY` | supabase.ts:5 | `supabase status` output after `supabase start` |
| `SUPABASE_SERVICE_ROLE_KEY` | global-setup.ts:8 | `supabase status` output after `supabase start` |
| `TEST_USER_EMAIL` | global-setup.ts:9 | Hardcode `test@example.com` (ephemeral local DB) |
| `TEST_USER_PASSWORD` | global-setup.ts:10 | Hardcode `Test1234!` (ephemeral local DB) |
| `TEST_USER2_EMAIL` | global-setup.ts:11 | Hardcode `test2@example.com` (ephemeral local DB) |
| `TEST_USER2_PASSWORD` | global-setup.ts:12 | Hardcode `Test1234!` (ephemeral local DB) |

`setup.ts:2` loads `.env.test` via `dotenv` for local runs. In CI, env vars injected
via the `env:` block in the workflow step take precedence over any dotenv load, so the
`.env.test` file absence in CI is not a problem.

---

### The `127.0.0.1` Guard — The Key Constraint

**File**: `src/test/supabase.ts:13-15`

```typescript
if (!url.startsWith("http://127.0.0.1")) {
  throw new Error(`Refusing to run integration tests against non-local Supabase: ${url}`);
}
```

This guard **categorically rejects** any non-localhost URL. It prevents integration
tests from accidentally running against production Supabase.

**Implication for CI**: The test suite cannot target a remote Supabase test project
without modifying this guard. Running `supabase start` inside the GitHub Actions runner
is the path of least resistance — it binds to `127.0.0.1:54321` on the ubuntu-latest
host, satisfying the guard with no code changes.

**Alternative (not recommended)**: Loosen the guard to also allow `https://*.supabase.co`
for a dedicated test project. This requires code change + a separate remote Supabase
project. Unnecessary complexity given Docker is available on the runner.

---

### Credential Extraction Pattern

After `supabase start`, the local Supabase keys are printed to stdout and accessible
via `supabase status`. The keys are deterministic (derived from `supabase/config.toml`'s
JWT secret) and are not real secrets — they only grant access to the ephemeral CI
database that is destroyed when the runner exits.

Standard pattern to capture them in GitHub Actions:

```yaml
- run: supabase start
- name: Export Supabase test credentials
  run: |
    echo "SUPABASE_ANON_KEY=$(supabase status --output json | jq -r '.ANON_KEY')" >> $GITHUB_ENV
    echo "SUPABASE_SERVICE_ROLE_KEY=$(supabase status --output json | jq -r '.SERVICE_ROLE_KEY')" >> $GITHUB_ENV
```

`jq` is pre-installed on GitHub Actions `ubuntu-latest` runners.

---

### Job Structure Decision

Two options:

**Option A — Extend the existing `ci` job**  
Add `supabase start` + `npm test` steps at the end of the existing `ci` job.
Simpler. All quality checks in one job. Slower (tests run after lint+build sequentially).

**Option B — New `test` job (recommended)**  
Add a dedicated `test` job that runs in **parallel** with the `ci` job. Both must pass
before `deploy` runs. Gives clearer failure attribution (lint/build failures vs. test
failures are separate CI checks). Mirrors how professional CI is structured.

Recommended job dependency graph:
```
push/PR → ci (lint + build) ─┐
                              ├→ deploy (only on push to main, needs both)
push/PR → test (npm test)  ──┘
```

The `deploy` job's `needs:` should become `needs: [ci, test]`.

---

### Global-Setup Silent Bail-Out — Not a Blocker

**File**: `src/test/global-setup.ts:18-23`  
**Lesson**: `context/foundation/lessons.md:5-13`

Current behaviour: when Supabase is unreachable, global-setup catches the error, logs
a warning, and **returns early without throwing**. This means integration tests then
fail with cryptic sign-in errors rather than a clear "start Supabase first" message.

The lessons file flags this as a known gap: it suggests propagating the unavailability
signal via a `process.env` flag so non-DB tests can still pass and DB tests produce a
clear actionable error.

**Impact on Phase 3**: Not a blocker. In CI, `supabase start` runs before `npm test`,
so Supabase will be reachable and global-setup will complete normally. The silent
bail-out only matters for local dev (developer forgets to start Supabase). This is a
quality-of-life improvement that can be addressed separately.

---

### Supabase Local Port Configuration

**File**: `supabase/config.toml:10`

- API (REST/PostgREST): `54321`
- Database (PostgreSQL): `54322`

The SUPABASE_URL in the test workflow must be `http://127.0.0.1:54321`.

---

### Existing Supabase CLI in CI

The `deploy` job already uses `supabase/setup-cli@v1` at `.github/workflows/ci.yml:41-43`:

```yaml
- uses: supabase/setup-cli@v1
  with:
    version: latest
- run: supabase db push --db-url "${{ secrets.SUPABASE_DB_URL }}"
```

This confirms the team is already comfortable with Supabase CLI in the workflow context.
The `test` job will reuse the same action for a different purpose (local start vs. remote push).

---

## Code References

- `.github/workflows/ci.yml:10-24` — `ci` job (no test step)
- `.github/workflows/ci.yml:26-48` — `deploy` job (supabase/setup-cli@v1 at :41-43)
- `package.json:10` — `"test": "vitest run"`
- `package.json:63` — vitest `^4.1.7`
- `vitest.config.ts:7-9` — globalSetup, setupFiles, fileParallelism
- `src/test/global-setup.ts:7-23` — env var validation + Supabase health check + early return
- `src/test/supabase.ts:4-5` — env var reads
- `src/test/supabase.ts:13-15` — `127.0.0.1` guard ← key constraint
- `src/test/setup.ts:1-2` — dotenv loads `.env.test`
- `supabase/config.toml:10` — API port 54321
- `context/foundation/lessons.md:5-13` — silent bail-out lesson

---

## Architecture Insights

1. **No code changes needed** — the `127.0.0.1` guard is satisfied by `supabase start`
   on the GitHub Actions runner. Phase 3 is purely a CI workflow change.

2. **Credential extraction is dynamic** — ANON_KEY and SERVICE_ROLE_KEY are derived
   from `supabase status` after `supabase start`. They don't need to be stored as
   GitHub Secrets; they are ephemeral and predictable.

3. **Test credentials are not real secrets** — `TEST_USER_EMAIL/PASSWORD` and
   `TEST_USER2_EMAIL/PASSWORD` can be hardcoded in the workflow because they only
   exist in a local ephemeral Supabase instance destroyed after the runner exits.

4. **Sequential execution is already enforced** — `fileParallelism: false` is set in
   `vitest.config.ts`. No additional isolation mechanism is needed in CI.

5. **`supabase/setup-cli@v1` is the right action** — already used in the deploy job.
   Reusing it in the test job is consistent and requires no new dependencies.

---

## Historical Context (from prior changes)

- `context/changes/testing-critical-path-coverage/plan.md:34` — _"Adding `npm test` to CI — that is Phase 3."_ Explicit deferral.
- `context/changes/testing-interaction-isolation-coverage/plan.md:40` — Same deferral repeated.
- `context/changes/testing-critical-path-coverage/research.md:284` — Research considered a remote Supabase test project but the implementation chose local `supabase start` for consistency with the no-mock principle.
- `context/foundation/lessons.md:5-13` — Silent bail-out in global-setup is a known gap; does not block CI but will create confusing local-dev errors if left unaddressed.

---

## Related Research

- `context/changes/testing-critical-path-coverage/research.md` — Phase 1 research (environment setup, Supabase local stack decisions)
- `context/changes/testing-interaction-isolation-coverage/research.md` — Phase 2 research (second test user, cross-user isolation)

---

## Open Questions

1. **`supabase start` startup time in CI**: Supabase local stack (Docker-based) can take
   30–90 seconds to start. The workflow will need to wait for health before running tests.
   `supabase status` only returns after the stack is ready, so sequencing
   `supabase start` → `supabase status` → `npm test` should be sufficient.

2. **Silent bail-out improvement**: Should the global-setup fix (propagate
   `process.env.SUPABASE_UNAVAILABLE`) be bundled into Phase 3 or left for a separate
   change? It improves local DX but is not required for the CI gate to work.
   Recommendation: leave for a follow-up; Phase 3 is purely a workflow change.

3. **Parallel vs. sequential test+ci jobs**: If `supabase start` takes ~60s, running
   tests in parallel with lint+build means test runtime doesn't extend total CI time
   (lint+build also takes ~60s). This makes the parallel job structure clearly worth it.
