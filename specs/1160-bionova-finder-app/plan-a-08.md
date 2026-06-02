# Plan 1160-a-08 — Deployment + smoke tests

Wire Railway watch-path deployments per infrastructure service and product
surface, and add a single end-to-end smoke script that verifies every
spec-1160 success criterion against a freshly booted stack.

All paths are inside `bionova-apps/`.

## Step 1 — Create Railway project

Created (via Railway CLI, not committed):

```sh
railway login
railway init --name bionova-apps
railway link
```

Document the Railway project id in `.railway/project.json` (created by
the CLI) — gitignore the file but document the project name in
`infrastructure/railway/README.md`.

If Railway account access is unavailable, halt this step and document the
gap in the part-08 PR description; subsequent steps remain valid for
local-only verification.

Verify: `railway status` reports the linked project.

## Step 2 — Author Railway configs per service

Created: one `railway.toml` per service.

| Service | File | Watch path | Build |
| --- | --- | --- | --- |
| postgres | `infrastructure/postgres/railway.toml` | `infrastructure/postgres/**` | Dockerfile |
| pgbouncer | `infrastructure/pgbouncer/railway.toml` | `infrastructure/pgbouncer/**` | image |
| postgrest | `infrastructure/postgrest/railway.toml` | `infrastructure/postgrest/**` | image |
| gotrue | `infrastructure/gotrue/railway.toml` | `infrastructure/gotrue/**` | image |
| storage | `infrastructure/storage/railway.toml` | `infrastructure/storage/**` | image |
| tei | `infrastructure/tei/railway.toml` | `infrastructure/tei/**` | image |
| kong | `infrastructure/kong/railway.toml` | `infrastructure/kong/**` | Dockerfile |
| finder-site | `products/finder/site/railway.toml` | `products/finder/site/**`, `products/finder/handlers/**` | Dockerfile |
| finder-functions | `services/finder-functions/railway.toml` | `services/finder-functions/**` | Dockerfile |

Each `railway.toml` shape:

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "./Dockerfile"
watchPaths = ["infrastructure/<service>/**"]

[deploy]
restartPolicyType = "ON_FAILURE"
healthcheckPath = "/health"  # or service-specific
```

Verify: `railway up --service postgres` deploys; subsequent push touching
only `products/finder/site/` triggers redeploy of `finder-site` only (not
postgres).

## Step 3 — Wire deploy workflow

Edit `.github/workflows/deploy.yml` (skeleton from part 01). Detect
changed paths in the job and invoke `railway up --service=<name>` per
changed service via Railway's own CLI (avoids dependency on
third-party actions that hold deploy tokens):

```yaml
name: deploy
on:
  push:
    branches: [main]
jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      services: ${{ steps.changes.outputs.services }}
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 2 }
      - id: changes
        run: |
          changed=$(git diff --name-only HEAD~1 HEAD)
          services=()
          for d in infrastructure/postgres infrastructure/kong infrastructure/postgrest infrastructure/gotrue infrastructure/storage infrastructure/tei products/finder/site services/finder-functions; do
            if echo "$changed" | grep -q "^$d/"; then
              services+=("$(basename "$d")")
            fi
          done
          # finder-site also depends on handlers
          if echo "$changed" | grep -q "^products/finder/handlers/" && [[ ! " ${services[*]} " =~ " site " ]]; then
            services+=("site")
          fi
          echo "services=$(printf '%s\n' "${services[@]}" | jq -R -s 'split("\n") | map(select(length>0))' -c)" >> $GITHUB_OUTPUT
  deploy:
    needs: detect
    if: needs.detect.outputs.services != '[]'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: ${{ fromJson(needs.detect.outputs.services) }}
    steps:
      - uses: actions/checkout@v4
      - run: curl -fsSL https://railway.app/install.sh | sh
      - run: railway up --service=${{ matrix.service }} --detach
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

Document RAILWAY_TOKEN setup in `infrastructure/railway/README.md` —
project-scoped token from Railway dashboard, set as repo secret.

Verify: a no-op commit to `main` runs the `detect` job, which emits an
empty `services` array, and the `deploy` job is skipped. A commit
touching `products/finder/site/src/app/page.tsx` triggers a `site`-only
deploy.

## Step 4 — Author the success-criteria smoke script

Created: `scripts/smoke.sh`

