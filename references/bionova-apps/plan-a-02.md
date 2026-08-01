# Plan 1160-a-02 — Schema + RLS + interest_signals migration

Add the one hand-written PostgreSQL migration (`interest_signals`) and the
Row-Level Security policies that terrain output cannot generate. The clinical
schema itself comes from terrain in part 03. This part authors files only.

**Order**: part 02 commits files to the repo, but `supabase db push` cannot
apply them standalone. The `interest_signals` FK targets `trials(id)`, which
only exists after part 03's terrain SQL applies. All end-to-end verification
(RLS test, `supabase db push`) runs at the end of part 03, after both the
terrain migrations and the hand-written migrations apply. Part 02's CI step
covers **static lint** only: SQL syntax with `supabase db lint` (which does
not need a DB), markdown lint on the README, and file-presence assertions.

All paths are inside `bionova-apps/`.

## Step 1 — Decide the migration directory and the order

The terrain pipeline writes timestamped SQL files with the
`supabase_migration` output sink (part 03 configures it). Hand-written
migrations sit alongside terrain-generated ones. The numeric prefix orders the
sequence. Terrain output carries the prefix `20260101*` (the terrain default).
So hand-written migrations dated `20260601*` and later sort after every
terrain migration, even after a regeneration.

Decision: hand-written migrations live in
`products/polaris/site/supabase/migrations/` with prefix `2026060100*`.
`setup.sh` (step 5 fills it in) copies terrain output. It then applies the
migrations in directory order with `supabase db push`.

Verify: `ls products/polaris/site/supabase/migrations/` (after part 03 runs)
shows terrain files first, then hand-written.

## Step 2 — Create `supabase/` directory + config

Created:

| File | Purpose |
| --- | --- |
| `products/polaris/site/supabase/config.toml` | Supabase CLI config — `project_id = "bionova-polaris"`, `[db] port = 5432`, `[auth] enabled = true`, `[storage] enabled = true` |
| `products/polaris/site/supabase/migrations/.gitkeep` | Placeholder. Terrain populates it and part 02 adds the hand-written file |
| `products/polaris/site/supabase/seed.sql` | empty (terrain handles the seed) |

Verify: `supabase --version` succeeds (this assumes the CLI is installed with
`npx supabase`). `supabase db lint` parses config.toml without error.

## Step 3 — Author `interest_signals` migration

Created:
`products/polaris/site/supabase/migrations/20260601000000_interest_signals.sql`

Content:

```sql
-- interest_signals: anonymous interest indicator (no PII).
-- trial_id is TEXT (not UUID) to match render-sql.js's emitted trials.id type.
CREATE TABLE interest_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id TEXT NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  screener_answers JSONB NOT NULL,
  match_score TEXT NOT NULL
    CHECK (match_score IN ('eligible', 'possibly_eligible', 'not_eligible')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX interest_signals_trial_id_idx ON interest_signals(trial_id);
CREATE INDEX interest_signals_match_score_idx ON interest_signals(match_score);

ALTER TABLE interest_signals ENABLE ROW LEVEL SECURITY;
```

Verify: after `supabase db push`, `\d interest_signals` shows the columns, the
constraints, and the indexes. The FK to `trials(id)` resolves. This requires
part 03's terrain output to apply first.

## Step 3b — Author `condition_embeddings` unique-constraint migration

Created:
`products/polaris/site/supabase/migrations/20260601000005_condition_embeddings_unique.sql`

```sql
-- libsyntheticrender emits condition_embeddings.condition_id without a UNIQUE
-- constraint; PostgREST on_conflict upsert (embed-seed in part 04) requires one.
CREATE UNIQUE INDEX IF NOT EXISTS condition_embeddings_condition_id_uidx
  ON condition_embeddings(condition_id);
```

The version must be a **distinct 14-digit timestamp**. `supabase db push` keys
each migration on the leading digits before the first underscore. So a suffixed
`20260601000000a_…` collides with `20260601000000_interest_signals.sql`, and
`supabase db push` skips it silently. Nothing then creates the index, and the
embed-seed upsert later fails with `42P10`. `20260601000005` sorts last among
the hand-written migrations. That order is fine. The index only has to exist
before `embed-seed` runs at setup time. It does not have to exist before any
other migration.

