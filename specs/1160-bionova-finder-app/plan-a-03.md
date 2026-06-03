# Plan 1160-a-03 — Data fetch from monorepo

Wire bionova-apps's data pipeline. **Terrain output is produced inside
the monorepo by spec 1150's implementation** and committed to
`products/finder/site/supabase/migrations/seed_*.sql` +
`seed_embeddings.jsonl`. bionova-apps fetches these artifacts at
`setup.sh` time and applies them. No `fit-terrain` invocation occurs in
bionova-apps.

All paths are inside `bionova-apps/`.

## Step 1 — Verify spec 1150 artifacts exist on monorepo main

Run before any other step. The implementer picks a specific monorepo
commit on `main` that has the spec-1150 artifacts merged, and pins it
explicitly. The step does NOT auto-resolve `main` because doing so
captures a moving target on each rerun.

```sh
MONOREPO_RAW="https://raw.githubusercontent.com/forwardimpact/monorepo"
# Implementer sets this to a known-good 40-char SHA on origin/main after
# verifying spec 1150 has merged at that commit. No fallback to HEAD.
SHA="${MONOREPO_SHA:?Set MONOREPO_SHA to a 40-char commit SHA where spec 1150 is merged}"
[ "${#SHA}" = "40" ] || { echo "FAIL: MONOREPO_SHA must be 40 chars (got ${#SHA})"; exit 1; }

# Probe each required artifact
for f in \
  "products/finder/site/supabase/migrations/seed_001_conditions.sql" \
  "products/finder/site/supabase/migrations/seed_002_sites.sql" \
  "products/finder/site/supabase/migrations/seed_embeddings.jsonl" ; do
  status=$(curl -fsI -o /dev/null -w "%{http_code}" "$MONOREPO_RAW/$SHA/$f")
  [ "$status" = "200" ] || { echo "FAIL: $f not at $SHA ($status)"; exit 1; }
done
echo "Monorepo SHA pinned: $SHA"
```

If any probe fails, halt and post an `agent-react` ask to the
release-engineer: "Spec 1160 plan-a-03 blocked on spec 1150
implementation. Monorepo `main` at SHA $MAIN_SHA lacks
`products/finder/site/supabase/migrations/seed_*.sql` or
`seed_embeddings.jsonl`."

The exact filenames `seed_001_conditions.sql` etc. follow
`render-sql.js`'s `${prefix}_${NNN}_${entity}.sql` convention with
`prefix=seed` from spec 1150's plan-a.md:138. If terrain output
filenames change, the probe list updates here in the same commit.

Verify: all three probes return 200; SHA is captured.

## Step 2 — Author `scripts/fetch-seed.sh`

Created: `scripts/fetch-seed.sh` — fetches monorepo terrain output to
`data/synthetic/seed/` and stages it into supabase migrations.

```sh
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_RAW="https://raw.githubusercontent.com/forwardimpact/monorepo"
PINNED_SHA="${MONOREPO_SHA:?Must be set to the pinned monorepo SHA}"

SEED_DIR="$ROOT/data/synthetic/seed"
MIG_DIR="$ROOT/products/finder/site/supabase/migrations"
mkdir -p "$SEED_DIR"

# List of files to fetch (one per terrain entity + embeddings)
FILES=(
  seed_001_conditions.sql
  seed_002_sites.sql
  seed_003_researchers.sql
  seed_004_trials.sql
  seed_005_criteria.sql
  seed_006_trial_conditions.sql
  seed_007_trial_sites.sql
  seed_008_rls.sql
  seed_009_condition_embeddings.sql
  seed_embeddings.jsonl
)

for f in "${FILES[@]}"; do
  url="$MONOREPO_RAW/$PINNED_SHA/products/finder/site/supabase/migrations/$f"
  echo "Fetching $f from $PINNED_SHA…"
  curl --fail -fsSL -o "$SEED_DIR/$f" "$url"
done

# Stage SQL into supabase/migrations with a 2025-prefixed timestamp so terrain
# files sort before hand-written 20260601* files (FK to trials resolves).
find "$MIG_DIR" -maxdepth 1 -name "20250101000000_seed_*.sql" -delete
for f in "$SEED_DIR"/seed_*.sql; do
  base=$(basename "$f")
  cp "$f" "$MIG_DIR/20250101000000_${base}"
done
echo "Staged $(ls "$MIG_DIR"/20250101000000_seed_*.sql | wc -l) seed migrations"
```

Make executable: `chmod +x scripts/fetch-seed.sh`.

Filenames listed above must match terrain's actual output for the
1150-implemented story.dsl. The implementer probes the directory listing
via `curl https://api.github.com/repos/forwardimpact/monorepo/contents/products/finder/site/supabase/migrations?ref=$MAIN_SHA`
at part-03 PR time and updates the FILES array if names differ.

Verify: `MONOREPO_SHA=$MAIN_SHA bash scripts/fetch-seed.sh` exits 0 and
populates `data/synthetic/seed/` + `products/finder/site/supabase/migrations/20250101000000_seed_*.sql`.

## Step 3 — Pin monorepo SHA + add to `.env`

Created: `.env.example` (extends part-01 entries):

```
# Source of truth for synthetic data — terrain output committed in the
# Forward Impact monorepo. Update by re-running part-03 step 1's probe
# against monorepo main and committing the new SHA here.
MONOREPO_SHA=<40-char-sha>
```

`setup.sh` exports `MONOREPO_SHA` from `.env` (already loaded by part 01)
and `scripts/fetch-seed.sh` reads it.

Verify: `.env.example` includes `MONOREPO_SHA=` with a placeholder; the
implementer's own `.env` carries the actual SHA from step 1.