```sh
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0; FAIL=0
note() { echo "→ $*"; }
ok()   { echo "  ✓ $*"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $*" >&2; FAIL=$((FAIL+1)); }

# SC1: docker compose up + ./setup.sh starts full stack and seeds all data.
# Every expected service must report Health=healthy — services with no
# healthcheck are flagged so the script does not pass silently.
note "SC1: stack boots and seeds"
expected=(kong postgres pgbouncer postgrest gotrue realtime storage minio imgproxy tei finder-site finder-functions)
sc1_fail=0
for svc in "${expected[@]}"; do
  state=$(docker compose ps "$svc" --format json | jq -r '.[0].Health // "missing"' 2>/dev/null || echo "missing")
  if [ "$state" != "healthy" ]; then
    bad "$svc: $state"
    sc1_fail=1
  fi
done
[ "$sc1_fail" = "0" ] && ok "all ${#expected[@]} services healthy" || docker compose ps
test "$(psql -h localhost -U postgres -tAc "SELECT COUNT(*) FROM condition_embeddings;")" -gt 0 && ok "embeddings seeded" || bad "no embeddings"

# SC2: /search returns trials matching a plain-language condition query.
# Use ?format=json so the assertion is against handler data, not template
# text — protects against false positives from nav/footer/meta tags that
# may incidentally include the word "diabetes".
note "SC2: web search for 'high blood sugar'"
result=$(curl -fsS "http://localhost:3001/search?condition=high+blood+sugar&format=json")
matched=$(echo "$result" | jq -r '[.trials[].name, .trials[].conditions[]?.name // empty, .trials[].therapeutic_area] | join(" ") | ascii_downcase | contains("diabetes")')
[ "$matched" = "true" ] && ok "diabetes-related trial returned for 'high blood sugar'" \
  || { bad "no diabetes trial in result"; echo "$result" | jq -c '.trials[:3]'; }

# SC3: eligibility screener returns "eligible" for a matching patient.
# The matching-patient payload is hand-pinned in tests/fixtures/eligible-patient.json
# because it must satisfy every inclusion criterion (including custom_answers)
# of a specific seeded trial. The fixture is committed alongside this script.
note "SC3: eligibility screener"
fixture="$ROOT/scripts/fixtures/eligible-patient.json"
[ -s "$fixture" ] || { bad "fixtures/eligible-patient.json missing"; }
if [ -s "$fixture" ]; then
  trial_id=$(jq -r .trial_id "$fixture")
  payload=$(jq -r .payload "$fixture" | jq -c .)
  score=$(curl -fsS -X POST "http://localhost:8000/functions/v1/eligibility-check" \
    -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d "$payload" \
    | jq -r .match_score)
  [ "$score" = "eligible" ] && ok "matching patient → eligible (trial $trial_id)" \
    || bad "matching patient → $score (expected eligible; check fixture against current seed)"
fi

# SC4: CLI search matches web search data — compare against the same handler
# call. PostgREST grandchild-resource filters via dotted paths require the
# embedded resource to be selected; rather than rely on REST query syntax,
# call the web surface's /search route and compare its trial list (parsed
# from a stable id attribute on TrialCard) to the CLI's --json output.
note "SC4: CLI search matches web"
web_ids=$(curl -fsS "http://localhost:3001/search?condition=diabetes&format=json" \
  | jq -r '[.trials[].id] | sort | join(",")')
cli_ids=$(node products/finder/cli/bin/bionova-finder.js search --condition=diabetes --json \
  | jq -r '[.trials[].id] | sort | join(",")')
[ -n "$cli_ids" ] && [ "$cli_ids" = "$web_ids" ] && ok "cli ids = web ids" \
  || bad "cli=$cli_ids web=$web_ids"

# SC5: admin CLI updates reflect in web (via DB query, not HTML scrape).
# Pick a different trial than the SC3 fixture so we are not testing the
# same row twice; use the first 'recruiting' trial.
note "SC5: admin update propagates"
sc5_trial_id=$(curl -fsS "http://localhost:8000/rest/v1/trials?status=eq.recruiting&select=id&limit=1" \
  -H "apikey:$ANON_KEY" | jq -r '.[0].id')
[ -n "$sc5_trial_id" ] && [ "$sc5_trial_id" != "null" ] || { bad "no recruiting trial to update"; sc5_trial_id=""; }
if [ -n "$sc5_trial_id" ]; then
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    node products/finder/cli/bin/bionova-finder.js admin trial "$sc5_trial_id" --update '{"status":"completed"}'
  # Verify via PostgREST as anon — the web surface reads the same data
  new_status=$(curl -fsS "http://localhost:8000/rest/v1/trials?id=eq.${sc5_trial_id}&select=status" \
    -H "apikey:$ANON_KEY" | jq -r '.[0].status')
  [ "$new_status" = "completed" ] && ok "REST shows completed (web reads same source)" || bad "REST shows '$new_status', expected completed"
  # Spot-check web page does not error
  web_status=$(curl -fsS -o /dev/null -w "%{http_code}" "http://localhost:3001/trials/$sc5_trial_id")
  [ "$web_status" = "200" ] && ok "web page renders trial" || bad "web page returned HTTP $web_status"
fi

# SC6: seed data is deterministic and regenerable.
# In bionova-apps, "regenerable" means: re-running setup.sh against a fresh
# stack at the same MONOREPO_SHA produces the same seed signature. The
# monorepo's own deterministic regen (story.dsl seed=42 → terrain output)
# is asserted by spec 1150's CI; bionova-apps just verifies the fetch +
# apply round-trip is stable.
note "SC6: seed regenerable from pinned SHA"
# Safety guard before any rm -rf in this section
[ -d "$ROOT/.git" ] && [ -d "$ROOT/data/synthetic" ] || { bad "SC6 \$ROOT=$ROOT is not the bionova-apps repo"; exit 1; }
ORIG=$(psql -h localhost -U postgres -tAc \
  "SELECT md5(string_agg(protocol_id || '|' || name, ',' ORDER BY protocol_id)) FROM trials;")
# Full re-run: wipe local seed copy, truncate tables, re-fetch and re-apply
rm -rf "$ROOT/data/synthetic/seed"
docker compose exec -T postgres psql -U postgres -c \
  "TRUNCATE conditions, sites, researchers, trials, criteria, trial_conditions, trial_sites, condition_embeddings, interest_signals CASCADE;"
find "$ROOT/products/finder/site/supabase/migrations" -maxdepth 1 -name "20250101000000_seed_*.sql" -delete
(cd "$ROOT" && ./setup.sh)
REGEN=$(psql -h localhost -U postgres -tAc \
  "SELECT md5(string_agg(protocol_id || '|' || name, ',' ORDER BY protocol_id)) FROM trials;")
[ "$ORIG" = "$REGEN" ] && ok "deterministic regen at SHA=$MONOREPO_SHA" \
  || bad "regen drift: $ORIG → $REGEN"

echo "===================="
echo " PASS: $PASS  FAIL: $FAIL"
exit "$FAIL"
```

