# Plan 1160-a-03 — Vendor story.dsl verbatim and render seed locally

Wire bionova-apps's data pipeline. **Revision r3** (vendor-output → vendor-DSL):
r2 vendored the rendered `data/synthetic/seed/*.sql` because `fit-terrain` could
not run outside the monorepo. r3 makes the app build around synthetic data: it
vendors `data/synthetic/story.dsl` and `prose-cache.json` **verbatim** and runs
`fit-terrain build` against them inside bionova-apps. The DSL is the domain
source of truth; the SQL and embeddings JSONL are rendered locally and never
committed.

This part depends on **prerequisites A and B** (plan-a.md § Prerequisites):
`fit-terrain` must accept `--output-root` (A) and emit the six prose tables (B).
Do not start this part until both are published to npm.

All paths are inside `bionova-apps/` unless a step says "in the monorepo".

## Step 1 — Vendor story.dsl + prose-cache verbatim, with provenance

In a monorepo checkout at a recorded commit on `origin/main` (the **provenance
SHA**), copy the two source files unchanged into bionova-apps and record where
they came from:

```sh
PROVENANCE_SHA=$(cd <monorepo> && git rev-parse HEAD)
mkdir -p <bionova-apps>/data/synthetic
cp <monorepo>/data/synthetic/story.dsl       <bionova-apps>/data/synthetic/story.dsl
cp <monorepo>/data/synthetic/prose-cache.json <bionova-apps>/data/synthetic/prose-cache.json
cd <bionova-apps>/data/synthetic && sha256sum story.dsl prose-cache.json > SOURCE.sha256
```

`story.dsl` is copied **byte-for-byte** — no path edits, even though its
`polaris-seed` output block targets `products/polaris/site/supabase/migrations/`
(the `--output-root` flag in step 3 redirects that safely). Editing the
vendored DSL is out of scope (spec § Excluded); domain changes happen in the
monorepo and are re-vendored.

Write `data/synthetic/PROVENANCE.md` (one page):

- Generating repo + SHA: `forwardimpact/monorepo` @ `$PROVENANCE_SHA`
- Vendored verbatim: `story.dsl` (`seed 42`) + `prose-cache.json`
- Render command: `bunx fit-terrain build --story data/synthetic/story.dsl
  --cache data/synthetic/prose-cache.json --output-root data/synthetic/.build`
- `fit-terrain` version that produced the committed `SEED.sha256`: `<pinned>`
- SC7 verify: run the render command here, then `sha256sum -c SEED.sha256`
  against `data/synthetic/.build/.../migrations/`; running the same command in
  the monorepo at `$PROVENANCE_SHA` reproduces identical bytes.

Verify: `sha256sum -c SOURCE.sha256` passes; `PROVENANCE.md` carries a real
40-char SHA reachable on `forwardimpact/monorepo:main`; `story.dsl` is
byte-identical to the monorepo's at `$PROVENANCE_SHA` (`diff` is empty).

## Step 2 — Verify the fit-terrain pin carries prereqs A+B

Part 01 added `fit-terrain` as a pinned `devDependency` (0.1.41, the first
release carrying `--output-root` (A) and prose-to-SQL rendering (B)). Confirm
the resolved version is at least that:

```sh
npm view fit-terrain version       # must be >= 0.1.41
```

Record the resolved version in this part's PR body.

Verify: `bun pm ls | grep fit-terrain` shows the pinned
version; `bunx fit-terrain --help` lists `--output-root` and `--schema-dir`.

## Step 3 — Author `scripts/build-seed.sh`

Created: `scripts/build-seed.sh` — renders the vendored DSL into a disposable
build dir and stages the SQL into supabase migrations. Replaces r2's
`scripts/stage-seed.sh` (no vendored SQL to stage anymore).

