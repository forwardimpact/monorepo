# Plan 1160-a-02 — Schema + RLS + interest_signals migration

Add the one hand-written PostgreSQL migration (`interest_signals`) and the
Row-Level Security policies that terrain output cannot generate. The clinical
schema itself comes from terrain in part 03; this part authors files only.

**Ordering**: part 02 commits files to the repo, but `supabase db push`
cannot apply them standalone — the `interest_signals` FK targets
`trials(id)` which only exists after part 03's terrain SQL applies. All
end-to-end verification (RLS test, `supabase db push`) runs at the end of
part 03 once both terrain and hand-written migrations have applied. Part
02's CI step is limited to **static lint**: SQL syntax via `supabase db
lint` (which does not require a DB), markdown lint on the README, and
file-presence assertions.

All paths are inside `bionova-apps/`.

## Step 1 — Decide migration directory + ordering

The terrain pipeline writes timestamped SQL files via the
`supabase_migration` output sink (configured in part 03). Hand-written
migrations sit alongside terrain-generated ones; numeric prefix orders the
sequence. Terrain output is prefixed `20260101*` (terrain default), so
hand-written migrations dated `20260601*` and later sort after every
terrain migration regardless of regeneration.

Decision: hand-written migrations live in
`products/polaris/site/supabase/migrations/` with prefix `2026060100*`.
`setup.sh` (filled in step 5) copies terrain output then applies migrations
in directory order via `supabase db push`.

Verify: `ls products/polaris/site/supabase/migrations/` (after part 03 runs)
shows terrain files first, then hand-written.

## Step 2 — Create `supabase/` directory + config

Created:

| File | Purpose |
| --- | --- |
| `products/polaris/site/supabase/config.toml` | Supabase CLI config — `project_id = "bionova-polaris"`, `[db] port = 5432`, `[auth] enabled = true`, `[storage] enabled = true` |
| `products/polaris/site/supabase/migrations/.gitkeep` | Placeholder; terrain populates and part 02 adds the hand-written file |
| `products/polaris/site/supabase/seed.sql` | empty (terrain handles seeding) |

Verify: `supabase --version` succeeds (CLI assumed installed via `npx
supabase`); `supabase db lint` parses config.toml without error.

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

Verify: after `supabase db push`, `\d interest_signals` shows columns,
constraints, indexes; FK to `trials(id)` resolves (requires part 03's
terrain output to have applied first).

## Step 3b — Author `condition_embeddings` unique-constraint migration

Created:
`products/polaris/site/supabase/migrations/20260601000000a_condition_embeddings_unique.sql`

```sql
-- libsyntheticrender emits condition_embeddings.condition_id without a UNIQUE
-- constraint; PostgREST on_conflict upsert (embed-seed in part 04) requires one.
CREATE UNIQUE INDEX IF NOT EXISTS condition_embeddings_condition_id_uidx
  ON condition_embeddings(condition_id);
```

Filename `…000000a_…` sorts after `20260601000000_interest_signals.sql`
but before `20260601000001_rls_policies.sql`, ensuring the index exists
before any policy or trigger references it.

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
GRANT ALL ON conditions, sites, researchers, trials, criteria, trial_conditions, trial_sites, condition_embeddings, interest_signals TO service_role;
```

Note: `render-sql.js` in libsyntheticrender may already emit
`public_read` policies for the terrain-generated tables (per design key
decision). If it does, this migration's `_public_read` policies will
duplicate-name conflict. Step 5 below resolves this.

Verify: after `supabase db push` against a freshly seeded DB, `SELECT *
FROM trials` succeeds as anon role; `INSERT INTO trials …` fails as anon;
`INSERT INTO interest_signals (trial_id, screener_answers, match_score)
VALUES (…)` succeeds as anon.

## Step 5 — Reconcile with terrain-emitted RLS

`libsyntheticrender/src/render/render-sql.js` always emits one
`CREATE POLICY public_read ON <table> FOR SELECT USING (true)` per
clinical table (verified by reading the source at plan-write time).
That means terrain's output will contain `public_read` policies for
`conditions`, `sites`, `researchers`, `trials`, `criteria`, junction
tables, and `condition_embeddings`.

