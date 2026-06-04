# CI Quality Gate Implementation Plan

## Overview

Wire `npm test` into GitHub Actions CI so every PR to main automatically runs the
full unit + integration suite, making the quality floor from Phases 1 and 2
permanent. Bundle a small fix to the global-setup bail-out signal so that when
Supabase is not running locally, integration tests fail with a clear actionable
message rather than a cryptic sign-in error.

## Current State Analysis

- `.github/workflows/ci.yml` has two jobs: `ci` (lint + build on every push/PR) and
  `deploy` (needs `ci`, push-to-main only). Neither job runs `npm test`.
- `supabase/setup-cli@v1` is already used in the `deploy` job at line 41 for
  `supabase db push` — the same action is reused for the new `test` job.
- `npm test` executes `vitest run` (package.json:10); vitest.config.ts sets
  `fileParallelism: false`, `globalSetup: ["./src/test/global-setup.ts"]`, and
  `setupFiles: ["./src/test/setup.ts"]`.
- `src/test/supabase.ts:13-15` enforces `SUPABASE_URL` starts with
  `http://127.0.0.1` — the test suite cannot target a remote Supabase project
  without a code change. Running `supabase start` inside the GitHub Actions
  `ubuntu-latest` runner (which has Docker) satisfies this guard.
- Seven env vars are required; `ANON_KEY` and `SERVICE_ROLE_KEY` are generated
  dynamically by the local Supabase stack and extracted via `supabase status`.
  Test user credentials are ephemeral (local Docker DB, destroyed after the runner
  exits) and are hardcoded in the workflow.
- `global-setup.ts:20-22`: when the Supabase health check fails, the function logs
  a warning and returns early without setting any signal. Downstream `signIn()` calls
  then throw a cryptic auth error instead of an actionable "start Supabase" message.

## Desired End State

Every PR to `main` triggers three GitHub Actions checks in parallel:
`ci` (lint + build) and `test` (npm test with local Supabase). The `deploy` job
requires both to pass. Locally, running `npm test` with Supabase stopped produces a
clear per-integration-test error message rather than a cryptic sign-in failure.

### Key Discoveries

- `supabase/setup-cli@v1` with `supabase start` on `ubuntu-latest` binds to
  `127.0.0.1:54321`, satisfying the URL guard with no code changes
  (`src/test/supabase.ts:13`)
- The `ANON_KEY` and `SERVICE_ROLE_KEY` must be captured from `supabase status`
  after `supabase start`; they are non-deterministic across different JWT secrets
  but consistent within one `supabase start` session
- `setup.ts:2` loads `.env.test` via dotenv; when the file is absent in CI,
  dotenv silently no-ops and the env vars injected by the workflow `env:` block
  take precedence — no change needed in `setup.ts`
- The `test` job does NOT need `npx astro sync` — test files only import plain
  TypeScript modules resolved via the `@/` alias in `vitest.config.ts`
- The bail-out signal needs two coordinated changes: `global-setup.ts` sets the
  flag; `supabase.ts`'s `signIn()` checks it

## What We're NOT Doing

- Fixing the UTC date defaulting bug in `daily.astro` (deferred from Phase 1)
- Adding the `jsdom` environment or testing the undo `AbortController` path (out of
  Phase 2 scope, still deferred)
- Switching to a remote Supabase test project or using MSW mocks
- Modifying the `http://127.0.0.1` URL guard in `src/test/supabase.ts`

---

## Phase 1: Wire CI test job and fix local bail-out signal

### Overview

A single coherent change: the GitHub Actions workflow gets a `test` job that runs the
full suite against a local Supabase stack, and the test helpers get the bail-out fix
so local runs without Supabase produce actionable errors. Close out the change by
marking Phase 3 complete in the test plan.

### Changes Required

#### 1. New `test` job in the CI workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Add a `test` job that runs in parallel with the existing `ci` job. The job
installs the Supabase CLI, starts the local stack, extracts the generated keys, and
runs `npm test` with all seven required env vars. The `deploy` job's `needs:` is
updated to require both `ci` and `test`.

**Contract**: The new job block and the updated `deploy` needs. The credential
extraction step is the non-obvious part — `supabase status --output json` emits a JSON
object; the exact key names should be verified by running it locally (expected:
`ANON_KEY`, `SERVICE_ROLE_KEY`; the `// .<lowercase>` jq fallback handles version
differences):