```sh
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SYN="$ROOT/data/synthetic"
BUILD="$SYN/.build"                                   # gitignored, disposable
OUT="$BUILD/products/polaris/site/supabase/migrations" # terrain writes here
MIG="$ROOT/products/polaris/site/supabase/migrations"

# Guard: never let terrain's rm -rf hit the repo root (would delete products/).
case "$BUILD" in "$ROOT") echo "FATAL: output root is repo root"; exit 1;; esac

# Verify the vendored sources are intact before rendering.
(cd "$SYN" && sha256sum -c SOURCE.sha256 >/dev/null) \
  || { echo "FAIL: vendored story.dsl/prose-cache do not match SOURCE.sha256"; exit 1; }

rm -rf "$BUILD"; mkdir -p "$BUILD"
# Credential-free: build renders from the committed cache, zero LLM calls.
bunx fit-terrain build \
  --story "$SYN/story.dsl" \
  --cache "$SYN/prose-cache.json" \
  --output-root "$BUILD"

# Assert the prose tables rendered (prerequisite B); fail loudly if dropped.
for t in condition_explainers trial_faqs consent_summaries \
         site_descriptions patient_stories therapy_descriptions; do
  ls "$OUT"/seed_*_"$t".sql >/dev/null 2>&1 \
    || { echo "FAIL: prose table $t missing — prerequisite B not in libterrain"; exit 1; }
done

# Stage SQL into supabase/migrations with 2025-prefixed, per-file-distinct
# versions so terrain files sort before hand-written 20260601* files (FK to
# trials resolves) and each records a unique version in schema_migrations.
mkdir -p "$MIG"
find "$MIG" -maxdepth 1 -name "20250101*_seed_*.sql" -delete
i=0
for f in "$OUT"/seed_*.sql; do
  i=$((i+1)); printf -v n '%04d' "$i"
  cp "$f" "$MIG/20250101${n}_$(basename "$f")"
done
cp "$OUT/seed_embeddings.jsonl" "$SYN/seed_embeddings.jsonl"   # for embed-seed mount
echo "Staged $i seed migrations + embeddings"
```

Make executable: `chmod +x scripts/build-seed.sh`.

Verify: `bash scripts/build-seed.sh` exits 0; stages ≥ 15 files matching
`products/polaris/site/supabase/migrations/20250101*_seed_*.sql` (9 core + 6
prose); writes `data/synthetic/seed_embeddings.jsonl`.

## Step 4 — Record the determinism anchor `SEED.sha256`

After the first clean `build-seed.sh` run, capture checksums of the rendered
SQL + JSONL as the regeneration anchor (this is committed; the `.build/`
output itself is not):

```sh
cd data/synthetic/.build/products/polaris/site/supabase/migrations
sha256sum seed_*.sql seed_embeddings.jsonl > "$ROOT/data/synthetic/SEED.sha256"
```

`build-seed.sh` regenerates from the vendored DSL; `SEED.sha256` proves the
render is deterministic. SC7's verify is
`build-seed.sh && (cd .build/.../migrations && sha256sum -c <repo>/data/synthetic/SEED.sha256)`.

Verify: `SEED.sha256` lists 15+ files; a second `build-seed.sh` run produces
output that passes `sha256sum -c data/synthetic/SEED.sha256`.

## Step 5 — Gitignore the build dir; commit the sources

Add to `.gitignore`:

```gitignore
data/synthetic/.build/
data/synthetic/seed_embeddings.jsonl
products/polaris/site/supabase/migrations/20250101*_seed_*.sql
```

Committed seed source of truth: `data/synthetic/story.dsl`,
`prose-cache.json`, `SOURCE.sha256`, `SEED.sha256`, `PROVENANCE.md`,
`README.md`. The rendered SQL/JSONL are regenerated, never committed.

Verify: `git status` shows the six committed files staged and no `.build/` or
staged-seed artifacts tracked.

## Step 6 — Wire the build into `setup.sh`

Edit `setup.sh` from part 01; replace the placeholder Step B with:

