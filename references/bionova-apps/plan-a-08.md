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
# Deploys run `railway up` with the RAILWAY_TOKEN secret; the GITHUB_TOKEN is
# only used to check out the repo. Least privilege is read-only.
permissions:
  contents: read
jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      services: ${{ steps.changes.outputs.services }}
    steps:
      - uses: actions/checkout@<pinned-sha> # v7 — SHA-pin, per part 01 step 9
        with: { fetch-depth: 2 }
      - id: changes
        run: |
          changed=$(git diff --name-only HEAD~1 HEAD)
          # Map each watched directory to its real Railway service name (the
          # compose/Railway service key, not the dir basename).
          declare -A svc=(
            [infrastructure/postgres]=postgres
            [infrastructure/kong]=kong
            [infrastructure/postgrest]=postgrest
            [infrastructure/gotrue]=gotrue
            [infrastructure/storage]=storage
            [infrastructure/tei]=tei
            [products/polaris/site]=polaris-site
            [services/polaris-functions]=polaris-functions
          )
          services=()
          for d in "${!svc[@]}"; do
            if echo "$changed" | grep -q "^$d/"; then services+=("${svc[$d]}"); fi
          done
          # The site bundles the shared handlers; redeploy it when they change.
          if echo "$changed" | grep -q "^products/polaris/handlers/" && [[ ! " ${services[*]} " =~ " polaris-site " ]]; then
            services+=("polaris-site")
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
      - uses: actions/checkout@<pinned-sha> # v7
      - uses: actions/setup-node@<pinned-sha> # v4
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
project-scoped token from Railway dashboard, set as repo secret. If no
Railway project is linked yet, gate the `deploy` job on the secret being
non-empty so it skips cleanly instead of standing red (a red `deploy`
should mean a genuine deploy failure).

Verify: a no-op commit to `main` runs the `detect` job, which emits an
empty `services` array, and the `deploy` job is skipped. A commit
touching `products/polaris/site/src/app/page.tsx` triggers a
`polaris-site`-only deploy.

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
# The six prose tables (rendered from story.dsl via prerequisite B) must each
# carry ≥1 row, or the prose surfaces SC4 checks have nothing to render.
for t in condition_explainers trial_faqs consent_summaries \
         site_descriptions patient_stories therapy_descriptions; do
  rows=$(pg "SELECT COUNT(*) FROM $t;")
  test "${rows:-0}" -gt 0 && ok "prose table $t seeded ($rows)" || bad "prose table $t empty (got '$rows')"
done

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

# SC4: prose surfaces render from the seed prose tables. The trial page
# exposes its FAQ + consent summary and the condition page its explainer
# via the same `/api/*` Route Handlers (see plan-a-07 step 3). Assert each
# field is present and non-empty so a dropped prose table fails loudly here,
# not as blank UI. Reuse the SC3 fixture's trial (it is a real seeded trial);
# pick any condition from the conditions table for the explainer check.
note "SC4: prose surfaces (FAQ, consent summary, explainer)"
sc4_trial_id="$sc3_trial_id"
if [ -z "$sc4_trial_id" ] || [ "$sc4_trial_id" = "<unknown>" ]; then
  sc4_trial_id=$(curl -fsS "http://localhost:8000/rest/v1/trials?select=id&limit=1" \
    -H "apikey:$ANON_KEY" | jq -r '.[0].id')
fi
trial_prose=$(curl -fsS "http://localhost:3001/api/trials/$sc4_trial_id")
faq=$(echo "$trial_prose" | jq -r '.faq // ""')
consent=$(echo "$trial_prose" | jq -r '.consentSummary // ""')
[ -n "$faq" ] && [ "$faq" != "null" ] && ok "trial $sc4_trial_id has non-empty faq" \
  || bad "trial $sc4_trial_id faq empty"
[ -n "$consent" ] && [ "$consent" != "null" ] && ok "trial $sc4_trial_id has non-empty consentSummary" \
  || bad "trial $sc4_trial_id consentSummary empty"
sc4_condition_id=$(curl -fsS "http://localhost:8000/rest/v1/conditions?select=id&limit=1" \
  -H "apikey:$ANON_KEY" | jq -r '.[0].id')
explainer=$(curl -fsS "http://localhost:3001/api/conditions/$sc4_condition_id" | jq -r '.explainer // ""')
[ -n "$explainer" ] && [ "$explainer" != "null" ] && ok "condition $sc4_condition_id has non-empty explainer" \
  || bad "condition $sc4_condition_id explainer empty"

# SC5: CLI search matches web search data — compare against the same
# handler-backed JSON. The web surface exposes JSON via Route Handlers
# at `/api/*` (see plan-a-07 step 3); pages and routes share the same
# handler and `buildCtx`, so equal output here proves both surfaces
# pull the same data.
note "SC5: CLI search matches web"
web_ids=$(curl -fsS "http://localhost:3001/api/search?condition=diabetes" \
  | jq -r '[.trials[].id] | sort | join(",")')
