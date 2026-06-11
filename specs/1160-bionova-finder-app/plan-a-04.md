# Plan 1160-a-04 — Edge functions

Implement the four Supabase Edge Functions under
`services/finder-functions/`. All four are Deno modules served through Kong
at `/functions/v1/{name}`.

All paths are inside `bionova-apps/`.

## Step 1 — Scaffold `services/finder-functions/`

Created:

| File | Purpose |
| --- | --- |
| `services/finder-functions/deno.json` | Deno config: import map, `tasks.start: "deno run --allow-net --allow-env --allow-read main.ts"` |
| `services/finder-functions/import_map.json` | `{"imports": {"std/": "https://deno.land/std@0.224.0/", "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.45.0"}}` |
| `services/finder-functions/Dockerfile` | FROM `denoland/deno:1.46.3`; copies module dirs; ENTRYPOINT `deno task start` |
| `services/finder-functions/main.ts` | HTTP router — dispatches `/{name}` to the matching module's `handle(req, env)` export |
| `services/finder-functions/env.ts` | Reads `SUPABASE_URL` (`http://kong:8000`), `SUPABASE_SERVICE_ROLE_KEY`, `TEI_URL` (`http://tei:80` — internal Docker DNS, NOT `tei:8080` which is the host-side mapping), `PGREST_URL` (`http://kong:8000/rest/v1`); throws if any missing |
| `services/finder-functions/README.md` | One-page describing each function + how to invoke locally via `curl http://localhost:8082/<name>` |

`main.ts` router shape:

```ts
import { serve } from "std/http/server.ts";
import * as embedSeed from "./embed-seed/mod.ts";
import * as eligibilityCheck from "./eligibility-check/mod.ts";
import * as notifyUpdates from "./notify-updates/mod.ts";
import * as syncListings from "./sync-listings/mod.ts";
import { env } from "./env.ts";

const handlers: Record<string, (r: Request, e: typeof env) => Promise<Response>> = {
  "embed-seed": embedSeed.handle,
  "eligibility-check": eligibilityCheck.handle,
  "notify-updates": notifyUpdates.handle,
  "sync-listings": syncListings.handle,
};

serve(async (req) => {
  const path = new URL(req.url).pathname.replace(/^\/+/, "");
  if (path === "health") return new Response("ok");
  const handler = handlers[path];
  if (!handler) return new Response("Not found", { status: 404 });
  try {
    return await handler(req, env);
  } catch (err) {
    console.error(`${path} failed:`, err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
```

Verify: `deno check services/finder-functions/main.ts` exits 0;
`curl http://localhost:8082/health` returns `ok` after `docker compose up
finder-functions`.

## Step 2 — `embed-seed` function

Created: `services/finder-functions/embed-seed/mod.ts`

Behavior: reads JSONL from a path on disk (default
`/data/synthetic/seed/seed_embeddings.jsonl`); for each row whose `table`
is `"conditions"`, POSTs the prose text to TEI (`POST ${TEI_URL}/embed`),
receives a 384-dim vector, and upserts into
`condition_embeddings(condition_id, embedding)` via PostgREST.

Request shape:

```ts
type EmbedSeedRequest = { source?: string };  // defaults to /data/synthetic/seed/seed_embeddings.jsonl
type EmbedSeedResponse = { seeded: number; skipped: number };
```

JSONL row shape (verified against
`libraries/libsyntheticrender/src/render/render-embeddings.js:35`):

```
{"id":"<text-id>","table":"conditions","text":"…prose…"}
```

`id` is the entity's primary key (here, the condition id, which is what
populates `condition_embeddings.condition_id`). `table` is `"conditions"`
for embeddings produced from `clinical.conditions` — embed-seed filters
on this field and ignores any other tables in the JSONL (if a future
story.dsl adds embeddings for `trials` or `sites`, embed-seed needs an
explicit upsert path per table, but for 1160 only `conditions` is
expected).

TEI call (HuggingFace TEI `/embed` returns a 2D array `[[…], …]` when
`inputs` is a string array, and `[[…]]` when `inputs` is a single
string — verify against TEI 1.5 release notes at implementation time and
adjust shape handling if the API has shifted):

