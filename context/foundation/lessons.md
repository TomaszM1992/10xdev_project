# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Integration test helpers that delete data must guard against non-local environments

**Context**: src/test/supabase.ts — cleanupTestTasks helper

**Problem**: `cleanupTestTasks` deletes ALL tasks for the test user unconditionally. If .env.test is accidentally pointed at a staging or production Supabase project, all that user's data is silently wiped.

**Rule**: [fill in your rule here]

**Applies to**: [fill in scope here]