Make executable: `chmod +x scripts/smoke.sh`.

Also created: `scripts/fixtures/eligible-patient.json` — a single object
with `trial_id` (the id of a specific seeded trial, derived from the
1150 story.dsl) and `payload` (a matching-patient eligibility request
that satisfies every inclusion criterion of that trial). The fixture is
the implementer's only piece of seed-aware data in this part; it must be
regenerated if the 1150 implementation changes which trials exist or what
their custom criteria are. Document the regeneration procedure in
`scripts/fixtures/README.md`.

Verify: against a clean stack, `scripts/smoke.sh` exits 0 and reports all 6
SCs pass.

## Step 5 — Wire smoke script into CI

Edit `.github/workflows/ci.yml`:

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: [lint, terrain, edge-functions]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: docker compose up -d --wait
      - run: ./setup.sh
        env:
          POSTGRES_PASSWORD: test
          JWT_SECRET: ${{ secrets.TEST_JWT_SECRET }}
          ANON_KEY: ${{ secrets.TEST_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SERVICE_ROLE_KEY }}
      - run: ./scripts/smoke.sh
        env:
          ANON_KEY: ${{ secrets.TEST_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SERVICE_ROLE_KEY }}
      - if: failure()
        run: docker compose logs --tail=200
```

Token values are test-only (low-entropy is fine — Anon and service-role
keys are scoped to the ephemeral CI Postgres instance).

Verify: CI e2e job runs against a fresh stack and reports green.

## Step 6 — Document deployment

Created:

| File | Purpose |
| --- | --- |
| `infrastructure/railway/README.md` | Railway setup, watch-path explanation, secret config |
| `docs/deployment.md` | End-to-end deployment story for staff: how to push, how to roll back, how to view logs |
| `docs/operations.md` | Day-2 operations: re-seeding, scaling TEI, rotating service-role key |

Verify: docs link from root README; `markdownlint docs/` passes.

## Step 7 — Final repo README polish

Edit `README.md` (from part 01):

```markdown
# Clinical Research Finder

