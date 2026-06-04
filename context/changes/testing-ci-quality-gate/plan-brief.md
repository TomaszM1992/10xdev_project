# CI Quality Gate — Plan Brief

> Full plan: `context/changes/testing-ci-quality-gate/plan.md`
> Research: `context/changes/testing-ci-quality-gate/research.md`

## What & Why

Wire `npm test` into GitHub Actions so every PR to `main` automatically runs the full
unit + integration suite built in Phases 1 and 2. Without this gate the quality floor
is purely local — a broken push won't be caught until a developer notices a regression.
Bundle a small fix to the global-setup bail-out signal so that forgetting `supabase start`
locally yields an actionable error, not a confusing auth failure.

## Starting Point

The CI workflow runs lint + build only. No test step exists anywhere in
`.github/workflows/ci.yml`. The `deploy` job already uses `supabase/setup-cli@v1` for
migration pushes, so the pattern is proven in the same file. The test helpers have a
silent bail-out when Supabase is unreachable — a known gap documented in `lessons.md`.

## Desired End State

Every PR triggers two parallel GitHub Actions checks: `ci` (lint + build) and `test`
(full `npm test` suite with local Supabase). Both must be green before `deploy` runs.
Locally, stopping Supabase and running `npm test` produces a clear skip message on each
integration test instead of a cryptic sign-in failure.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| CI approach: local Supabase vs. remote test project | Local `supabase start` in GitHub Actions runner | `src/test/supabase.ts:13` guards against non-`127.0.0.1` URLs; Docker is available on `ubuntu-latest` so no code change is needed | Research |
| Job structure: extend `ci` vs. new parallel job | New `test` job parallel to `ci` | Lint/build failures and test failures get distinct CI checks; parallel run means zero added wall-clock time | Plan |
| Test credentials: GitHub Secrets vs. hardcode | Hardcode in workflow `env:` | Credentials protect an ephemeral local Docker DB destroyed when the runner exits — they are not real secrets | Plan |
| `ANON_KEY` / `SERVICE_ROLE_KEY` sourcing | Dynamic extraction from `supabase status` | Keys are generated per `supabase start` run from the local JWT secret; pre-storing them as secrets would be fragile | Research |
| Bundle bail-out fix | Yes, in same phase | The fix is two small additions to files already in scope; keeping it separate would be unnecessary overhead | Plan |

## Scope

**In scope:**
- New `test` job in `.github/workflows/ci.yml`
- `deploy` job `needs:` updated to `[ci, test]`
- `global-setup.ts` sets `SUPABASE_UNAVAILABLE` flag on health-check failure
- `supabase.ts` `signIn()` checks flag and throws actionable error
- `test-plan.md` Phase 3 status updated to `complete`

**Out of scope:**
- UTC date defaulting bug in `daily.astro` (deferred from Phase 1)
- `jsdom` environment / `AbortController` undo testing (Phase 2 gap, still deferred)
- Modifying the `http://127.0.0.1` URL guard
- Remote Supabase test project

## Architecture / Approach

The `test` job mirrors the structure of the `deploy` job: install Supabase CLI →
start the local stack → extract generated keys → run the suite. Credentials flow via
`$GITHUB_ENV` (dynamic keys) and hardcoded `env:` (static test-user credentials).
The bail-out fix is a two-file coordination: `global-setup.ts` sets a flag; `signIn()`
checks it before touching the network.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Wire CI + fix bail-out | Permanent test gate on every PR; actionable local DX error | `supabase status --output json` key name varies by CLI version — verify `ANON_KEY` / `anon_key` before merging |

**Prerequisites:** Local Supabase stack passes `npm test` (Phases 1 + 2 already complete)  
**Estimated effort:** ~1 session, single phase

## Open Risks & Assumptions

- `supabase status --output json` key names (`ANON_KEY` vs `anon_key`) depend on the
  CLI version; the plan uses a jq `//` fallback but the implementer should verify with
  the installed version
- `supabase start` takes 30–90 s; the 15-minute job timeout is generous but `supabase
  start` blocks until ready, so no explicit wait loop is needed

## Success Criteria (Summary)

- `ci` and `test` jobs appear in parallel on every PR to `main`; `test` is green
- Stopping local Supabase and running `npm test` shows `"Integration tests require Supabase: run 'npx supabase start' first"` on each integration test (not a cryptic auth error)
- `deploy` requires both `ci` and `test` to pass before running