```ts
const r = await fetch(`${env.TEI_URL}/embed`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ inputs: [text] }),  // explicit array → predictable 2D return
});
const arr = await r.json();
if (!Array.isArray(arr) || !Array.isArray(arr[0])) {
  throw new Error(`TEI returned unexpected shape: ${JSON.stringify(arr).slice(0, 80)}`);
}
const vec = arr[0];  // first (only) row of the 2D response
```

PostgREST upsert uses the unique index added in plan-a-02 Step 3b
(`condition_embeddings_condition_id_uidx`):

```ts
for (const row of rows) {
  if (row.table !== "conditions") continue;
  const text = row.text;
  const condition_id = row.id;
  const vec = await embedOne(text);
  await fetch(`${env.PGREST_URL}/condition_embeddings?on_conflict=condition_id`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ condition_id, embedding: vec }),
  });
}
```

Idempotent: re-running `embed-seed` upserts via the unique index on
`condition_id`, overwriting prior embeddings in place. condition_embeddings'
`id` column (set by terrain output) remains untouched on upsert
because PostgREST `Prefer: resolution=merge-duplicates` only updates
explicitly-supplied columns.

Verify: after `setup.sh` invokes embed-seed, `psql -c "SELECT COUNT(*)
FROM condition_embeddings;"` matches the JSONL row count.

## Step 3 — `eligibility-check` function

Created: `services/finder-functions/eligibility-check/mod.ts`

Behavior: given a `trial_id` and a screener answer payload, reads
`criteria` for that trial via PostgREST, evaluates each `inclusion.custom[]`
and `exclusion.custom[]` string against the matching answer, and returns a
match score.

Request:

```ts
type EligibilityRequest = {
  trial_id: string;
  age?: number;
  conditions?: string[];
  ecog?: number;
  prior_treatments?: string[];
  custom_answers?: Record<string, boolean>;  // keyed by criterion text
};
type EligibilityResponse = {
  match_score: "eligible" | "possibly_eligible" | "not_eligible";
  reasons: string[];
};
```

Scoring rule (matches design "criteria.custom[]" decision — no LLM):

| Condition | Score |
| --- | --- |
| Any exclusion criterion matches | `not_eligible` |
| All inclusion criteria match (age range, conditions_required, ecog ≤ max, prior_treatments compatible, all custom_answers true) | `eligible` |
| ≥ 1 inclusion criterion unknown (answer missing) but no exclusion fails | `possibly_eligible` |
| Otherwise | `not_eligible` |

`reasons[]` lists which criteria drove the score (one string per criterion
checked).

Verify: a curl with the seeded "Type-2 diabetes" patient profile against a
matching trial returns `eligible`; with an excluded patient returns
`not_eligible`.

## Step 4 — `notify-updates` function

Created: `services/finder-functions/notify-updates/mod.ts`

Behavior: triggered by a DB trigger on `trials.status` change. Queries
`interest_signals` for affected trial; for each interested
`screener_answers.email` (if any — interest_signals are anonymous so this
will usually be empty), logs a "would-notify" line. Email sending is
stubbed (GoTrue email integration deferred per design).

Created: `products/finder/site/supabase/migrations/20260601000002_notify_trigger.sql`

The trigger uses `pg_net.http_post` (already created in part 01's
`00-extensions.sql` via the `supabase/postgres` image). Kong requires an
`apikey` header on `/functions/v1/*` routes (part 01 step 5), so the
trigger reads the service-role key from a Postgres setting populated by
`setup.sh`:

```sql
-- setup.sh exports the service-role key into a Postgres setting once at boot:
-- ALTER DATABASE postgres SET app.service_role_key = '<key>';
-- The setting is read at trigger time via current_setting().

CREATE OR REPLACE FUNCTION public.notify_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  service_key text := current_setting('app.service_role_key', true);
BEGIN
  PERFORM net.http_post(
    url := 'http://kong:8000/functions/v1/notify-updates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', service_key,
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('trial_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trials_status_change_notify
AFTER UPDATE OF status ON trials
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_status_change();
```

Edit `setup.sh` Step A to populate the setting:

