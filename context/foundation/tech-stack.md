---
starter_id: 10x-astro-starter
package_manager: npm
project_name: todoer
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

The 10x Astro Starter pairs Astro 6 + React 19 + TypeScript + Tailwind CSS 4 + Supabase + Cloudflare Pages into a single opinionated starter that covers every must-have in this PRD without assembly. Supabase handles email/password authentication (FR-001–003) and PostgreSQL storage with row-level security — directly satisfying the zero-silent-data-loss guardrail. Astro API routes manage the server-side ordering logic for the daily prioritized view, and Cloudflare's edge runtime delivers the sub-200ms render target at no additional infrastructure cost. TypeScript project-wide plus Zod schemas at API boundaries keep the codebase agent-friendly: explicit contracts the LLM can reason from without running the program. The 3-week after-hours timeline and small single-user scale make a battle-tested all-in-one starter the right call over an assembled stack — fewer moving parts means faster first deploy. GitHub Actions auto-deploys on merge to main, keeping the feedback loop tight for solo after-hours work.
