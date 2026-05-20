# Plan 1160-a-03 — Data pipeline (story.dsl + terrain integration)

Wire the synthetic data pipeline into bionova-apps: copy the
spec-1150-rewritten `story.dsl`, run `fit-terrain generate`, route its
output to `data/synthetic/output/`, and copy generated SQL and embeddings
into the supabase migrations directory at `setup.sh` time.

All paths are inside `bionova-apps/`.

## Step 1 — Verify spec 1150 implemented

Run before any other step. Fetch the monorepo's story.dsl directly via
GitHub (no path assumption needed):

```sh
MONOREPO_RAW="https://raw.githubusercontent.com/forwardimpact/monorepo/main"
STORY=$(curl -fsSL "$MONOREPO_RAW/data/synthetic/story.dsl")
CACHE_EXISTS=$(curl -fsSI "$MONOREPO_RAW/data/synthetic/prose-cache.json" | head -1 | grep -c "200" || true)

# Check 1: clinical block exists
echo "$STORY" | grep -qE "^\s*clinical\s*\{" || { echo "FAIL: no clinical{} block in story.dsl"; exit 1; }

# Check 2: supabase_migration output declared
echo "$STORY" | grep -qE "output\s+\w+\s+supabase_migration\s*\{" || { echo "FAIL: no supabase_migration output"; exit 1; }

# Check 3: embeddings_jsonl output declared
echo "$STORY" | grep -qE "output\s+\w+\s+embeddings_jsonl\s*\{" || { echo "FAIL: no embeddings_jsonl output"; exit 1; }

# Check 4: prose cache exists (else `fit-terrain build` will need ANTHROPIC_API_KEY)
[ "$CACHE_EXISTS" = "1" ] || { echo "WARN: prose-cache.json not in monorepo; offline build will fail"; }
```

If any check fails, halt and post an `agent-react` ask to the
release-engineer: "Spec 1160 plan-a-03 blocked on spec 1150 implementation.
Story.dsl in monorepo lacks the required `clinical {}` / `output …
supabase_migration {…}` / `output … embeddings_jsonl {…}` declarations."
Do not proceed.

Verify: all four checks pass.

## Step 2 — Copy story.dsl and prose cache into bionova-apps

Created: `data/synthetic/story.dsl`

Content: byte-for-byte copy from
`<monorepo>/data/synthetic/story.dsl` at `origin/main` (fetched via
`curl -fsSLO "$MONOREPO_RAW/data/synthetic/story.dsl"`).

