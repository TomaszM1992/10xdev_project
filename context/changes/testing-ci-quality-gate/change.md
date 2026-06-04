---
change_id: testing-ci-quality-gate
title: Wire npm test into CI as a permanent quality gate
status: complete
created: 2026-06-04
updated: 2026-06-04
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md:
"CI quality gate".
Risks covered: cross-cutting (all risks, Phases 1+2 coverage).
Test types planned: gates (CI config).
Risk response intent: Wire `npm test` into the CI pipeline so every PR
against main automatically runs the full integration+unit suite, making
the quality floor permanent and surfacing Phases 1+2 regressions
automatically.
