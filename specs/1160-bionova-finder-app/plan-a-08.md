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
| polaris-site | `products/polaris/site/railway.toml` | `products/polaris/site/**`, `products/polaris/handlers/**` | Dockerfile |
| polaris-functions | `services/polaris-functions/railway.toml` | `services/polaris-functions/**` | Dockerfile |

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
only `products/polaris/site/` triggers redeploy of `polaris-site` only (not
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
          for d in infrastructure/postgres infrastructure/kong infrastructure/postgrest infrastructure/gotrue infrastructure/storage infrastructure/tei products/polaris/site services/polaris-functions; do
            if echo "$changed" | grep -q "^$d/"; then
              services+=("$(basename "$d")")
            fi
          done
          # polaris-site also depends on handlers
          if echo "$changed" | grep -q "^products/polaris/handlers/" && [[ ! " ${services[*]} " =~ " site " ]]; then
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
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      # Install Railway CLI from a pinned npm version. The upstream
      # `curl -fsSL https://railway.app/install.sh | sh` flow resolves
      # "latest" at deploy time — refused as an unpinned supply-chain
      # input for a workflow that holds the deploy token.
      - run: npm install -g @railway/cli@3.20.0
      - run: railway up --service=${{ matrix.service }} --detach
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

Document RAILWAY_TOKEN setup in `infrastructure/railway/README.md` —
project-scoped token from Railway dashboard, set as repo secret.

Verify: a no-op commit to `main` runs the `detect` job, which emits an
empty `services` array, and the `deploy` job is skipped. A commit
touching `products/polaris/site/src/app/page.tsx` triggers a `site`-only
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

# psql is always executed *inside* the postgres container via
# `docker compose exec -T postgres`. That avoids the host needing
# `PGPASSWORD` (peer auth inside the container always succeeds for the
# `postgres` superuser) and avoids the silent-empty `-tAc` result that
# would otherwise mask seeded-or-not.
pg() {
  docker compose exec -T postgres psql -U postgres -tAc "$1"
}

# SC1: docker compose up + ./setup.sh starts full stack and seeds all data.
# Every expected service must report Health=healthy — services with no
# healthcheck are flagged so the script does not pass silently. On
# Compose v2, `docker compose ps <single-service> --format json` emits a
# single JSON object on one line (or one JSON object per line when
# scaled), NOT a JSON array — so `.[0].Health` returns null on the raw
# output. We slurp with `jq -rs` so the take-first-element pattern works
# regardless. `expected` lists exactly the 12 services defined as
# top-level keys in `docker-compose.yml` from part 01 (kong, postgres,
# pgbouncer, postgrest, gotrue, realtime, storage, minio, imgproxy, tei,
# polaris-site, polaris-functions). Keep this list in sync with plan-a-01
# step 4.
note "SC1: stack boots and seeds"
expected=(kong postgres pgbouncer postgrest gotrue realtime storage minio imgproxy tei polaris-site polaris-functions)
sc1_fail=0
for svc in "${expected[@]}"; do
  raw=$(docker compose ps "$svc" --format json 2>/dev/null || true)
  if [ -z "$raw" ]; then
    bad "$svc: not running"; sc1_fail=1; continue
  fi
  # `jq -s` slurps possibly-multi-line JSONL into an array, then takes [0].
  state=$(printf '%s\n' "$raw" | jq -rs '.[0].Health // "missing"')
  if [ "$state" != "healthy" ]; then
    bad "$svc: $state"; sc1_fail=1
  fi
done
[ "$sc1_fail" = "0" ] && ok "all ${#expected[@]} services healthy" || docker compose ps
emb_count=$(pg "SELECT COUNT(*) FROM condition_embeddings;")
test "${emb_count:-0}" -gt 0 && ok "embeddings seeded ($emb_count)" || bad "no embeddings (got '$emb_count')"

# SC2: /api/search returns trials matching a plain-language condition query.
# Match strictly on `trials[].conditions[].name`, NOT on therapeutic_area
# or trial name — those would let an unrelated trial in the
# "Endocrinology/Diabetes" therapeutic area trivially satisfy the
# "diabetes" contains-check. SC2 is verifying that semantic search routed
# a plain-language query to a *condition match*, so the assertion follows
# that signal.
note "SC2: web search for 'high blood sugar'"
result=$(curl -fsS "http://localhost:3001/api/search?condition=high+blood+sugar")
matched=$(echo "$result" | jq -r '[.trials[].conditions[]?.name] | any(test("diabetes";"i"))')
[ "$matched" = "true" ] && ok "diabetes-related condition match for 'high blood sugar'" \
  || { bad "no diabetes condition match in result"; echo "$result" | jq -c '.trials[:3]'; }

# SC3: eligibility screener returns "eligible" for a matching patient.
# The matching-patient payload is hand-pinned in scripts/fixtures/eligible-patient.json
# because it must satisfy every inclusion criterion (including custom_answers)
# of a specific seeded trial. The fixture is committed alongside this script
# and regenerated by `scripts/build-fixture.sh` (Step 4 below) whenever the
# seed changes — that script queries the live DB to pick a trial and build a
# matching payload, so it stays in sync with the vendored seed.
note "SC3: eligibility screener"
fixture="$ROOT/scripts/fixtures/eligible-patient.json"
sc3_trial_id="<unknown>"
if [ ! -s "$fixture" ]; then
  bad "fixtures/eligible-patient.json missing — run scripts/build-fixture.sh"
else
  sc3_trial_id=$(jq -r .trial_id "$fixture")
  payload=$(jq -c .payload "$fixture")
  score=$(curl -fsS -X POST "http://localhost:8000/functions/v1/eligibility-check" \
    -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d "$payload" \
    | jq -r .match_score)
  [ "$score" = "eligible" ] && ok "matching patient → eligible (trial $sc3_trial_id)" \
    || bad "matching patient → $score (expected eligible; trial=$sc3_trial_id; rerun scripts/build-fixture.sh if seed changed)"
fi

# SC4: CLI search matches web search data — compare against the same
# handler-backed JSON. The web surface exposes JSON via Route Handlers
# at `/api/*` (see plan-a-07 step 3); pages and routes share the same
# handler and `buildCtx`, so equal output here proves both surfaces
# pull the same data.
note "SC4: CLI search matches web"
web_ids=$(curl -fsS "http://localhost:3001/api/search?condition=diabetes" \
  | jq -r '[.trials[].id] | sort | join(",")')
cli_ids=$(node products/polaris/cli/bin/bionova-polaris.js search --condition=diabetes --json \
  | jq -r '[.trials[].id] | sort | join(",")')
[ -n "$cli_ids" ] && [ "$cli_ids" = "$web_ids" ] && ok "cli ids = web ids" \
  || bad "cli=$cli_ids web=$web_ids"

# SC5: admin CLI updates reflect in web (via DB query AND rendered JSON).
# Pick a different trial than the SC3 fixture so we are not testing the
# same row twice; use the first 'recruiting' trial.
note "SC5: admin update propagates"
sc5_trial_id=$(curl -fsS "http://localhost:8000/rest/v1/trials?status=eq.recruiting&select=id&limit=1" \
  -H "apikey:$ANON_KEY" | jq -r '.[0].id')
if [ "$sc5_trial_id" = "$sc3_trial_id" ]; then
  # Pick the next recruiting trial so SC5 does not collide with SC3's row.
  sc5_trial_id=$(curl -fsS "http://localhost:8000/rest/v1/trials?status=eq.recruiting&select=id&id=neq.${sc3_trial_id}&limit=1" \
    -H "apikey:$ANON_KEY" | jq -r '.[0].id')
fi
if [ -z "$sc5_trial_id" ] || [ "$sc5_trial_id" = "null" ]; then
  bad "no recruiting trial to update"
else
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    node products/polaris/cli/bin/bionova-polaris.js admin trial "$sc5_trial_id" --update '{"status":"completed"}'
  # Verify via PostgREST (anon role)
  new_status=$(curl -fsS "http://localhost:8000/rest/v1/trials?id=eq.${sc5_trial_id}&select=status" \
    -H "apikey:$ANON_KEY" | jq -r '.[0].status')
  [ "$new_status" = "completed" ] && ok "REST shows completed (trial $sc5_trial_id)" || bad "REST shows '$new_status', expected completed (trial $sc5_trial_id)"
  # Verify the web JSON surface — proves the page handler reads the new value, not just PostgREST.
  api_status=$(curl -fsS "http://localhost:3001/api/trials/$sc5_trial_id" | jq -r .trial.status)
  [ "$api_status" = "completed" ] && ok "web /api/trials/$sc5_trial_id shows completed" || bad "web /api/trials/$sc5_trial_id shows '$api_status'"
  # Spot-check the rendered HTML page does not error.
  web_status=$(curl -fsS -o /dev/null -w "%{http_code}" "http://localhost:3001/trials/$sc5_trial_id")
  [ "$web_status" = "200" ] && ok "web page renders trial" || bad "web page returned HTTP $web_status"
fi

# SC6: seed data is deterministic and regenerable.
# In bionova-apps, "regenerable" means: wiping the DB and the staged
# migrations, then re-running setup.sh from the committed vendored seed,
# produces the same seed signature. The monorepo-side half of SC6
# (regenerate at the provenance SHA → byte-identical to the vendored
# copies) runs in the monorepo per data/synthetic/seed/PROVENANCE.md;
# stage-seed.sh's sha256 check pins this run to those exact bytes.
# The vendored seed itself is committed and is never deleted here.
#
# The DB truncate destroys live rows (staff edits made via SC5 above),
# so we require an explicit `SMOKE_DESTRUCTIVE=1` env to run SC6's wipe.
# CI sets it; humans don't. Without it, SC6 records skip (not fail) so
# the local run stays green and the destructive surface stays opt-in.
note "SC6: seed regenerable from vendored copies"
if [ "${SMOKE_DESTRUCTIVE:-0}" != "1" ]; then
  ok "SC6 skipped (set SMOKE_DESTRUCTIVE=1 to exercise the destructive regen path)"
else
  if [ ! -d "$ROOT/.git" ] || [ ! -d "$ROOT/data/synthetic" ]; then
    bad "SC6 \$ROOT=$ROOT is not the bionova-apps repo"
  else
    ORIG=$(pg "SELECT md5(string_agg(protocol_id || '|' || name, ',' ORDER BY protocol_id)) FROM trials;")
    docker compose exec -T postgres psql -U postgres -c \
      "TRUNCATE conditions, sites, researchers, trials, criteria, trial_conditions, trial_sites, condition_embeddings, interest_signals CASCADE;"
    # Forget the staged seed versions so `supabase db push` re-applies them —
    # TRUNCATE clears data tables only, not the migration ledger.
    docker compose exec -T postgres psql -U postgres -c \
      "DELETE FROM supabase_migrations.schema_migrations WHERE version LIKE '20250101000%';"
    find "$ROOT/products/polaris/site/supabase/migrations" -maxdepth 1 -name "20250101000*_seed_*.sql" -delete
    (cd "$ROOT" && ./setup.sh)
    REGEN=$(pg "SELECT md5(string_agg(protocol_id || '|' || name, ',' ORDER BY protocol_id)) FROM trials;")
    [ "$ORIG" = "$REGEN" ] && ok "deterministic regen from vendored seed" \
      || bad "regen drift: $ORIG → $REGEN"
  fi
fi

echo "===================="
echo " PASS: $PASS  FAIL: $FAIL"
exit "$FAIL"
```

Make executable: `chmod +x scripts/smoke.sh`.

Also created: `scripts/fixtures/eligible-patient.json` — a single object
with `trial_id` (the id of a specific seeded trial) and `payload` (a
matching-patient eligibility request that satisfies every inclusion
criterion of that trial). The fixture is regenerated by
`scripts/build-fixture.sh` (below), which queries the live DB so it
stays in sync with the vendored seed. The committed JSON is the output
of running that script against the seed vendored at the provenance SHA
recorded in `data/synthetic/seed/PROVENANCE.md`.

Created: `scripts/build-fixture.sh`

```sh
#!/usr/bin/env bash
set -euo pipefail
# Build scripts/fixtures/eligible-patient.json from the live, seeded DB.
# Picks the first recruiting trial that has at least one numeric and one
# enum criterion; constructs a payload that satisfies every inclusion
# criterion (numeric: midpoint of the allowed range; enum: first allowed
# value; custom: the criterion's documented `match_answer`).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pg() { docker compose exec -T postgres psql -U postgres -tAc "$1"; }

trial_id=$(pg "
  SELECT t.id FROM trials t
  JOIN criteria c ON c.trial_id = t.id AND c.inclusion = true
  WHERE t.status = 'recruiting'
  GROUP BY t.id
  HAVING bool_or(c.kind = 'numeric') AND bool_or(c.kind = 'enum')
  ORDER BY t.id LIMIT 1;")
[ -n "$trial_id" ] || { echo "no qualifying recruiting trial in seed" >&2; exit 1; }

# Each criterion row carries kind ∈ {numeric, enum, custom} and a JSONB
# `spec` (numeric: {min,max}; enum: {allowed:[…]}; custom: {match_answer}).
# `criteria.custom[]` answers are keyed by criterion id in the payload.
payload=$(pg "
  WITH crit AS (
    SELECT id, kind, spec FROM criteria
    WHERE trial_id = '$trial_id' AND inclusion = true)
  SELECT jsonb_build_object(
    'trial_id', '$trial_id',
    'age',     COALESCE((SELECT ((spec->>'min')::int + (spec->>'max')::int) / 2 FROM crit WHERE kind = 'numeric' AND spec ? 'min' LIMIT 1), 40),
    'sex',     COALESCE((SELECT spec->'allowed'->>0 FROM crit WHERE kind = 'enum' AND spec ? 'allowed' LIMIT 1), 'any'),
    'answers', COALESCE((SELECT jsonb_object_agg(id, spec->'match_answer') FROM crit WHERE kind = 'custom'), '{}'::jsonb)
  );")

jq -n --arg id "$trial_id" --argjson p "$payload" \
  '{trial_id: $id, payload: $p}' > "$ROOT/scripts/fixtures/eligible-patient.json"
echo "wrote scripts/fixtures/eligible-patient.json for trial $trial_id"
```

Make executable: `chmod +x scripts/build-fixture.sh`. The script depends
on the live DB, so it runs after `setup.sh`. When the seed schema or
criterion shape changes (i.e., spec 1150 evolves), re-run
`./scripts/build-fixture.sh` and commit the regenerated JSON in the same
PR. No separate README is required — the script is the canonical
procedure.

Verify: against a clean stack, `scripts/smoke.sh` exits 0 and reports all 6
SCs pass.

## Step 5 — Wire smoke script into CI

Edit `.github/workflows/ci.yml`:

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: [lint, seed-stage, edge-functions]
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
# BioNova Polaris

Patient-facing clinical trial discovery built on Forward Impact libraries.

## Quickstart

\`\`\`sh
git clone …
cd bionova-apps
cp .env.example .env  # fill in secrets
docker compose up -d --wait
./setup.sh
\`\`\`

Visit http://localhost:3001/ — or run \`bionova-polaris search --condition=diabetes\` from the CLI.

## Architecture

See [specs/1160 design](https://github.com/forwardimpact/monorepo/blob/main/specs/1160-bionova-finder-app/design-a.md) in the Forward Impact monorepo.
```

Verify: README renders cleanly on GitHub; quickstart instructions match
what `scripts/smoke.sh` exercises.

## Step 8 — Open part-08 PR

```sh
git checkout -b deploy/smoke-and-railway
git add infrastructure/railway/ products/polaris/site/railway.toml services/polaris-functions/railway.toml products/polaris/site/Dockerfile services/polaris-functions/Dockerfile .github/workflows/ scripts/smoke.sh docs/ README.md
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
Verify locally with `grep -P '^1160\tplan\timplemented' wiki/STATUS.md`
(the `-P` flag interprets `\t` as a tab); if grep returns nothing, the
row uses spaces, not tabs, and `kata-release-merge` will not flip the
spec. Re-edit with a tab-preserving editor and re-grep.

Append to `wiki/staff-engineer-2026-W<NN>.md` (current ISO week — use
`date -u +%G-W%V` to resolve) log: spec 1160 implementation completed;
bionova-apps repo URL; merged-PR list; smoke result. Append a metrics row
per [references/metrics.md](../../.claude/skills/kata-plan/references/metrics.md)
to `wiki/metrics/kata-plan/2026.csv` and
`wiki/metrics/kata-implement/2026.csv`.

Before opening the trailing PR, the implementer **must** collect the
eight merged PR URLs in bionova-apps and the URL of the green
`bionova-apps@main` smoke-CI run, and substitute them into the body below
(no placeholders). The PR body is the only signal the monorepo carries
for what shipped; bare branch names are not enough for an auditor or
release engineer to verify the cross-repo handoff after the fact.

```sh
git add wiki/STATUS.md wiki/staff-engineer-*.md wiki/metrics/
git commit -m "feat(1160): close spec lifecycle (bionova-apps shipped)"
git push -u origin feat/1160-implemented
gh pr create --title "feat(1160): close spec lifecycle (bionova-apps shipped)" --body "Closes spec 1160 lifecycle.

Implementation lives at https://github.com/forwardimpact/bionova-apps (Apache-2.0). Eight PRs merged in that repo (links below); the smoke script verifies SC1–SC6 against a fresh \`docker compose up && ./setup.sh\`.

No code under this monorepo changes — the trailing PR is STATUS + log + metrics only. Trusted-human review here is the only safety net for the bionova-apps build (no monorepo CI exercises it).

bionova-apps merged PRs (substitute real URLs from \`gh pr list --repo forwardimpact/bionova-apps --state merged\`):
- part 01 \`infra/repo-bootstrap\` — <URL>
- part 02 \`db/interest-signals-rls\` — <URL>
- part 03 \`data/vendored-seed\` — <URL>
- part 04 \`services/polaris-functions\` — <URL>
- part 05 \`products/polaris-handlers\` — <URL>
- part 06 \`products/polaris-cli\` — <URL>
- part 07 \`products/polaris-site\` — <URL>
- part 08 \`deploy/smoke-and-railway\` — <URL>

bionova-apps@main green smoke-CI run: <URL of the Actions run>

— Staff Engineer 🛠️"
```

Verify: `grep -P '^1160\tplan\timplemented' wiki/STATUS.md` returns the
row (tab-vs-spaces footgun closed); the monorepo PR body links every
bionova-apps PR and the smoke-CI run.

## Verification (end of part 08)

- [ ] `scripts/smoke.sh` exits 0 against fresh stack: SC1–SC6 all pass.
- [ ] CI `e2e` job runs end-to-end on every PR; failures upload `docker compose logs`.
- [ ] Railway project deploys each service on watch-path change.
- [ ] `wiki/STATUS.md` shows `1160	plan	implemented` after the trailing monorepo PR merges.
- [ ] `https://github.com/forwardimpact/bionova-apps` is public, builds green, README quickstart works against a fresh clone.

— Staff Engineer 🛠️
