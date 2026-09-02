# Plan Part 02 — Schema, Vendored DSL, and the Seed Pipeline

Add the hand-written migrations, vendor the synthetic-data source
verbatim, and wire the deterministic seed render. Terrain renders the
clinical schema and every seed table; the hand-written migrations add
only what terrain cannot generate. All paths are relative to the
`bionova-apps/` repo root.

## Hand-written migrations

Hand-written migrations live in
`products/polaris/site/supabase/migrations/` under versions that sort
after every staged seed migration. Terrain owns every `public_read`
policy and every `ENABLE ROW LEVEL SECURITY` on the tables it emits; the
hand-written files add none of those.

| Migration | Intent |
| --- | --- |
| `interest_signals` | Anonymous interest table: `text` FK to `trials(id)`, a `match_score` check constraint, indexes on `trial_id` and `match_score`, RLS enabled |
| RLS policies | Staff writes on `trials` and `criteria` (`auth.jwt() ->> 'role' = 'staff'`); anon INSERT plus staff-only SELECT on `interest_signals`; a self-contained `auth.jwt()` helper so the migration applies before GoTrue migrates; the anon INSERT grant (RLS gates rows, not base-table privileges); an unrestricted GRANT to the `service_role` role on every product table |
| `condition_embeddings` unique index | A unique index on `condition_id`, under a distinct 14-digit version (the push tool keys migrations on the leading digits, so a suffixed duplicate version is skipped silently). The `embed-seed` upsert requires it |
| `match_conditions` RPC | Similarity search over `condition_embeddings`: takes a `vector(384)` query embedding plus threshold and count parameters, returns condition ids with scores |
| Notify trigger | The pg_net trigger on `trials.status` change that invokes `notify-updates` (part 03) through Kong, reading the service-role key from the database setting the setup sequence exports |
| Sync schedule | The pg_cron schedule that invokes `sync-listings` (part 03) on a daily cadence with the same key setting |
| Substrate contract | Scaffolded by `fit-terrain substrate init` and hand-mapped onto the seed schema (part 05 § Interviews) |

## Vendor the DSL verbatim

Copy `story.dsl` and `prose-cache.json` byte for byte from the monorepo
at a recorded provenance SHA. Do not edit the vendored copies (spec
§ Excluded). Record the checksum anchor beside them:

```sh
cp <monorepo>/data/synthetic/{story.dsl,prose-cache.json} data/synthetic/
cd data/synthetic && sha256sum story.dsl prose-cache.json > SOURCE.sha256
```

## Determinism anchors

- `data/synthetic/PROVENANCE.md` records the source repo and SHA, the
  render command, and the resolved `fit-terrain` version.
- `data/synthetic/SOURCE.sha256` anchors the vendored inputs.
- `data/synthetic/SEED.sha256` anchors the rendered output. It is the
  byte-reproducibility proof: a re-render from the vendored DSL must
  match it exactly.

The committed source of truth is these anchors plus the two vendored
files and a directory README. The rendered SQL and JSONL are never
committed; the build regenerates them.

## Seed render and staging

`scripts/build-seed.sh` owns the render (C5, C6). The script verifies
`SOURCE.sha256`, renders with `--output-root` into a disposable build
directory, refuses the repo root, asserts the six prose tables, and
stages the SQL under versions that sort before the hand-written
migrations. The render command shape:

```sh
node_modules/.bin/fit-terrain build --story data/synthetic/story.dsl \
  --cache data/synthetic/prose-cache.json --output-root data/synthetic/.build
```

The script resolves the pinned local bin, never a live registry fetch,
so the `SEED.sha256` check always exercises the declared devDependency.

The build is credential-free: it renders from the committed prose cache
with zero LLM calls. The script also copies the embeddings JSONL to the
path the `embed-seed` mount expects.

## Setup sequence

`setup.sh` applies the pipeline in order (C6):

1. Export the service-role key into the database setting that the
   notify trigger and the sync schedule read.
2. Run the seed build.
3. Push all migrations with `db push --include-all`.
4. Reload the PostgREST schema cache after the push.
5. Invoke `embed-seed` through Kong with the service-role key.

A re-seed takes the destructive reset path: the stable migration
versions carry mutable content, so a re-render never reaches an
already-seeded database without it (C6).

## Verification

- The anon and service-role JWTs verify against `JWT_SECRET`, and a
  staff-role JWT passes the trials write policy.
- The pgTAP RLS suite passes: RLS is enabled, the hand-written policies
  exist, and, under the anon role, a `trials` read passes, an
  `interest_signals` INSERT passes, and an `interest_signals` read-back
  returns nothing. Behavioral anon-write-fails and staff-JWT-write
  assertions are **not yet met by the shipped repository** (the SC6
  smoke writes as `service_role`, which bypasses the staff policy).
- The script stages at least 15 seed migrations and
  `sha256sum -c SEED.sha256` passes on a re-render.
- `sha256sum -c SOURCE.sha256` passes, and the same render in the
  monorepo at the provenance SHA reproduces identical bytes.
- The `condition_embeddings` row count matches the JSONL row count, and
  a plain-language query returns condition matches through
  `match_conditions`.

— Staff Engineer 🛠️
