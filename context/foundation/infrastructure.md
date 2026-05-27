---
project: todoer
researched_at: 2026-05-23
recommended_platform: Cloudflare Workers + Pages
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19
  runtime: Cloudflare Workers (workerd)
  database: Supabase (external)
---

## Recommendation

**Deploy on Cloudflare Workers + Pages.**

The project is already 100% configured for this platform: `@astrojs/cloudflare` adapter is installed, `wrangler.jsonc` is in place, and `wrangler deploy` is the documented deploy command in CLAUDE.md. Switching to any other platform would require an adapter swap, CI reconfiguration, and env var injection changes — a non-trivial migration with no compensating benefit. Cloudflare's free tier (100k requests/day) covers this MVP's entire expected traffic at zero cost, and its agent-integration story (13 GA MCP servers, `llms.txt`, per-page markdown docs) is the strongest of any platform in the candidate set. The five agent-friendly criteria are all met at Pass level.

## Platform Comparison

| Platform | CLI-first | Managed | Agent docs | Stable deploy API | MCP | Total |
|---|---|---|---|---|---|---|
| **Cloudflare** | Pass | Pass | Pass | Pass | Pass | **5/5** |
| **Netlify** | Pass | Pass | Pass | Pass | Pass | **5/5** |
| **Vercel** | Pass | Pass | Pass | Pass | Pass | **5/5** |
| Railway | Pass | Partial | Pass | Pass | Pass | 4.5/5 |
| Fly.io | Pass | Partial | Partial | Pass | Partial | 3.5/5 |
| Render | Partial | Partial | Partial | Partial | Pass | 3/5 |

**Cloudflare**: `wrangler` covers every operational step — deploy, rollback, live log tailing — with deterministic exit codes and JSON output. Serverless edge runtime with no infrastructure to manage. Docs published as `llms.txt`, `llms-full.txt`, and per-page markdown with `Accept: text/markdown`. Stable versioned Workers API with scriptable deploy hooks. 13 remote MCP servers launched March 2025 (GA), including Workers deployments, observability, and D1 — the most capable agent-platform integration in the candidate set.

**Netlify**: Full Pass on all five criteria. Generous free tier (1.5M function invocations/month, 100GB bandwidth with hard-cap rather than overage billing). Official MCP server (GA February 2025) supports create, deploy, env var management. Main blocker for this project: requires adapter swap from `@astrojs/cloudflare` to `@astrojs/netlify`, and has an open bug on `edgeMiddleware` locals propagation (avoid by using standard Node function runtime). Ranked second.