Verify: after `supabase db push`, `\d condition_embeddings` shows the
unique index `condition_embeddings_condition_id_uidx`.

## Step 4 — Author RLS policies migration

Created:
`products/polaris/site/supabase/migrations/20260601000001_rls_policies.sql`

Content (covers every table per design):

```sql
-- Public-read tables (data terrain produced)
ALTER TABLE conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE researchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE condition_embeddings ENABLE ROW LEVEL SECURITY;

-- Public-read policies are emitted by libsyntheticrender (terrain output);
-- this migration only adds the non-overlapping policies below. See Step 5
-- for the reconciliation rationale.

-- Staff writes on trials + criteria
CREATE POLICY trials_staff_write ON trials FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'staff');
CREATE POLICY trials_staff_update ON trials FOR UPDATE USING (auth.jwt() ->> 'role' = 'staff');
CREATE POLICY criteria_staff_write ON criteria FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'staff');
CREATE POLICY criteria_staff_update ON criteria FOR UPDATE USING (auth.jwt() ->> 'role' = 'staff');

-- interest_signals: anonymous insert, staff read
CREATE POLICY interest_signals_anon_insert ON interest_signals FOR INSERT WITH CHECK (true);
CREATE POLICY interest_signals_staff_read ON interest_signals FOR SELECT USING (auth.jwt() ->> 'role' = 'staff');

-- Service role bypass (Edge Functions): grant unrestricted on every product table
GRANT ALL ON conditions, sites, researchers, trials, criteria, trial_conditions, trial_sites, condition_embeddings, condition_explainers, trial_faqs, consent_summaries, site_descriptions, patient_stories, therapy_descriptions, interest_signals TO service_role;
```

Note: `render-sql.js` in libsyntheticrender may already emit
`public_read` policies for the terrain-generated tables (per design key
decision). If it does, this migration's `_public_read` policies collide on a
duplicate name. Step 5 below resolves this.

Verify: after `supabase db push` against a freshly seeded DB, `SELECT *
FROM trials` succeeds as the anon role. `INSERT INTO trials …` fails as anon.
`INSERT INTO interest_signals (trial_id, screener_answers, match_score)
VALUES (…)` succeeds as anon.

## Step 5 — Reconcile with terrain-emitted RLS

`libsyntheticrender/src/render/render-sql.js` always emits one
`CREATE POLICY public_read ON <table> FOR SELECT USING (true)` per
clinical table. The source confirmed this at plan-write time. So terrain's
output contains `public_read` policies (and
`ALTER TABLE … ENABLE ROW LEVEL SECURITY`) for every table it emits:
`conditions`, `sites`, `researchers`, `trials`, `criteria`, junction
tables, `condition_embeddings`, and the six prose tables
(`condition_explainers`, `trial_faqs`, `consent_summaries`,
`site_descriptions`, `patient_stories`, `therapy_descriptions`). The prose
tables are read-only to the public. So terrain's `public_read` is the only
policy they need. This migration adds nothing for them beyond the
`service_role` GRANT above.

To avoid policy-name collision with the plan-02 migration:

- Plan-02's hand-written file does NOT emit `*_public_read` policies at
  all. Drop the `CREATE POLICY conditions_public_read …` block and the
  rest of the public-read group from `20260601000001_rls_policies.sql`.
- Plan-02 keeps only: `ALTER TABLE interest_signals ENABLE RLS` (already
  in the interest_signals migration), the staff-write policies on
  `trials`+`criteria`, the `interest_signals_anon_insert`/`_staff_read`
  policies, and the `service_role` GRANT.
- render-sql.js also already emits terrain's
  `ALTER TABLE … ENABLE ROW LEVEL SECURITY`. Do not duplicate it.

Updated `20260601000001_rls_policies.sql` body:

