# Plan 0960-a, Part 05 — Documentation

Mechanical rename across documentation. Runs in parallel with Part 04 (touches disjoint files). Route to `technical-writer`.

## Step 1 — Rename env vars across product docs

Files modified (per spec § Documentation pages requiring updates):

| File | Substitutions |
| --- | --- |
| `websites/fit/docs/getting-started/leaders/map/index.md` | `MAP_SUPABASE_URL` → `SUPABASE_URL`; `MAP_SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY` (5 occurrences total at lines 181, 182, 287, 363, 403); `fit-map activity start` references that surrounded the variables become "Run `just env-setup`" where the variable is sourced from a local install, but stay as-is where the doc instructs an engineer-side install. |
| `websites/fit/docs/products/engineering-data-sources/index.md` | `MAP_SUPABASE_JWT_SECRET` → `SUPABASE_JWT_SECRET`; `MAP_SUPABASE_URL` → `SUPABASE_URL`; `MAP_SUPABASE_ANON_KEY` → `SUPABASE_ANON_KEY` |
| `websites/fit/docs/products/provisioning-engineers/index.md` | `MAP_SUPABASE_URL` → `SUPABASE_URL`; `MAP_SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY` |
| `websites/fit/docs/products/issuing-service-account-tokens/index.md` | Same three names (lines 22–23, 88) |
| `websites/fit/docs/products/signing-in-to-landmark/index.md` | `MAP_SUPABASE_URL` → `SUPABASE_URL`; `MAP_SUPABASE_ANON_KEY` → `SUPABASE_ANON_KEY` (line 25) |
| `.claude/skills/fit-summit/references/roster.md` | `MAP_SUPABASE_URL` → `SUPABASE_URL`; `MAP_SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY` (line 36) |

Verification per page: `rg MAP_SUPABASE_ <file>` returns zero matches; the page still reads as intended (the env var rename does not require reflowing prose).

## Step 2 — Update operations page recipe references

Files modified: `websites/fit/docs/internals/operations/index.md`.

At line 41 and any other reference, swap:

- `just env-secrets   # Generate SERVICE_SECRET, JWT_SECRET` → `just env-setup    # Generate every secret in .env`
- Any subsequent reference to `just env-storage` is removed (the responsibility merged into `env-setup`).
- The "JWT_SECRET" mention in the comment becomes "SUPABASE_JWT_SECRET".

If the page describes the env-files split (`.env.storage.minio` / `.env.storage.supabase`), delete that section — those files are gone (Part 02 step 3).

Verification: `rg 'just env-secrets|just env-storage|env\.storage\.' websites/fit/docs/internals/operations/index.md` returns zero matches.

## Step 3 — Repo-wide doc grep gate

Files modified: none (verification).

```sh
rg 'MAP_SUPABASE_|just env-secrets|just env-storage' websites .claude/skills *.md \
  --glob '!specs/**' --glob '!wiki/**'
```

Expected: zero matches.

If any other page mentions the variables and was not in the spec's documentation table, fix it in lockstep — the spec table is the curated list, not an exhaustive guarantee.

## Dependencies

- Independent of Part 04 (touches docs only).
- Should land after Part 03 so the docs match the code in `main`; if it lands before Part 03 ships, the docs describe a code state that does not yet exist on `main`. Coordinate the merge order so the two PRs land within the same merge train.
