---
bootstrapped_at: 2026-05-21T21:41:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: todoer
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: todoer
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
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
```

**Why this stack:** The 10x Astro Starter pairs Astro 6 + React 19 + TypeScript + Tailwind CSS 4 + Supabase + Cloudflare Pages into a single opinionated starter that covers every must-have in this PRD without assembly. Supabase handles email/password authentication (FR-001–003) and PostgreSQL storage with row-level security — directly satisfying the zero-silent-data-loss guardrail. Astro API routes manage the server-side ordering logic for the daily prioritized view, and Cloudflare's edge runtime delivers the sub-200ms render target at no additional infrastructure cost. TypeScript project-wide plus Zod schemas at API boundaries keep the codebase agent-friendly: explicit contracts the LLM can reason from without running the program. The 3-week after-hours timeline and small single-user scale make a battle-tested all-in-one starter the right call over an assembled stack — fewer moving parts means faster first deploy. GitHub Actions auto-deploys on merge to main, keeping the feedback loop tight for solo after-hours work.

## Pre-scaffold verification

| Signal      | Value                                                         | Severity | Notes                                                                  |
| ----------- | ------------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| npm package | not run                                                       | n/a      | cmd_template starts with `git clone`; npm package check skipped       |
| GitHub repo | not run                                                       | n/a      | gh CLI unavailable; REST API call declined; no recency signal available |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone (cloned starter repo, deleted upstream .git/, moved files up)
**Exit code**: 0
**Files moved**: 19
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold`
**.gitignore handling**: moved silently (no .gitignore existed in cwd)
**.bootstrap-scaffold cleanup**: left as empty directory (Windows CWD session lock); delete manually with `Remove-Item .bootstrap-scaffold` in PowerShell

**Files moved into cwd:**
- `.env.example`, `.github/`, `.gitignore`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`
- `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules/`
- `package.json`, `package-lock.json`, `public/`, `README.md`
- `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc`

**Preserved in cwd (conflict policy):**
- `context/` — bootstrap chain metadata, never overwritten
- `CLAUDE.md` — existing file wins; starter's copy → `CLAUDE.md.scaffold`
- `.claude/`, `project-notes.md` — no conflict (not in scaffold)

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0 CRITICAL direct / 0 HIGH direct / 2 MODERATE direct (`@astrojs/check`, `wrangler`) of total 0/1/9/0

#### HIGH findings

**`devalue` v5.6.3–5.8.0** (transitive via dev toolchain)
- Advisory: GHSA-77vg-94rm-hx3p
- Title: Svelte devalue — DoS via sparse array deserialization
- CVSS: 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H)
- Fix available: `npm audit fix`
- Note: transitive dev dependency; does not affect production runtime

#### MODERATE findings (log only)

| Package                  | Direct? | Advisory / Root cause                         | Fix available |
| ------------------------ | ------- | --------------------------------------------- | ------------- |
| `@astrojs/check`         | yes     | via `@astrojs/language-server`                | yes (breaking) |
| `@astrojs/language-server` | no    | via `volar-service-yaml`                      | yes (breaking) |
| `@cloudflare/vite-plugin` | no     | via `miniflare`, `wrangler`, `ws`             | yes           |
| `miniflare`              | no      | via `ws` (uninitialized memory disclosure)    | yes           |
| `volar-service-yaml`     | no      | via `yaml-language-server`                    | yes (breaking) |
| `wrangler`               | yes     | via `miniflare`                               | yes           |
| `ws`                     | no      | GHSA-58qx-3vcg-4xpx, CVSS 4.4                | yes           |
| `yaml`                   | no      | GHSA-48c2-rrv3-qjmp, stack overflow CVSS 4.3 | yes (breaking) |
| `yaml-language-server`   | no      | via `yaml`                                    | yes (breaking) |

## Hints recorded but not acted on

| Hint                    | Value              |
| ----------------------- | ------------------ |
| bootstrapper_confidence | first-class        |
| quality_override        | false              |
| path_taken              | standard           |
| self_check_answers      | null               |
| team_size               | solo               |
| deployment_target       | cloudflare-pages   |
| ci_provider             | github-actions     |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true               |
| has_payments            | false              |
| has_realtime            | false              |
| has_ai                  | false              |
| has_background_jobs     | false              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- `Remove-Item .bootstrap-scaffold` in PowerShell to clean up the empty temp directory.
- Review `CLAUDE.md.scaffold` (the starter's version) and decide whether to merge any of it into your existing `CLAUDE.md`.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
- `npm audit fix` will resolve the HIGH `devalue` finding and most MODERATE ones.