```sh
# Step B0 — render + stage seed from the vendored DSL
echo "Building seed from data/synthetic/story.dsl…"
"$ROOT/scripts/build-seed.sh"

# Step B — apply migrations via supabase db push
echo "Running supabase db push…"
cd "$ROOT/products/polaris/site"
# --include-all applies every pending local migration regardless of its order
# relative to what is already recorded. Without it a re-seed (where the seed
# versions are removed but later ones remain) is refused as "out of order".
npx -y supabase@1.219.2 db push --include-all --db-url "postgres://postgres:${POSTGRES_PASSWORD}@localhost:5432/postgres"
cd "$ROOT"

# Reload PostgREST's schema cache. It loads the cache once at startup (before
# these migrations created the tables) and runs behind the transaction pooler
# with the NOTIFY reload channel disabled, so it will not pick up the new tables
# on its own. SIGUSR1 forces an in-place reload.
docker compose kill -s SIGUSR1 postgrest >/dev/null 2>&1 || docker compose restart postgrest >/dev/null 2>&1
sleep 3
```

Verify: after `docker compose up -d` and `./setup.sh`, `psql -c "\dt"` lists
all 15 tables (conditions, sites, researchers, trials, criteria,
trial_conditions, trial_sites, condition_embeddings, the six prose tables,
interest_signals).

## Step 7 — Wire `embed-seed` invocation

Add Step C (embeddings seeding) to `setup.sh`. The JSONL now lives at
`data/synthetic/seed_embeddings.jsonl` (written by `build-seed.sh`), mounted
into the polaris-functions container (step 8):

```sh
# Step C — populate condition_embeddings via embed-seed edge function.
echo "Seeding embeddings via embed-seed edge function…"
curl --fail -sS -X POST "http://localhost:8000/functions/v1/embed-seed" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"source":"/data/synthetic/seed_embeddings.jsonl"}'
```

## Step 8 — Mount the embeddings JSONL into the edge-functions container

Edit `docker-compose.yml` `polaris-functions` block (from part 01):

```yaml
volumes:
  - ./data/synthetic/seed_embeddings.jsonl:/data/synthetic/seed_embeddings.jsonl:ro
```

The JSONL is produced by `build-seed.sh` before `docker compose` needs it
(setup ordering: build-seed → up → embed-seed). If a fresh clone has not run
build-seed yet, `setup.sh` runs it as Step B0 before the embed-seed POST.

Verify: `docker compose exec polaris-functions ls /data/synthetic/` lists
`seed_embeddings.jsonl`.

## Step 9 — Add `data/synthetic/README.md`

Created: `data/synthetic/README.md`. Key points:

- This directory is the app's domain source of truth. `story.dsl` is vendored
  verbatim from `forwardimpact/monorepo` at the SHA in `PROVENANCE.md`.
- bionova-apps renders the seed locally with `fit-terrain build` (no LLM key —
  the prose cache is committed). The rendered SQL/JSONL are gitignored.
- To audit what the app contains: read `story.dsl` (not SQL dumps).
- To refresh the domain: change the DSL in the monorepo, regenerate the prose
  cache there, re-vendor `story.dsl` + `prose-cache.json` here, rerun
  `build-seed.sh`, refresh `SEED.sha256`, bump the provenance SHA, commit.
- To regenerate locally: `bash scripts/build-seed.sh`.

Verify: file present; renders cleanly on GitHub.

## Step 10 — Add CI step that proves the local build is deterministic

Fill in `.github/workflows/check-seed.yml` (scaffolded in part 01; SHA-pin
both actions per part 01 step 9):