cli_ids=$(node products/polaris/cli/bin/bionova-polaris.js search --condition=diabetes --json \
  | jq -r '[.trials[].id] | sort | join(",")')
[ -n "$cli_ids" ] && [ "$cli_ids" = "$web_ids" ] && ok "cli ids = web ids" \
  || bad "cli=$cli_ids web=$web_ids"

# SC6: admin CLI updates reflect in web (via DB query AND rendered JSON).
# Pick a different trial than the SC3 fixture so we are not testing the
# same row twice; use the first 'recruiting' trial.
note "SC6: admin update propagates"
sc6_trial_id=$(curl -fsS "http://localhost:8000/rest/v1/trials?status=eq.recruiting&select=id&limit=1" \
  -H "apikey:$ANON_KEY" | jq -r '.[0].id')
if [ "$sc6_trial_id" = "$sc3_trial_id" ]; then
  # Pick the next recruiting trial so SC6 does not collide with SC3's row.
  sc6_trial_id=$(curl -fsS "http://localhost:8000/rest/v1/trials?status=eq.recruiting&select=id&id=neq.${sc3_trial_id}&limit=1" \
    -H "apikey:$ANON_KEY" | jq -r '.[0].id')
fi
if [ -z "$sc6_trial_id" ] || [ "$sc6_trial_id" = "null" ]; then
  bad "no recruiting trial to update"
else
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    node products/polaris/cli/bin/bionova-polaris.js admin trial "$sc6_trial_id" --update '{"status":"completed"}'
  # Verify via PostgREST (anon role)
  new_status=$(curl -fsS "http://localhost:8000/rest/v1/trials?id=eq.${sc6_trial_id}&select=status" \
    -H "apikey:$ANON_KEY" | jq -r '.[0].status')
  [ "$new_status" = "completed" ] && ok "REST shows completed (trial $sc6_trial_id)" || bad "REST shows '$new_status', expected completed (trial $sc6_trial_id)"
  # Verify the web JSON surface — proves the page handler reads the new value, not just PostgREST.
  api_status=$(curl -fsS "http://localhost:3001/api/trials/$sc6_trial_id" | jq -r .trial.status)
  [ "$api_status" = "completed" ] && ok "web /api/trials/$sc6_trial_id shows completed" || bad "web /api/trials/$sc6_trial_id shows '$api_status'"
  # Spot-check the rendered HTML page does not error.
  web_status=$(curl -fsS -o /dev/null -w "%{http_code}" "http://localhost:3001/trials/$sc6_trial_id")
  [ "$web_status" = "200" ] && ok "web page renders trial" || bad "web page returned HTTP $web_status"
fi

# SC7: seed data is deterministic and regenerable FROM THE VENDORED DSL,
# inside bionova-apps. "Regenerable" means: re-running the local render
# (`scripts/build-seed.sh`) against the vendored `story.dsl` + `prose-cache.json`
# reproduces the rendered SQL/JSONL byte-identical to the committed
# `data/synthetic/SEED.sha256` anchor (see plan-a-03 step 4). This half is
# NON-DESTRUCTIVE — it only renders into the disposable `data/synthetic/.build/`
# and checksums; it never touches the live DB. The monorepo-side half (the same
# render at the provenance SHA → identical bytes) is recorded in
# `data/synthetic/PROVENANCE.md`; `SEED.sha256` pins both runs to the same bytes.
note "SC7: seed regenerable from vendored DSL"
if [ ! -d "$ROOT/.git" ] || [ ! -d "$ROOT/data/synthetic" ]; then
  bad "SC7 \$ROOT=$ROOT is not the bionova-apps repo"
else
  bash "$ROOT/scripts/build-seed.sh"
  if (cd "$ROOT/data/synthetic/.build/products/polaris/site/supabase/migrations" \
      && sha256sum -c "$ROOT/data/synthetic/SEED.sha256" >/dev/null); then
    ok "deterministic render matches data/synthetic/SEED.sha256"
  else
    bad "render drift: rendered SQL/JSONL does not match data/synthetic/SEED.sha256"
  fi
fi

# SC7 (DB half): a `supabase db push` of the freshly staged migrations
# reproduces identical seeded data. This drops the seeded tables and re-applies
# the staged migrations, destroying staff edits made via SC6 above, so it is
# gated behind an explicit `SMOKE_DESTRUCTIVE=1` env. CI sets it; humans don't.
# Without it, the DB half records skip (not fail) so the local run stays green
# and the destructive surface stays opt-in.
note "SC7: staged migrations reproduce identical data"
if [ "${SMOKE_DESTRUCTIVE:-0}" != "1" ]; then
  ok "SC7 DB half skipped (set SMOKE_DESTRUCTIVE=1 to exercise the destructive db-push path)"
