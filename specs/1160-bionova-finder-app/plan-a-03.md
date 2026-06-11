# Plan 1160-a-03 — Vendored seed data from monorepo terrain output

Wire bionova-apps's data pipeline. **Revision r2** (fetch→vendor mechanism
swap): r1 assumed terrain output was committed to monorepo `main` and had
bionova-apps fetch it from `raw.githubusercontent.com` at `setup.sh` time.
That premise was false at approval — terrain output is generated, never
committed (`products/finder/` is gitignored at `.gitignore:12` since
`8d3948aa`, and `git log --all --diff-filter=A` shows no seed artifact ever
landed). Adaptation (a) accepted by PM triage on
[Issue #1608](https://github.com/forwardimpact/monorepo/issues/1608):
the implementer regenerates the artifacts inside the monorepo and **vendors
them into bionova-apps with recorded provenance**. No `fit-terrain`
invocation and no network fetch occurs in bionova-apps — at `setup.sh` time
or any other time. Spec SC6's verify command is corrected in the same PR
that carries this revision.

Steps 1–2 run in the monorepo; all other paths are inside `bionova-apps/`.

## Step 1 — Generate the seed artifacts in the monorepo

In a monorepo checkout at a recorded commit on `origin/main` (the
**provenance SHA**), with the committed prose cache:

```sh
cd <monorepo>
PROVENANCE_SHA=$(git rev-parse HEAD)        # record for step 2
bunx fit-terrain check                       # must report 0 misses (100% hit rate)
bunx fit-terrain build                       # writes products/finder/site/supabase/migrations/
ls products/finder/site/supabase/migrations/
```

`check` proves the build needs zero LLM calls (no API key path); `build`
renders from the committed cache. `npx fit-terrain generate` at a full
cache produces identical output and is the verb spec SC6 uses.

Expected output is exactly these 10 artifacts (authoritative list,
live-verified 2026-06-11 against monorepo `6010964b`):

```
seed_001_conditions.sql
seed_002_sites.sql
seed_003_researchers.sql
seed_004_trials.sql
seed_005_criteria.sql
seed_006_trial_sites.sql
seed_007_trial_conditions.sql
seed_008_rls.sql
seed_009_condition_embeddings.sql
seed_embeddings.jsonl
```

r1 listed `seed_006_trial_conditions.sql` / `seed_007_trial_sites.sql` —
the two were swapped relative to terrain's actual output; corrected here
from live output. If terrain output filenames change upstream, this list
updates in the same commit that re-vendors.

Verify: `check` reports 0 misses; `build` exits 0; the directory listing
matches the 10 filenames exactly.

## Step 2 — Vendor the artifacts into bionova-apps with provenance

Copy the 10 artifacts to `data/synthetic/seed/` in bionova-apps and write
`data/synthetic/seed/PROVENANCE.md`:

```sh
mkdir -p <bionova-apps>/data/synthetic/seed
cp <monorepo>/products/finder/site/supabase/migrations/seed_* <bionova-apps>/data/synthetic/seed/
cd <bionova-apps>/data/synthetic/seed && sha256sum seed_* > SHA256SUMS
```

`PROVENANCE.md` content (one page):

- Generating repo + SHA: `forwardimpact/monorepo` @ `$PROVENANCE_SHA`
- Source: `data/synthetic/story.dsl` (`seed 42`) + committed
  `prose-cache.json`
- Command: `bunx fit-terrain check && bunx fit-terrain build` (equivalently
  `npx fit-terrain generate` at full cache)
- Output origin: `products/finder/site/supabase/migrations/` (gitignored in
  the monorepo — generated, never committed there)
- SC6 verify procedure: regenerate in the monorepo at `$PROVENANCE_SHA`,
  then `sha256sum -c SHA256SUMS` against the regenerated files (byte-diff);
  then `supabase db push` of the staged migrations reproduces identical
  data.

All 12 files (10 artifacts + `PROVENANCE.md` + `SHA256SUMS`) are
**committed** — they are the repo's seed source of truth.

Verify: `sha256sum -c SHA256SUMS` passes in `data/synthetic/seed/`;
`PROVENANCE.md` carries a real 40-char SHA reachable on
`forwardimpact/monorepo:main`.

## Step 3 — Author `scripts/stage-seed.sh`

Created: `scripts/stage-seed.sh` — stages the vendored SQL into supabase
migrations (replaces r1's `scripts/fetch-seed.sh`; no network, no env).

```sh
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SEED_DIR="$ROOT/data/synthetic/seed"
MIG_DIR="$ROOT/products/finder/site/supabase/migrations"

[ -s "$SEED_DIR/seed_001_conditions.sql" ] || { echo "FAIL: vendored seed missing at $SEED_DIR"; exit 1; }
(cd "$SEED_DIR" && sha256sum -c SHA256SUMS >/dev/null) || { echo "FAIL: vendored seed does not match SHA256SUMS"; exit 1; }

# Stage SQL into supabase/migrations with a 2025-prefixed timestamp so terrain
# files sort before hand-written 20260601* files (FK to trials resolves).
mkdir -p "$MIG_DIR"
find "$MIG_DIR" -maxdepth 1 -name "20250101000000_seed_*.sql" -delete
for f in "$SEED_DIR"/seed_*.sql; do
  base=$(basename "$f")
  cp "$f" "$MIG_DIR/20250101000000_${base}"
done
echo "Staged $(ls "$MIG_DIR"/20250101000000_seed_*.sql | wc -l) seed migrations"
```

Make executable: `chmod +x scripts/stage-seed.sh`.

Verify: `bash scripts/stage-seed.sh` exits 0 and stages 9 files matching
`products/finder/site/supabase/migrations/20250101000000_seed_*.sql`.

## Step 4 — Wire staging into `setup.sh`

Edit `setup.sh` from part 01; replace the placeholder Step B with:

```sh
# Step B0 — stage vendored seed into supabase migrations
echo "Staging vendored seed data…"
"$ROOT/scripts/stage-seed.sh"

# Step B — apply migrations via supabase db push
echo "Running supabase db push…"
cd "$ROOT/products/finder/site"
npx -y supabase@1.219.2 db push --db-url "postgres://postgres:${POSTGRES_PASSWORD}@localhost:5432/postgres"
cd "$ROOT"
```

No `MONOREPO_SHA` runtime variable exists in r2 — the provenance SHA is
documentation in `PROVENANCE.md`, not a setup-time input. r1's `.env`
plumbing for it is dropped.

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

The mount now serves committed files — present on every fresh clone, so
r1's `mkdir -p` guard in `setup.sh` Step A is unnecessary and dropped.

Verify: `docker compose exec finder-functions ls /data/synthetic/seed/`
lists the vendored files.

## Step 7 — Add `data/synthetic/seed/README.md`

Created: `data/synthetic/seed/README.md`

Content: one-page describing the vendored approach. Key points:

- bionova-apps does NOT run `fit-terrain` and does NOT fetch at setup
  time; the seed is vendored, committed, and staged locally by
  `scripts/stage-seed.sh`
- To refresh: regenerate in a monorepo checkout (PROVENANCE.md § Command),
  copy the artifacts here, regenerate `SHA256SUMS`, update the provenance
  SHA, and commit — one PR, reviewable as a diff
- To audit what's in the seed: `cat data/synthetic/seed/seed_*.sql`
- Source of the data: `forwardimpact/monorepo/data/synthetic/story.dsl`
  at the SHA recorded in `PROVENANCE.md`

Verify: file present; renders cleanly on GitHub.

## Step 8 — Add CI step that proves staging works

Edit `.github/workflows/ci.yml` (from part 01):

```yaml
  seed-stage:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@v4
      - run: bash scripts/stage-seed.sh
      - run: |
          test "$(ls products/finder/site/supabase/migrations/20250101000000_seed_*.sql | wc -l)" -eq 9
          test -s data/synthetic/seed/seed_embeddings.jsonl
          test "$(wc -l < data/synthetic/seed/seed_embeddings.jsonl)" -ge 6
          grep -Eq '[0-9a-f]{40}' data/synthetic/seed/PROVENANCE.md
```

No network access needed — the job validates checksum integrity (inside
`stage-seed.sh`), staging count, embeddings presence, and that provenance
pins a real SHA.

Verify: PR CI runs `seed-stage` job; passes on the vendored layout.

## Step 9 — Open part-03 PR

```sh
git checkout -b data/vendored-seed
git add scripts/stage-seed.sh setup.sh docker-compose.yml data/synthetic/ .github/workflows/ci.yml
git commit -m "data: vendor terrain seed with provenance; stage locally at setup"
git push -u origin data/vendored-seed
gh pr create --title "data: vendor terrain seed with provenance" --body "Implements plan-a-03 (r2) of spec 1160. bionova-apps does not run fit-terrain (no story.dsl or schema dir outside the monorepo) and does not fetch at setup time (terrain output is generated, never committed, in the monorepo — products/finder/ is gitignored). The seed is vendored from monorepo@<PROVENANCE_SHA> with sha256 provenance; scripts/stage-seed.sh stages it into supabase migrations. Deviation from r1 recorded per kata-implement § Handling Problems; PM acceptance and SC6 correction: forwardimpact/monorepo#1608."
```

Verify: PR CI green (lint + seed-stage jobs).

## Verification (end of part 03)

- [ ] `data/synthetic/seed/` carries the 10 vendored artifacts + `PROVENANCE.md` + `SHA256SUMS`, all committed; `sha256sum -c SHA256SUMS` passes.
- [ ] `PROVENANCE.md` pins a real 40-char SHA on `forwardimpact/monorepo:main`; regenerating there per its § Command reproduces the artifacts byte-identical (spec SC6 as corrected).
- [ ] `scripts/stage-seed.sh` stages 9 SQL files into `products/finder/site/supabase/migrations/20250101000000_seed_*.sql` with checksum verification, no network.
- [ ] `./setup.sh` against a fresh stack: stages seed, applies via `supabase db push`, seeds embeddings via `embed-seed`.
- [ ] `psql -c "SELECT COUNT(*) FROM trials;"` returns ≥ 6 (story.dsl trial count).
- [ ] `psql -c "SELECT COUNT(*) FROM condition_embeddings;"` returns ≥ 6 (after embed-seed runs).
- [ ] `psql -c "SELECT indexrelid::regclass FROM pg_index WHERE indrelid = 'condition_embeddings'::regclass AND indisunique;"` includes `condition_embeddings_condition_id_uidx` (from part 02).
- [ ] `cd products/finder/site && npx -y supabase@1.219.2 test db` exits 0 (the part-02 RLS test asserts against the now-applied schema).

— Staff Engineer 🛠️