Patient-facing clinical trial discovery built on Forward Impact libraries.

## Quickstart

\`\`\`sh
git clone …
cd bionova-apps
cp .env.example .env  # fill in secrets
docker compose up -d --wait
./setup.sh
\`\`\`

Visit http://localhost:3001/ — or run \`bionova-finder search --condition=diabetes\` from the CLI.

## Architecture

See [specs/1160 design](https://github.com/forwardimpact/monorepo/blob/main/specs/1160-bionova-finder-app/design-a.md) in the Forward Impact monorepo.
```

Verify: README renders cleanly on GitHub; quickstart instructions match
what `scripts/smoke.sh` exercises.

## Step 8 — Open part-08 PR

```sh
git checkout -b deploy/smoke-and-railway
git add infrastructure/railway/ products/finder/site/railway.toml services/finder-functions/railway.toml products/finder/site/Dockerfile services/finder-functions/Dockerfile .github/workflows/ scripts/smoke.sh docs/ README.md
git commit -m "deploy: railway configs + e2e smoke verifying SC1–SC6"
git push -u origin deploy/smoke-and-railway
gh pr create --title "deploy: railway configs + e2e smoke verifying SC1–SC6" --body "Implements plan-a-08 of spec 1160. CI e2e job verifies all six success criteria against a fresh stack."
```

Verify: PR CI green (all jobs); e2e job reports 6 SCs passing.

## Step 9 — Mark plan implemented in the monorepo (separate PR)

**This is a distinct PR in a distinct repository** from steps 1–8. Open
it only after the part-08 PR in `bionova-apps` has merged AND the smoke
script has passed against the merged `main` of `bionova-apps`. The PR
exists to flip the monorepo's `wiki/STATUS.md` row so
`kata-release-merge` and the storyboard see the lifecycle close.

Switch back to the monorepo working directory:

```sh
cd /path/to/monorepo
git fetch origin main && git checkout -b feat/1160-implemented origin/main
```

Edit `wiki/STATUS.md` — set the 1160 row exactly as
`1160<TAB>plan<TAB>implemented` (literal tabs, not the `\t` escape).

Append to `wiki/staff-engineer-2026-WVV.md` (current week) log: spec
1160 implementation completed; bionova-apps repo URL; merged-PR list;
smoke result. Append a metrics row per
[references/metrics.md](../../.claude/skills/kata-plan/references/metrics.md)
to `wiki/metrics/kata-plan/2026-WVV.tsv` and
`wiki/metrics/kata-implement/2026-WVV.tsv`.

```sh
git add wiki/STATUS.md wiki/staff-engineer-*.md wiki/metrics/
git commit -m "feat(1160): close spec lifecycle (bionova-apps shipped)"
git push -u origin feat/1160-implemented
gh pr create --title "feat(1160): close spec lifecycle (bionova-apps shipped)" --body "Closes spec 1160 lifecycle.

Implementation lives at https://github.com/forwardimpact/bionova-apps (Apache-2.0). Eight PRs merged in that repo (links below); the smoke script verifies SC1–SC6 against a fresh \`docker compose up && ./setup.sh\`.

No code under this monorepo changes — the trailing PR is STATUS + log + metrics only. Trusted-human review here is the only safety net for the bionova-apps build (no monorepo CI exercises it).

bionova-apps PRs:
- infra/repo-bootstrap (part 01)
- db/interest-signals-rls (part 02)
- data/terrain-pipeline (part 03)
- services/finder-functions (part 04)
- products/finder-handlers (part 05)
- products/finder-cli (part 06)
- products/finder-site (part 07)
- deploy/smoke-and-railway (part 08)

— Staff Engineer 🛠️"
```

Verify: `wiki/STATUS.md` shows `1160<TAB>plan<TAB>implemented`; the
monorepo PR body links every bionova-apps PR.

## Verification (end of part 08)

- [ ] `scripts/smoke.sh` exits 0 against fresh stack: SC1–SC6 all pass.
- [ ] CI `e2e` job runs end-to-end on every PR; failures upload `docker compose logs`.
- [ ] Railway project deploys each service on watch-path change.
- [ ] `wiki/STATUS.md` shows `1160	plan	implemented` after the trailing monorepo PR merges.
- [ ] `https://github.com/forwardimpact/bionova-apps` is public, builds green, README quickstart works against a fresh clone.

— Staff Engineer 🛠️