Also created: `data/synthetic/prose-cache.json` — byte-for-byte copy from
`<monorepo>/data/synthetic/prose-cache.json` (no leading dot; that is the
file's actual name in the monorepo) so bionova-apps CI can run
`fit-terrain build` offline without LLM API access. Commit this file —
it's the offline contract.

Edit story.dsl `output` blocks to route generated files under
`data/synthetic/output/` (the disposable zone — `writeFiles()` rm-rf's
the first-two-path-segment directory before writing, so anywhere under
`data/synthetic/` is safe; under `products/finder/` would destroy
authored code). The real DSL grammar (verified against
`libraries/libterrain/test/fixtures/clinical.dsl`) is:

```dsl
output clinical_db supabase_migration {
  prefix "bn"
  path "data/synthetic/output/migrations/"
  entities [clinical.conditions, clinical.sites, clinical.researchers, clinical.trials]
}

output clinical_embed embeddings_jsonl {
  path "data/synthetic/output/seed_embeddings.jsonl"
  entities [clinical.conditions]
  text_fields {
    clinical.conditions [name, synonyms]
  }
}
```

Key shape rules:
- `output <label> <format> { … }` — `<label>` is a free identifier.
- `prefix` controls the table/file name prefix (defaults to `clinical`).
- `path` (optional) is a directory prefix prepended to every emitted file.
- `entities` is the list of entity types to include (use the
  `clinical.<type>` namespace).
- `text_fields { <entity> [<field>, …] }` (embeddings only) controls which
  fields contribute to the embedding text.
- No `include_rls` flag exists — RLS is always emitted via `renderRls()`.
- No `include_embeddings true` flag exists — the JSONL output is the
  embedding text source; `embed-seed` (part 04) computes vectors.

If 1150's story.dsl already declares these blocks with different paths,
update them here to point under `data/synthetic/output/`. **Never** route
output under `products/finder/` or `services/finder-functions/` —
writeFiles will rm-rf the parent directory before writing.

Verify:
- `grep -E "supabase_migration\s*\{" data/synthetic/story.dsl` matches.
- Both output blocks' `path` (or default) places files under `data/synthetic/output/`.
- `data/synthetic/prose-cache.json` is committed (size > 0).

## Step 3 — Pin libterrain and add invocation recipes

Edit root `package.json` devDependencies (from part 01):

```json
"@forwardimpact/libterrain": "0.1.29"
```

Edit `justfile` (from part 01):

```just
# Generate terrain output (offline; uses prose-cache.json)
terrain:
    bunx fit-terrain build --story=data/synthetic/story.dsl --cache=data/synthetic/prose-cache.json

# Fill prose cache via LLM then build (requires ANTHROPIC_API_KEY)
terrain-fresh:
    bunx fit-terrain generate --story=data/synthetic/story.dsl --cache=data/synthetic/prose-cache.json
```

Verify: `just terrain` writes files under `data/synthetic/output/` and
exits 0. Inspect: `ls data/synthetic/output/migrations/` shows timestamped
SQL files; `wc -l data/synthetic/output/seed_embeddings.jsonl` shows ≥ 6
lines (one per condition).

## Step 4 — Wire terrain into `setup.sh`

Edit `setup.sh`; insert before Step B (migration apply):

```sh
# Step B0 — regenerate terrain output every run for determinism
TERRAIN_OUT="$ROOT/data/synthetic/output"
echo "Regenerating terrain output (idempotent; SC6 requires deterministic regen)…"
rm -rf "$TERRAIN_OUT"
(cd "$ROOT" && bunx fit-terrain build \
  --story=data/synthetic/story.dsl \
  --cache=data/synthetic/prose-cache.json)

# Step B1 — refresh terrain SQL in supabase migrations
TERRAIN_MIG="$TERRAIN_OUT/migrations"
SITE_MIG="$ROOT/products/finder/site/supabase/migrations"
echo "Refreshing terrain migrations under supabase/migrations/"
# Remove any prior terrain output (matches terrain's prefix to avoid touching hand-written files)
TERRAIN_PREFIX="bn"  # MUST match the `prefix` in story.dsl's supabase_migration output block
find "$SITE_MIG" -maxdepth 1 -name "${TERRAIN_PREFIX}_*.sql" -delete
cp "$TERRAIN_MIG"/*.sql "$SITE_MIG/"
```

Hand-written migrations are dated `20260601*` (part 02 + part 04 + part
05); terrain emits files prefixed with the story.dsl `prefix` value
(`bn_*` per Step 2 above). The two namespaces do not collide, so `cp` is
safe (no `-n` needed) and `find … -delete` cleans only terrain output.
However, `supabase db push` applies files in filename-sorted order — to
ensure terrain SQL applies first (so `trials` exists before the
`interest_signals` FK resolves), rename terrain output as part of the
copy:

```sh
# Reorder: terrain SQL gets a 2025* date prefix to sort before hand-written 2026*
for f in "$TERRAIN_MIG"/${TERRAIN_PREFIX}_*.sql; do
  base=$(basename "$f")
  cp "$f" "$SITE_MIG/20250101000000_${base}"
done
```

Verify: after `./setup.sh`, `ls products/finder/site/supabase/migrations/`
shows terrain files prefixed `20250101000000_bn_*.sql` (sorting before
all hand-written `20260601*` files) and the hand-written files; `supabase
db push` applies in directory order without FK violations.

## Step 5 — Wire embeddings into `setup.sh` invocation of `embed-seed`

Add Step C (embeddings seeding) — the `embed-seed` edge function (part
04) reads `data/synthetic/output/seed_embeddings.jsonl` and POSTs rows
to TEI. `setup.sh` invokes it once after migrations apply and fails the
script if the response is not 200:

```sh
# Step C — populate condition_embeddings via embed-seed edge function
echo "Seeding embeddings via embed-seed edge function…"
curl --fail -sS -X POST "http://localhost:8000/functions/v1/embed-seed" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"source":"/data/synthetic/output/seed_embeddings.jsonl"}'
```

The `services/finder-functions/` container mounts the output dir
read-only — set in `docker-compose.yml` finder-functions block (edit
from part 01):

```yaml
volumes:
  - ./data/synthetic/output:/data/synthetic/output:ro
```

The `data/synthetic/output/` directory may not exist on a fresh clone
before terrain runs. Two-part mitigation:
- Add `mkdir -p data/synthetic/output` to `setup.sh` Step A (before
  `wait_healthy` calls) so the bind mount target exists.
- The `finder-functions` service depends on `tei` healthy (already set in
  part 01); terrain runs in Step B0 before the function is invoked in
  Step C, populating the directory before any read.

Verify: `psql -c "SELECT COUNT(*) FROM condition_embeddings;"` returns ≥
6 after `setup.sh` completes (matching the count of clinical conditions
in story.dsl, which spec 1150 fixes at 6).

## Step 6 — Add `data/synthetic/README.md`

Created: `data/synthetic/README.md`

Content: one-page guide — how the pipeline works, how to regenerate
(`just terrain`), where outputs land, how to re-seed prose cache
(`just terrain-fresh` with `ANTHROPIC_API_KEY` set).

Verify: file present; renders cleanly on GitHub.

## Step 7 — Add CI step that runs `fit-terrain build` headless

Edit `.github/workflows/ci.yml` (from part 01):

```yaml
  terrain:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: |
          # Fail-loud: require prose-cache.json so build is offline + deterministic
          test -s data/synthetic/prose-cache.json || { echo "ERR: prose-cache.json missing — build would call LLM"; exit 1; }
      - run: bunx fit-terrain build --story=data/synthetic/story.dsl --cache=data/synthetic/prose-cache.json
      - run: |
          test -d data/synthetic/output/migrations
          test "$(ls data/synthetic/output/migrations/*.sql | wc -l)" -gt 0
          test -s data/synthetic/output/seed_embeddings.jsonl
          test "$(wc -l < data/synthetic/output/seed_embeddings.jsonl)" -ge 6
```

Verify: PR CI passes; if prose-cache.json is missing or empty, the job
exits 1 with a clear error (fail-loud per the plan-overview risk).

## Step 8 — Open part-03 PR

```sh
git checkout -b data/terrain-pipeline
git add data/synthetic/ setup.sh package.json justfile docker-compose.yml .github/workflows/ci.yml
git commit -m "data: terrain pipeline + setup.sh data seeding"
git push -u origin data/terrain-pipeline
gh pr create --title "data: terrain pipeline + setup.sh data seeding" --body "Implements plan-a-03 of spec 1160. Wires fit-terrain into setup flow; output staged at data/synthetic/output/."
```

Verify: PR CI green (lint + terrain build + compose validate).

## Verification (end of part 03)

- [ ] `data/synthetic/story.dsl` present; `output … supabase_migration` and `output … embeddings_jsonl` blocks route under `data/synthetic/output/`.
- [ ] `data/synthetic/prose-cache.json` committed (size > 0).
- [ ] `just terrain` exits 0; populates `data/synthetic/output/migrations/*.sql` and `seed_embeddings.jsonl`.
- [ ] `./setup.sh` against a fresh stack: regenerates terrain output, stages migrations (terrain renamed to `20250101*`, hand-written `20260601*`), applies via `supabase db push`, seeds embeddings via `embed-seed`.
- [ ] `psql -c "SELECT COUNT(*) FROM trials;"` returns ≥ 6 (story.dsl trial count).
- [ ] `psql -c "SELECT COUNT(*) FROM condition_embeddings;"` returns ≥ 6.
- [ ] `psql -c "SELECT COUNT(*) FROM pg_policies WHERE schemaname='public';"` shows public_read (terrain) + staff_write + interest_signals policies with no duplicates.
- [ ] `cd products/finder/site && npx -y supabase@1.219.2 test db` exits 0 (the part-02 RLS test now has data to assert against).
- [ ] No files exist under `products/finder/` or `services/finder-functions/` except authored code (verify writeFiles rm-rf zone respected).

— Staff Engineer 🛠️