```yaml
jobs:
  seed-build:
    runs-on: ubuntu-latest
    timeout-minutes: 6
    steps:
      - uses: actions/checkout@<pinned-sha> # v7
      - uses: oven-sh/setup-bun@<pinned-sha> # v2
        with:
          bun-version-file: .tool-versions
      - run: bun install
      # fit-terrain (prereqs A+B) is a devDependency, so `bun install` above
      # drops its bin locally and build-seed.sh resolves it without a live
      # `bunx` fetch.
      - run: bash scripts/build-seed.sh
      - run: |
          MIG=products/polaris/site/supabase/migrations
          test "$(ls $MIG/20250101*_seed_*.sql | wc -l)" -ge 15
          (cd data/synthetic/.build/products/polaris/site/supabase/migrations \
            && sha256sum -c "$GITHUB_WORKSPACE/data/synthetic/SEED.sha256")
          test -s data/synthetic/seed_embeddings.jsonl
          grep -Eq '[0-9a-f]{40}' data/synthetic/PROVENANCE.md
```

The job needs npm (fit-terrain) but **no LLM credential** — `build` renders
from the committed cache. The `sha256sum -c` against `SEED.sha256` is the SC7
determinism gate: a non-deterministic render or a fit-terrain version drift
fails here.

Verify: PR CI runs `seed-build`; passes on the vendored-DSL layout.

## Step 11 — Open part-03 PR

```sh
git checkout -b data/vendored-dsl
git add scripts/build-seed.sh setup.sh docker-compose.yml data/synthetic/ \
        .github/workflows/check-seed.yml .gitignore package.json
git commit -m "data: vendor story.dsl verbatim; render seed locally with fit-terrain"
git push -u origin data/vendored-dsl
gh pr create --title "data: vendor story.dsl verbatim; render seed locally" \
  --body "Implements plan-a-03 (r3) of spec 1160. bionova-apps vendors data/synthetic/story.dsl + prose-cache.json verbatim from monorepo@<PROVENANCE_SHA> and runs fit-terrain build --output-root to render the seed locally (no LLM key; prose cache committed). Requires fit-terrain >= 0.1.41 (prereqs A --output-root and B prose→SQL), pinned in package.json. SEED.sha256 is the determinism anchor (SC7). Supersedes r2's vendor-the-SQL approach."
```

Verify: PR CI green (lint + seed-build jobs).

## Verification (end of part 03)

- [ ] `data/synthetic/` carries `story.dsl` + `prose-cache.json` vendored
      verbatim (byte-identical to monorepo@`$PROVENANCE_SHA`), plus
      `SOURCE.sha256`, `SEED.sha256`, `PROVENANCE.md`, `README.md`, all
      committed.
- [ ] `PROVENANCE.md` pins a real 40-char SHA on `forwardimpact/monorepo:main`
      and the fit-terrain version used.
- [ ] `bunx fit-terrain --help` shows `--output-root` (prereq A present).
- [ ] `scripts/build-seed.sh` renders into `data/synthetic/.build/`, asserts the
      six prose tables, stages ≥ 15 SQL files, and refuses to run if the output
      root is the repo root.
- [ ] A repeat `build-seed.sh` run passes
      `sha256sum -c data/synthetic/SEED.sha256` (SC7 determinism).
- [ ] `./setup.sh` against a fresh stack: renders seed, applies via
      `supabase db push`, seeds embeddings via `embed-seed`.
- [ ] `psql -c "SELECT COUNT(*) FROM trials;"` returns ≥ 6.
- [ ] `psql -c "SELECT COUNT(*) FROM trial_faqs;"` and the other five prose
      tables each return ≥ 1.
- [ ] `psql -c "SELECT COUNT(*) FROM condition_embeddings;"` returns ≥ 6 (after
      embed-seed runs).
- [ ] `psql -c "SELECT indexrelid::regclass FROM pg_index WHERE indrelid = 'condition_embeddings'::regclass AND indisunique;"`
      includes `condition_embeddings_condition_id_uidx` (from part 02).
- [ ] `cd products/polaris/site && npx -y supabase@1.219.2 test db` exits 0.

— Staff Engineer 🛠️