elif [ ! -d "$ROOT/.git" ] || [ ! -d "$ROOT/data/synthetic" ]; then
  bad "SC7 \$ROOT=$ROOT is not the bionova-apps repo"
else
  ORIG=$(pg "SELECT md5(string_agg(protocol_id || '|' || name, ',' ORDER BY protocol_id)) FROM trials;")
  # Reset to a pristine schema before re-applying. The seed migrations are not
  # idempotent (plain INSERTs and unguarded CREATE POLICY), so truncating data
  # is not enough — re-pushing onto surviving tables/policies fails. DROP the
  # seeded tables (CASCADE clears their policies and dependents) and forget every
  # recorded version so setup.sh's `db push --include-all` rebuilds each object
  # and row from scratch. Default privileges re-grant the new tables.
  docker compose exec -T postgres psql -U postgres -c \
    "DROP TABLE IF EXISTS conditions, sites, researchers, trials, criteria, trial_conditions, trial_sites, condition_explainers, trial_faqs, consent_summaries, site_descriptions, patient_stories, therapy_descriptions, condition_embeddings, interest_signals CASCADE;"
  docker compose exec -T postgres psql -U postgres -c \
    "DELETE FROM supabase_migrations.schema_migrations WHERE version LIKE '20250101%' OR version LIKE '20260601%';"
  (cd "$ROOT" && ./setup.sh)
  REGEN=$(pg "SELECT md5(string_agg(protocol_id || '|' || name, ',' ORDER BY protocol_id)) FROM trials;")
  [ "$ORIG" = "$REGEN" ] && ok "deterministic db push from rendered seed" \
    || bad "db-push drift: $ORIG → $REGEN"
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
of running that script against the seed rendered from the DSL vendored at
the provenance SHA recorded in `data/synthetic/PROVENANCE.md`.

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

Verify: against a clean stack, `scripts/smoke.sh` exits 0 and reports all 7
SCs pass.

## Step 5 — Wire smoke script into CI

Fill in `.github/workflows/check-e2e.yml` (scaffolded in part 01; SHA-pin
both actions per part 01 step 9). It is a standalone per-concern workflow —
no `needs:` on other jobs; the other concerns run as their own workflows:

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned-sha> # v7
      - uses: oven-sh/setup-bun@<pinned-sha> # v2
        with:
          bun-version-file: .tool-versions
      - run: bun install
      - run: cp .env.example .env
      - run: |
          # Render the seed BEFORE compose up — polaris-functions bind-mounts the JSONL.
          bash scripts/build-seed.sh
          # Pre-fetch the TEI model on the host and point tei at the local
          # copy — the container cannot fetch through the runner's
          # TLS-inspecting proxy (part 01 step 7).
          TEI_MODEL_CACHE="$HOME/.cache/bionova-tei-model/bge-small-en-v1.5" \
            bash scripts/fetch-tei-model.sh
          printf 'TEI_MODEL_ID=/data\nTEI_MODEL_SOURCE=%s\n' \
            "$HOME/.cache/bionova-tei-model/bge-small-en-v1.5" >> .env
          docker compose up -d --wait
          ./setup.sh
          SMOKE_DESTRUCTIVE=1 ./scripts/smoke.sh
      - if: failure()
        run: docker compose logs --tail=200
```

The `.env.example` placeholder values suffice — the anon and service-role
keys are scoped to the ephemeral CI Postgres instance, so no repository
secrets are needed.

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
git commit -m "deploy: railway configs + e2e smoke verifying SC1–SC7"
git push -u origin deploy/smoke-and-railway
gh pr create --title "deploy: railway configs + e2e smoke verifying SC1–SC7" --body "Implements plan-a-08 of spec 1160. CI e2e job verifies all seven success criteria against a fresh stack."
```

Verify: PR CI green (all jobs); e2e job reports 7 SCs passing.

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
bionova-apps repo URL; merged-PR list; smoke result. Append a metrics row per
[references/metrics.md](../../.claude/skills/kata-plan/references/metrics.md) to
`wiki/metrics/kata-plan/2026.csv` and `wiki/metrics/kata-implement/2026.csv`.

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

Implementation lives at https://github.com/forwardimpact/bionova-apps (Apache-2.0). Eight PRs merged in that repo (links below); the smoke script verifies SC1–SC7 against a fresh \`docker compose up && ./setup.sh\`.

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

- [ ] `scripts/smoke.sh` exits 0 against fresh stack: SC1–SC7 all pass.
- [ ] CI `e2e` job runs end-to-end on every PR; failures upload
      `docker compose logs`.
- [ ] Railway project deploys each service on watch-path change.
- [ ] `wiki/STATUS.md` shows `1160    plan    implemented` after the trailing
      monorepo PR merges.
- [ ] `https://github.com/forwardimpact/bionova-apps` is public, builds green,
      README quickstart works against a fresh clone.

— Staff Engineer 🛠️