To avoid policy-name collision with the plan-02 migration:

- Plan-02's hand-written file does NOT emit `*_public_read` policies at
  all. Drop the `CREATE POLICY conditions_public_read …` block and the
  rest of the public-read group from `20260601000001_rls_policies.sql`.
- Plan-02 keeps only: `ALTER TABLE interest_signals ENABLE RLS` (already
  in the interest_signals migration), the staff-write policies on
  `trials`+`criteria`, the `interest_signals_anon_insert`/`_staff_read`
  policies, and the `service_role` GRANT.
- Terrain's `ALTER TABLE … ENABLE ROW LEVEL SECURITY` is also already
  emitted by render-sql.js — do not duplicate.

Updated `20260601000001_rls_policies.sql` body:

```sql
-- Staff writes on trials + criteria
CREATE POLICY trials_staff_write ON trials FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'staff');
CREATE POLICY trials_staff_update ON trials FOR UPDATE USING (auth.jwt() ->> 'role' = 'staff');
CREATE POLICY criteria_staff_write ON criteria FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'staff');
CREATE POLICY criteria_staff_update ON criteria FOR UPDATE USING (auth.jwt() ->> 'role' = 'staff');

-- interest_signals: anonymous insert, staff read
CREATE POLICY interest_signals_anon_insert ON interest_signals FOR INSERT WITH CHECK (true);
CREATE POLICY interest_signals_staff_read ON interest_signals FOR SELECT USING (auth.jwt() ->> 'role' = 'staff');

-- Service role bypass for Edge Functions
GRANT ALL ON conditions, sites, researchers, trials, criteria, trial_conditions, trial_sites, condition_embeddings, interest_signals TO service_role;
```

If render-sql.js's behavior changes (e.g., 1140's follow-up alters which
tables get policies), the implementer re-reads the source, updates this
migration accordingly, and notes the deviation in the part-02 PR body.

Verify (after part 03 ships): `psql -c "SELECT policyname FROM pg_policies
WHERE schemaname='public' ORDER BY tablename, policyname;"` shows no
duplicates and includes both `public_read` (terrain) and the staff/anon
policies (this migration).

## Step 6 — Pin Supabase CLI version and declare in setup.sh

The `supabase` CLI is used at `setup.sh` and CI time. Pin the version
explicitly so `npx` does not download a moving target.

Created: `.tool-versions` entry (added to part-01 file):
`supabase 1.219.2`

Edit `setup.sh` (part 01 skeleton) — expand Step B (actual `db push` call
is added in part 03 after terrain output exists):

```sh
# Step B — apply migrations (terrain output staged in part 03 + hand-written here)
# Migration ordering is filename-sorted: terrain's 20260101* files apply before
# hand-written 20260601* files, so the interest_signals FK to trials(id) resolves.
echo "Running supabase db push…"
cd "$ROOT/products/polaris/site"
npx -y supabase@1.219.2 db push --db-url "postgres://postgres:${POSTGRES_PASSWORD}@localhost:5432/postgres"
cd "$ROOT"
```

Verify: `npx -y supabase@1.219.2 --version` prints `1.219.2`. End-to-end
DB application is verified at the end of part 03 (this part's CI runs
static SQL lint only).

## Step 7 — Author RLS test fixture (run at part-03 verification time)

Created: `products/polaris/site/supabase/tests/rls.test.sql` —
pgTAP-format SQL test asserting:

- anon can SELECT from trials
- anon cannot INSERT into trials
- anon can INSERT into interest_signals
- anon cannot SELECT from interest_signals
- staff (with JWT role claim) can INSERT trials

Test runner: `supabase test db` from `products/polaris/site/`. Part-02 PR
CI does NOT run this test (no terrain output → no trials table); the test
is exercised at the end of part 03 once the full schema is applied.

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
      exists; does not duplicate any terrain-emitted policy name.
- [ ] `supabase db lint` (static SQL syntax check, no DB needed) exits 0 on the
      migrations directory.
- [ ] `setup.sh` Step B invokes `npx -y supabase@1.219.2 db push` (full DB
      application validated at end of part 03).
- [ ] PR CI runs only static checks; e2e DB tests are deferred to part 03's
      verification list.

— Staff Engineer 🛠️
