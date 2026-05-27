# First Deployment: todoer → Cloudflare Workers

## Context

The project is a fully built Astro 6 SSR app with the `@astrojs/cloudflare` adapter targeting Cloudflare Workers. The code builds cleanly in CI (lint + build pass), but there is no deploy step in CI and the Worker has never been pushed to Cloudflare. This plan covers:
- Fixing the Worker name before it is registered on Cloudflare
- Wiring a `wrangler deploy` script and CI deploy job
- Creating `.dev.vars` for local development
- Manual gates the user must complete before the agent can deploy

**Platform decision source:** `context/foundation/infrastructure.md` → Cloudflare Workers + Pages  
**Stack source:** `context/foundation/tech-stack.md` → `deployment_target: cloudflare-workers`

---

## What the agent will change

### 1. `wrangler.jsonc` — rename Worker
- Change `name` field from `"10x-astro-starter"` → `"todoer"`
- Everything else stays as-is (compatibility_date, nodejs_compat, assets binding, observability)

### 2. `package.json` — add deploy script
Add to `scripts`:
```json
"deploy": "wrangler deploy"
```

### 3. `.github/workflows/ci.yml` — add deploy job
Split current single `ci` job into two jobs:

**`ci` job** (unchanged, runs on all pushes and PRs):
- checkout → setup-node 22 → npm ci → astro sync → lint → build (with SUPABASE_URL + SUPABASE_KEY secrets)

**`deploy` job** (new, runs only on push to `main`, requires `ci` to pass):
```yaml
deploy:
  needs: ci
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: npm
    - run: npm ci
    - run: npm run build
      env:
        SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
        SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
    - uses: cloudflare/wrangler-action@v3
      with:
        apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### 4. `.dev.vars` — create local secrets file
Create from `.env.example` structure (gitignored):
```
SUPABASE_URL=
SUPABASE_KEY=
```
User fills in real values for local `wrangler dev` sessions.

---

## Manual gates (user must complete before agent deploys)

These steps require a browser or interactive terminal — the agent cannot do them.

**Gate 1 — Cloudflare account**
- Create a free Cloudflare account at cloudflare.com if you don't have one.

**Gate 2 — Authenticate wrangler locally**
Run in this terminal:
```
! npx wrangler login
```
This opens a browser OAuth flow. The agent will verify auth by running `npx wrangler whoami`.

**Gate 3 — Set production secrets on the Worker**
Run interactively (each prompts for the value):
```
! npx wrangler secret put SUPABASE_URL
! npx wrangler secret put SUPABASE_KEY
```
Use the values from your Supabase project dashboard (Settings → API).

**Gate 4 — Add GitHub repository secret for CI/CD**
1. In the Cloudflare dashboard → My Profile → API Tokens → Create Token
2. Use template: "Edit Cloudflare Workers" → scope to your account + the `todoer` Worker
3. Copy the token
4. In GitHub: repo → Settings → Secrets → Actions → New secret
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: the token you just copied

**Gate 5 — Disable Auto Minify (prevents React hydration bugs)**
Cloudflare dashboard → your zone → Speed → Optimization → Content Optimization → Auto Minify → disable HTML, CSS, JS.
(Only relevant once a custom domain is attached. Skip for initial workers.dev deploy.)

---

## Deploy execution (agent runs after gates are complete)

1. `npm run build` — verify build passes locally with real secrets in `.dev.vars`
2. `npx wrangler deploy` — first deploy, registers the `todoer` Worker on Cloudflare
3. `npx wrangler tail` — start log stream in second terminal
4. Open the deployed URL (`https://todoer.<account-subdomain>.workers.dev`) in browser

---

## Verification

- [ ] `npx wrangler whoami` shows the correct account
- [ ] `npx wrangler deploy` exits 0 and prints the workers.dev URL
- [ ] The workers.dev URL loads the app (sign-in page renders, no 500)
- [ ] `npx wrangler tail` shows a clean HTTP 200 for the page load
- [ ] Sign-up flow completes without error (Supabase secrets are wired correctly)
- [ ] Push a commit to `main` → GitHub Actions runs both `ci` and `deploy` jobs and both pass

---

## Execution results (2026-05-23)

All steps completed successfully. Actual outcomes:

| Step | Planned | Actual |
|---|---|---|
| `wrangler.jsonc` name | Rename to `todoer` | Already `todoer` — no change needed |
| `package.json` deploy script | Add `"deploy": "wrangler deploy"` | Done |
| `.github/workflows/ci.yml` deploy job | Add `deploy` job | Done |
| `.dev.vars` | Create from `.env.example` | Done (gitignored) |
| Gate 2 — wrangler login | User runs `! npx wrangler login` | Already authenticated |
| Gate 3 — Wrangler secrets | User runs `wrangler secret put` | Already set (SUPABASE_URL, SUPABASE_KEY) |
| Gate 4 — GitHub secret | User adds CLOUDFLARE_API_TOKEN | Set (confirmed via `gh secret list`) |
| Wrangler auto-provisioned SESSION KV | Not planned | `todoer-session` KV namespace created automatically by the adapter |
| First deploy | `npx wrangler deploy` | Succeeded — app live |

**Live URL:** https://todoer.tomek-m-osw.workers.dev  
**Verified:** `/ → 200`, `/auth/signin → 200`, `/dashboard` (unauthenticated) `→ 302`

**PR:** https://github.com/TomaszM1992/10xdev_project/pull/1

---

## Files modified

| File | Change |
|---|---|
| `wrangler.jsonc` | No change needed (name was already `todoer`) |
| `package.json` | Added `"deploy": "wrangler deploy"` script |
| `.github/workflows/ci.yml` | Added `deploy` job (wrangler-action@v3, main-only) |
| `.dev.vars` | Created (gitignored) with empty SUPABASE_URL and SUPABASE_KEY keys |