```sql
-- Self-contained auth.jwt() helper. GoTrue defines this at runtime, but this
-- migration's policies depend on it and may apply before GoTrue has migrated,
-- so define the canonical Supabase version here to keep the migration
-- self-contained (idempotent CREATE OR REPLACE).
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb) $$;

-- Staff writes on trials + criteria
CREATE POLICY trials_staff_write ON trials FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'staff');
CREATE POLICY trials_staff_update ON trials FOR UPDATE USING (auth.jwt() ->> 'role' = 'staff');
CREATE POLICY criteria_staff_write ON criteria FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'staff');
CREATE POLICY criteria_staff_update ON criteria FOR UPDATE USING (auth.jwt() ->> 'role' = 'staff');

-- interest_signals: anonymous insert, staff read
CREATE POLICY interest_signals_anon_insert ON interest_signals FOR INSERT WITH CHECK (true);
CREATE POLICY interest_signals_staff_read ON interest_signals FOR SELECT USING (auth.jwt() ->> 'role' = 'staff');
-- RLS gates rows but NOT base-table privileges: anon must also hold the INSERT
-- grant or the insert fails with "permission denied" before RLS even runs.
GRANT INSERT ON interest_signals TO anon, authenticated;

-- Service role bypass for Edge Functions
GRANT ALL ON conditions, sites, researchers, trials, criteria, trial_conditions, trial_sites, condition_embeddings, condition_explainers, trial_faqs, consent_summaries, site_descriptions, patient_stories, therapy_descriptions, interest_signals TO service_role;
```

If render-sql.js's behavior changes (e.g., 1140's follow-up alters which
tables get policies), the implementer re-reads the source. The implementer then
updates this migration and notes the deviation in the part-02 PR body.

Verify (after part 03 ships): `psql -c "SELECT policyname FROM pg_policies
WHERE schemaname='public' ORDER BY tablename, policyname;"` shows no
duplicates and includes both `public_read` (terrain) and the staff/anon
policies (this migration).

## Step 6 — Pin Supabase CLI version and declare in setup.sh

`setup.sh` and CI both use the `supabase` CLI. Pin the version explicitly so
`npx` does not download a moving target.

Created: `.tool-versions` entry (add it to the part-01 file):
`supabase 1.219.2`

Part 03 adds the actual `db push` call after terrain output exists. Edit
`setup.sh` (the part 01 skeleton) and expand Step B:

```sh
# Step B — apply migrations (terrain output staged in part 03 + hand-written here)
# Migration ordering is filename-sorted: terrain's 20260101* files apply before
# hand-written 20260601* files, so the interest_signals FK to trials(id) resolves.
echo "Running supabase db push…"
cd "$ROOT/products/polaris/site"
npx -y supabase@1.219.2 db push --db-url "postgres://postgres:${POSTGRES_PASSWORD}@localhost:5432/postgres"
cd "$ROOT"
```

Verify: `npx -y supabase@1.219.2 --version` prints `1.219.2`. Part 03 verifies
the end-to-end DB application at its end. This part's CI runs static SQL lint
only.

## Step 7 — Author RLS test fixture (run at part-03 verification time)

Created: `products/polaris/site/supabase/tests/rls.test.sql` —
pgTAP-format SQL test that asserts:

- anon can SELECT from trials
- anon cannot INSERT into trials
- anon can INSERT into interest_signals
- anon cannot SELECT from interest_signals
- staff (with JWT role claim) can INSERT trials

Test runner: `supabase test db` from `products/polaris/site/`. Part-02 PR
CI does NOT run this test (no terrain output → no trials table). Part 03 runs
the test at its end, after the full schema applies.

## Step 8 — Open part-02 PR

```sh
git checkout -b db/interest-signals-rls
git add products/polaris/site/supabase/
git add setup.sh
git commit -m "db: interest_signals migration + RLS policies"
git push -u origin db/interest-signals-rls
gh pr create --title "db: interest_signals migration + RLS policies" --body "Implements plan-a-02 of spec 1160. Adds hand-written migration and RLS policies; defers terrain output to part 03."
```

Verify: PR CI passes (`supabase db lint` + `bun run lint`).

## Verification (end of part 02)

- [ ] `products/polaris/site/supabase/migrations/20260601000000_interest_signals.sql`
      exists with table, indexes, RLS enable.
- [ ] `products/polaris/site/supabase/migrations/20260601000001_rls_policies.sql`
      exists. It does not duplicate any terrain-emitted policy name.
- [ ] `supabase db lint` (static SQL syntax check, no DB needed) exits 0 on the
      migrations directory.
- [ ] `setup.sh` Step B invokes `npx -y supabase@1.219.2 db push` (part 03
      validates the full DB application at its end).
- [ ] PR CI runs only static checks. Part 03's verification list holds the
      e2e DB tests.

— Staff Engineer 🛠️