## Step 4 — Wire fetch into `setup.sh`

Edit `setup.sh` from part 01; replace the placeholder Step B with:

```sh
# Step B0 — fetch terrain output from pinned monorepo SHA
echo "Fetching seed data from monorepo@$MONOREPO_SHA…"
"$ROOT/scripts/fetch-seed.sh"

# Step B — apply migrations via supabase db push
echo "Running supabase db push…"
cd "$ROOT/products/finder/site"
npx -y supabase@1.219.2 db push --db-url "postgres://postgres:${POSTGRES_PASSWORD}@localhost:5432/postgres"
cd "$ROOT"
```

Verify: after `docker compose up -d` and `./setup.sh`, `psql -c "\dt"`
lists all 9 tables (conditions, sites, researchers, trials, criteria,
trial_conditions, trial_sites, condition_embeddings, interest_signals).

## Step 5 — Wire `embed-seed` invocation

Add Step C (embeddings seeding) to `setup.sh`:

```sh
# Step C — populate condition_embeddings via embed-seed edge function.
# The JSONL is mounted at /data/synthetic/seed/seed_embeddings.jsonl
# inside the finder-functions container (volume added in step 6 below).
echo "Seeding embeddings via embed-seed edge function…"
curl --fail -sS -X POST "http://localhost:8000/functions/v1/embed-seed" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"source":"/data/synthetic/seed/seed_embeddings.jsonl"}'
```

## Step 6 — Mount seed dir into edge-functions container

Edit `docker-compose.yml` `finder-functions` block (from part 01) to add:

```yaml
volumes:
  - ./data/synthetic/seed:/data/synthetic/seed:ro
```

Also add `setup.sh` Step A line: `mkdir -p data/synthetic/seed` before
`wait_healthy` so the bind-mount target exists on a fresh clone.

Verify: `docker compose exec finder-functions ls /data/synthetic/seed/`
lists the fetched files after `setup.sh` runs.

## Step 7 — Add `data/synthetic/seed/README.md`

Created: `data/synthetic/seed/README.md`

Content: one-page describing the static-fetch approach. Key points:
- bionova-apps does NOT regenerate seed data; it fetches from a pinned
  monorepo SHA
- To refresh: update `MONOREPO_SHA` in `.env` to the desired commit on
  `forwardimpact/monorepo:main`, then re-run `setup.sh`
- To audit what's in the seed: `cat data/synthetic/seed/seed_*.sql`
- Source of the data: `forwardimpact/monorepo/data/synthetic/story.dsl`

Verify: file present; renders cleanly on GitHub.

## Step 8 — Add CI step that proves fetch works

Edit `.github/workflows/ci.yml` (from part 01):

```yaml
  seed-fetch:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@v4
      - name: Resolve MONOREPO_SHA from .env.example
        id: env
        run: |
          sha=$(grep -E '^MONOREPO_SHA=' .env.example | cut -d= -f2)
          [ -n "$sha" ] && [ "$sha" != "<40-char-sha>" ] || { echo "MONOREPO_SHA not pinned in .env.example"; exit 1; }
          echo "sha=$sha" >> $GITHUB_OUTPUT
      - run: MONOREPO_SHA=${{ steps.env.outputs.sha }} bash scripts/fetch-seed.sh
      - run: |
          test "$(ls data/synthetic/seed/seed_*.sql | wc -l)" -ge 6
          test -s data/synthetic/seed/seed_embeddings.jsonl
          test "$(wc -l < data/synthetic/seed/seed_embeddings.jsonl)" -ge 6
```

Verify: PR CI runs `seed-fetch` job; passes when `.env.example` pins a
SHA that has the expected files.

## Step 9 — Open part-03 PR

```sh
git checkout -b data/fetch-from-monorepo
git add scripts/fetch-seed.sh setup.sh docker-compose.yml .env.example data/synthetic/ .github/workflows/ci.yml
git commit -m "data: fetch seed migrations from pinned monorepo SHA"
git push -u origin data/fetch-from-monorepo
gh pr create --title "data: fetch seed migrations from pinned monorepo SHA" --body "Implements plan-a-03 of spec 1160. bionova-apps does not run fit-terrain (libterrain's bin resolves paths from its install dir, not consumer CWD). Instead, the monorepo's spec-1150 implementation commits terrain output, and bionova-apps fetches the committed artifacts at setup.sh time pinned to a known-good SHA."
```

Verify: PR CI green (lint + seed-fetch jobs).

## Verification (end of part 03)

- [ ] `scripts/fetch-seed.sh` fetches all `seed_*.sql` + `seed_embeddings.jsonl` from monorepo@MONOREPO_SHA.
- [ ] `.env.example` pins a real 40-char SHA that points at a commit on `forwardimpact/monorepo:main` containing the artifacts.
- [ ] `./setup.sh` against a fresh stack: fetches seed, stages migrations, applies via `supabase db push`, seeds embeddings via `embed-seed`.
- [ ] `psql -c "SELECT COUNT(*) FROM trials;"` returns ≥ 6 (story.dsl trial count).
- [ ] `psql -c "SELECT COUNT(*) FROM condition_embeddings;"` returns ≥ 6 (after embed-seed runs).
- [ ] `psql -c "SELECT indexrelid::regclass FROM pg_index WHERE indrelid = 'condition_embeddings'::regclass AND indisunique;"` includes `condition_embeddings_condition_id_uidx` (from part 02).
- [ ] `cd products/finder/site && npx -y supabase@1.219.2 test db` exits 0 (the part-02 RLS test asserts against the now-applied schema).

— Staff Engineer 🛠️