**Vercel**: Full Pass on all five criteria. Excellent DX, official MCP server (GA, read-only). Docked to third because: (a) Hobby plan ToS prohibits commercial use — any production app requires Pro at $20/month; (b) an active Astro 6 esbuild parse error bug (GitHub issue #16258, unresolved as of April 2026) poses a real deployment risk; (c) requires adapter swap.

**Railway**: Partial on Managed (containers, not pure serverless) and lacks a free tier — Hobby plan starts at $5/month with no hard spending cap. Strong MCP server and docs. Not cost-competitive with Cloudflare's free tier for this use case.

**Fly.io**: Partial on Managed (needs Dockerfile) and Agent docs (no `llms.txt`, no GitHub markdown). No free tier (trial only). No CDN for static assets. Higher operational surface than other candidates.

**Render**: Partial on CLI (no `render rollback` subcommand — API/dashboard only), Managed (always-on containers, not serverless), and docs (no GitHub markdown). Free tier has 15-minute spindown — a hard blocker for SSR (30–60s cold start). Starter tier at $7/month needed for always-on.

### Shortlisted Platforms

#### 1. Cloudflare Workers + Pages (Recommended)

Already configured: zero adapter migration cost, zero CI reconfiguration, zero env var injection changes. Free tier handles 100k req/day — this MVP will never approach the limit. `wrangler` CLI covers the full operational loop. Best-in-class agent docs and MCP integration. The only meaningful unknown is the Pages-vs-Workers ambiguity in config (see Risk Register), which must be resolved on first deploy.

#### 2. Netlify

Strong alternative if Cloudflare's Workers runtime compatibility issues prove blocking. The `@astrojs/netlify` adapter is a one-package swap, the free tier is generous, and the MCP server handles the full deploy lifecycle. Main caution: avoid `edgeMiddleware` mode — run SSR via standard Node.js Lambda functions to sidestep the locals-propagation bug. Would add ~1 day of adapter migration work.

#### 3. Vercel

Best DX and documentation experience of any platform researched. Ruled to third primarily by the unresolved Astro 6 esbuild bug and the commercial-use ToS restriction on the free Hobby plan. If either of those is resolved upstream, Vercel becomes a viable swap to Netlify's position. Adapter swap cost is similar to Netlify.

## Anti-Bias Cross-Check: Cloudflare Workers + Pages

### Devil's Advocate — Weaknesses

1. **`wrangler deploy` vs `wrangler pages deploy` is unresolved.** `tech-stack.md` declares `deployment_target: cloudflare-pages` but CLAUDE.md shows `npx wrangler deploy`. These are NOT interchangeable — they deploy to different Cloudflare products with different pricing, CI hooks, analytics, and asset handling. Landing in the wrong product mid-flight requires a migration.

2. **CJS dependencies are silent build killers.** The `workerd` runtime rejects CommonJS modules (`require`, `module.exports`). Any npm package — including transitive deps from Supabase or shadcn/ui updates — that ships CJS-only output breaks the build with a cryptic esbuild message. Each new dependency is a potential runtime incompatibility.

3. **The 10ms CPU time limit (free tier) is per-request.** Each SSR request gets 10ms of CPU. The daily view's sort + filter over 200 tasks combined with Supabase query latency can exceed this, producing a Cloudflare 1101 error (blank page). Paid tier raises the limit to 30–50ms but the constraint never disappears.

4. **Cloudflare Auto Minify breaks React hydration and requires a dashboard click.** The setting is on by default in many zones and cannot be disabled via `wrangler` CLI — it's a zone-level Cloudflare dashboard setting. An agent cannot fix hydration mismatches caused by this.

5. **Env var injection is non-standard.** Production env vars come from `wrangler secret put`, not `.env` or `process.env`. Local dev uses `.dev.vars` (gitignored). CI uses Cloudflare secrets. This is different from every other platform and creates an onboarding cliff for anyone unfamiliar with Workers conventions.

### Pre-mortem — How This Could Fail

The team shipped to Cloudflare on day one. The adapter was in place, `wrangler deploy` worked immediately, and Supabase connected without issue. The first three weeks felt frictionless.

The first serious problem came from a routine dependency update. A minor shadcn/ui version bump introduced a transitive CJS-only dependency. The build failed with a cryptic esbuild error — nothing clearly indicating a CJS incompatibility. Two hours of debugging later, the root cause was found. The fix — a Vite `noExternal` override — introduced fragility that resurfaced with every subsequent dependency update, adding a standing tax on maintenance.

Six weeks in, the daily view started returning blank pages intermittently for a user who had accumulated 180+ tasks. A Cloudflare 1101 error in the logs pointed to a CPU limit breach. The fix required upgrading to the paid Workers tier and restructuring the sorting computation. The 10ms CPU budget became a permanent constraint on feature complexity.

The third failure was invisible until a Lighthouse audit flagged React hydration mismatches on the daily view. After a week of debugging component structure, someone checked the Cloudflare dashboard and found Auto Minify was enabled on the zone — a setting not captured in any config file. Disabling it required a manual dashboard click. A future zone reconfiguration could silently re-enable it with no codebase signal.

The fourth failure revealed the CI gap: the GitHub Actions workflow had been targeting `master` instead of `main`, meaning CI had never actually run on any merged commit. (Note: this has since been fixed in `.github/workflows/ci.yml`.)

### Unknown Unknowns

- **The Pages-vs-Workers split must be resolved before first deploy.** `tech-stack.md` says `cloudflare-pages`; CLAUDE.md says `wrangler deploy` (Workers). Cloudflare Pages has native GitHub auto-deploy, free unlimited static asset serving, and a separate dashboard. Workers requires explicit `wrangler deploy` in CI. The `@astrojs/cloudflare` adapter supports both, but the deploy command, pricing model, and CI integration differ. This cannot be corrected without a migration after the fact.

- **10ms CPU limit is a per-request ceiling, not a daily quota.** A single SSR request that runs complex sorting logic or blocks on a slow Supabase response will exceed the limit and return a hard error — not a slow response. Profile the daily view's server-side computation before assuming the free tier is sufficient.

- **Supabase + Workers creates a new TCP connection per request.** Workers use a V8 isolate-per-request model with no connection pooling across requests. Supabase's `@supabase/ssr` opens a fresh connection each time. For a single-user MVP this doesn't matter, but it's a scalability cliff if usage grows — use Supabase's PgBouncer in transaction mode (not session mode) proactively.

- **`wrangler secret put` is the only way to inject production secrets — there is no `.env` equivalent.** Secrets set this way are not visible in `wrangler.jsonc` and cannot be listed with their values (only names). An agent or new developer configuring a fresh environment needs to know this explicitly or secrets will silently be undefined at runtime.

- **`compatibility_date` requires periodic review.** Cloudflare gates behavior changes behind this date. An outdated date freezes the Worker on old runtime behavior (including security patches). Upgrading the date can silently change behavior if a compatibility flag's semantics changed. Treat it as a versioned dependency, not a set-and-forget config.

## Operational Story

- **Preview deploys**: On Cloudflare Pages, every push to a non-production branch creates a preview URL automatically via GitHub integration (native Pages feature). On Workers (current config), previews require a manual `wrangler deploy --env preview` with a named environment block in `wrangler.jsonc`. Resolve the Pages-vs-Workers ambiguity first — Pages previews are automatic; Workers previews require explicit CI configuration. Preview URLs are public by default; protect with Cloudflare Access if the app handles real user data during staging.

- **Secrets**: Production secrets are set via `wrangler secret put SUPABASE_URL` and `wrangler secret put SUPABASE_KEY`. Local dev uses `.dev.vars` (gitignored — copy from `.env.example`). CI uses these same Cloudflare secrets (already configured as GitHub repository secrets for the build step per CLAUDE.md). Rotation: `wrangler secret put <NAME>` overwrites in place; the Worker picks up the new value on next deploy without a code change.

- **Rollback**: `wrangler rollback [VERSION_ID]` reverts to a specific prior deployment version. List versions with `wrangler deployments list`. Typical time-to-revert: under 30 seconds. Database migrations (Supabase) do not roll back automatically — always write reversible migrations and test them before deploying code that depends on them.

- **Approval**: Destructive actions (rotate primary Supabase secret, drop a database table, delete the Cloudflare project, modify the zone's Auto Minify setting) are human-only panel operations. The agent may deploy code, set or rotate Workers secrets, tail logs, and roll back deployments unattended.

- **Logs**: `wrangler tail` streams live request and error logs to the terminal. Filter by `--status error` to show only failures, `--search "term"` for string matching, `--format json` for structured output parseable by the agent. For historical logs beyond the live tail window, use the Cloudflare dashboard's Log Explorer or Logpush (paid feature for persistent log storage).

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| ~~Pages vs Workers ambiguity causes deploy to wrong product~~ | ~~Unknown unknowns~~ | — | — | **Resolved 2026-05-25**: Workers mode confirmed — `wrangler.jsonc` has `main` field; deploy command is `npx wrangler deploy`; `tech-stack.md` updated to `cloudflare-workers`. |
| CJS dependency breaks build after npm update | Devil's advocate | M | M | Run `npm ls --why <package>` when build fails; add Vite `noExternal` for known CJS packages; pin shadcn/ui and Supabase to minor versions and review changelogs before upgrading |
| 10ms CPU limit exceeded on daily view | Devil's advocate / Pre-mortem | M | H | Profile sort+filter logic in Wrangler dev mode; move heavy computation server-side to Supabase query (ORDER BY in SQL) rather than JS; upgrade to paid Workers tier ($5/month) if needed |
| React hydration mismatch from Auto Minify | Pre-mortem | M | M | Disable Auto Minify (HTML, CSS, JS) in Cloudflare dashboard immediately on zone creation; document this manual step in deploy plan |
| Supabase connection pressure under load | Unknown unknowns | L | M | Configure Supabase connection string to use PgBouncer in transaction mode; monitor connection count via Supabase dashboard |
| Secrets undefined at runtime in new environment | Unknown unknowns | M | H | Document `wrangler secret put` flow explicitly in deploy plan; add a startup health-check that validates required env vars on first request |
| `compatibility_date` drift causes silent behavior change | Unknown unknowns | L | M | Review and update `compatibility_date` when upgrading `@astrojs/cloudflare` adapter; pin to a tested date and treat upgrade as a versioned change |
| CI never triggered (wrong branch name) | Pre-mortem / Research finding | — | — | **Already fixed**: `.github/workflows/ci.yml` updated to target `main` instead of `master` |

## Getting Started

1. **Resolve Pages vs Workers before the first deploy.** Inspect `wrangler.jsonc`: if it contains a `main` field pointing to a script entry, you are in Workers mode (`wrangler deploy`). If it contains `pages_build_output_dir`, you are in Pages mode (`wrangler pages deploy`). The project's `tech-stack.md` says `cloudflare-pages` — if that is the intent, ensure `wrangler.jsonc` has `pages_build_output_dir = "dist"` and use `wrangler pages deploy dist` as the deploy command.

2. **Authenticate wrangler.** Run `npx wrangler login` — this opens a browser to authorize the CLI with your Cloudflare account. One-time setup. For CI, generate an API token scoped to Workers (or Pages) for this project only and store it as `CLOUDFLARE_API_TOKEN` in GitHub repository secrets.

3. **Set production secrets.** Run:
   ```
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```
   Each command prompts for the value interactively. Secrets are encrypted at rest and never appear in `wrangler.jsonc`.

4. **Disable Auto Minify in the Cloudflare dashboard.** Navigate to your zone → Speed → Optimization → Content Optimization → Auto Minify. Disable HTML, CSS, and JS. This prevents React hydration mismatches and must be done before the first production traffic.

5. **Deploy and verify.** Run `npx wrangler deploy` (Workers) or `npx wrangler pages deploy dist` (Pages). After deploy, run `npx wrangler tail` in a second terminal and exercise the daily view in a browser — confirm requests appear in the log stream with HTTP 200 and no CPU limit errors (1101).

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup beyond confirming that GitHub Actions secrets are wired
- Production-scale architecture (multi-region, HA, disaster recovery)