```yaml
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase start
      - name: Export Supabase test credentials
        run: |
          STATUS=$(supabase status --output json)
          echo "SUPABASE_ANON_KEY=$(echo "$STATUS" | jq -r '.ANON_KEY // .anon_key')" >> $GITHUB_ENV
          echo "SUPABASE_SERVICE_ROLE_KEY=$(echo "$STATUS" | jq -r '.SERVICE_ROLE_KEY // .service_role_key')" >> $GITHUB_ENV
      - run: npm test
        env:
          SUPABASE_URL: http://127.0.0.1:54321
          SUPABASE_ANON_KEY: ${{ env.SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ env.SUPABASE_SERVICE_ROLE_KEY }}
          TEST_USER_EMAIL: test@example.com
          TEST_USER_PASSWORD: Test1234!
          TEST_USER2_EMAIL: test2@example.com
          TEST_USER2_PASSWORD: Test1234!

  deploy:
    needs: [ci, test]
    ...
```

---

#### 2. Set `SUPABASE_UNAVAILABLE` flag in global-setup

**File**: `src/test/global-setup.ts`

**Intent**: When the Supabase health check fails, propagate the unavailability signal
via a `process.env` flag before returning. This coordinates with the `signIn()` check
added in change 3 so integration tests surface a clear error rather than a cryptic
auth failure.

**Contract**: In the `catch` block at lines 20-22, add
`process.env.SUPABASE_UNAVAILABLE = "true";` before the existing `console.warn` call.
The warning message may also be updated to reflect that integration tests will now
produce a clear skip message rather than a sign-in failure.

---

#### 3. Check bail-out flag at the top of `signIn()`

**File**: `src/test/supabase.ts`

**Intent**: Before attempting any network call, check whether global-setup flagged
Supabase as unavailable. If set, throw an actionable error that tells the developer
exactly what to run. This is the downstream half of the bail-out signal; without it,
the flag set in change 2 has no effect.

**Contract**: Add an early return guard as the first statement in the `signIn()`
function (before the `process.env` reads at lines 4-7):

```typescript
if (process.env.SUPABASE_UNAVAILABLE === "true") {
  throw new Error(
    "Integration tests require Supabase: run 'npx supabase start' first"
  );
}
```

---

#### 4. Mark Phase 3 complete in the test plan

**File**: `context/foundation/test-plan.md`

**Intent**: Update the phased rollout table to reflect that the CI quality gate has
shipped. This keeps the living test-plan document accurate and signals to future
contributors that the gate is in place.

**Contract**: In the Phase 3 row of the table at line 74, change `change opened`
to `complete` in the Status column.

---

#### 5. Close out the change

**File**: `context/changes/testing-ci-quality-gate/change.md`

**Intent**: Advance the change status to `complete` and timestamp the update.

**Contract**: Set `status: complete` and `updated: 2026-06-04` in the frontmatter.

---

### Success Criteria

#### Automated Verification

- `npm run lint` passes — no TypeScript errors introduced in the modified test helpers
- `npm test` (with local Supabase running) passes — all 8 test files pass end-to-end

#### Manual Verification

- Stop local Supabase (`npx supabase stop`), run `npm test` — unit tests in
  `daily.test.ts` pass, handler tests in `api-validation.test.ts` pass, all six
  integration test files fail with: `"Integration tests require Supabase: run 'npx
  supabase start' first"` (not a cryptic auth error)
- Push a PR branch → GitHub Actions shows `ci` and `test` jobs running in parallel
- `test` job passes (all tests green in the Actions tab)
- `deploy` job shows it `needs: [ci, test]` — both must be green before deployment

---

## References

- Research: `context/changes/testing-ci-quality-gate/research.md`
- Lessons (bail-out pattern): `context/foundation/lessons.md:5-13`
- Test plan Phase 3: `context/foundation/test-plan.md:74`
- Existing Supabase CLI usage: `.github/workflows/ci.yml:41-43`
- URL guard: `src/test/supabase.ts:13-15`
- Global-setup health check: `src/test/global-setup.ts:18-22`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Wire CI test job and fix local bail-out signal

#### Automated

- [x] 1.1 `npm run lint` passes
- [x] 1.2 `npm test` (with Supabase running) passes — all 8 test files green

#### Manual

- [ ] 1.3 Stop Supabase, run `npm test` — integration tests show clear "run npx supabase start" error
- [ ] 1.4 Push PR branch — `ci` and `test` jobs run in parallel in GitHub Actions
- [ ] 1.5 `test` job passes in GitHub Actions (all tests green)
- [ ] 1.6 `deploy` job requires both `ci` and `test`