```sh
psql -h localhost -U postgres -c "ALTER DATABASE postgres SET app.service_role_key = '${SERVICE_ROLE_KEY}';"
```

Verify: `UPDATE trials SET status='completed' WHERE id=<some_id>;` logs a
`would-notify` line in `docker compose logs finder-functions`.

## Step 5 — `sync-listings` function

Created: `services/finder-functions/sync-listings/mod.ts`

Behavior: re-reads `data/synthetic/seed/seed_*.sql` (mounted read-only at
`/data/synthetic/seed/` per plan-a-03 step 6 — same volume the
`embed-seed` function already uses), parses out `INSERT` statements for
`trials` and `criteria` tables, upserts via PostgREST. Used to refresh
seed data without re-running full `setup.sh`. The path is deliberate:
the only mount the `finder-functions` container has on
`data/synthetic/` is `:seed`, so `sync-listings` reads the seed vendored
there by part 03 (r2) — no second bind-mount needed.

Request:

```ts
type SyncRequest = { dry_run?: boolean };
type SyncResponse = { trials_upserted: number; criteria_upserted: number; dry_run: boolean };
```

`pg_cron` schedule (added to a new migration
`products/finder/site/supabase/migrations/20260601000003_sync_schedule.sql`):

```sql
-- Reuses app.service_role_key set in 20260601000002_notify_trigger.sql's setup
SELECT cron.schedule(
  'sync-listings-daily',
  '0 3 * * *',   -- 03:00 UTC (postgres container runs UTC; set TZ=UTC in compose)
  $$SELECT net.http_post(
    url := 'http://kong:8000/functions/v1/sync-listings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', current_setting('app.service_role_key', true),
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );$$
);
```

Also edit `docker-compose.yml` `postgres` service env to add `TZ: UTC`
so the cron schedule fires at a predictable wall-clock time.

Verify: `curl -X POST http://localhost:8000/functions/v1/sync-listings -d
'{"dry_run":true}'` returns a count without modifying data;
`SELECT * FROM cron.job;` lists `sync-listings-daily`.

## Step 6 — Tests

Created:

| File | Tests |
| --- | --- |
| `services/finder-functions/embed-seed/test.ts` | Unit: TEI mock returns vector; upsert called per row. Integration: against running stack, seeds correct count |
| `services/finder-functions/eligibility-check/test.ts` | Unit: each scoring branch (`eligible`, `not_eligible`, `possibly_eligible`); reads canned criteria fixture |
| `services/finder-functions/notify-updates/test.ts` | Unit: builds correct log line; idempotent on repeat trigger |
| `services/finder-functions/sync-listings/test.ts` | Unit: parses SQL INSERTs; dry_run returns counts without writes |

Test runner: `deno test --allow-net --allow-read --allow-env services/finder-functions/`.

Verify: `deno test` exits 0; CI runs this in a new job `edge-functions` in
`.github/workflows/ci.yml`.

## Step 7 — Open part-04 PR

```sh
git checkout -b services/finder-functions
git add services/finder-functions/ products/finder/site/supabase/migrations/20260601000002_notify_trigger.sql products/finder/site/supabase/migrations/20260601000003_sync_schedule.sql docker-compose.yml setup.sh .github/workflows/ci.yml
git commit -m "services: finder-functions edge functions"
git push -u origin services/finder-functions
gh pr create --title "services: finder-functions edge functions" --body "Implements plan-a-04 of spec 1160. Adds embed-seed, eligibility-check, notify-updates, sync-listings; wires pg_net + cron triggers."
```

Verify: PR CI green (deno check + deno test + compose validate).

## Verification (end of part 04)

- [ ] `curl http://localhost:8082/health` returns `ok`.
- [ ] `embed-seed` populates `condition_embeddings` with row count matching JSONL.
- [ ] `eligibility-check` returns each of `eligible`, `possibly_eligible`, `not_eligible` for the appropriate seeded patient × trial pairing.
- [ ] `UPDATE trials SET status=…` fires `notify-updates`; log line appears.
- [ ] `sync-listings` upserts seeded SQL idempotently; `pg_cron` schedule listed.
- [ ] `deno test services/finder-functions/` exits 0.

— Staff Engineer 🛠️
