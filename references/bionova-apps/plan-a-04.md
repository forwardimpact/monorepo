# Plan 1160-a-04 — Edge functions

Implement the four Supabase Edge Functions under
`services/polaris-functions/`. All four are Deno modules. Kong serves them at
`/functions/v1/{name}`.

All paths are inside `bionova-apps/`.

## Step 1 — Scaffold `services/polaris-functions/`

Created:

| File | Purpose |
| --- | --- |
| `services/polaris-functions/deno.json` | Deno config: import map, `tasks.start: "deno run --allow-net --allow-env --allow-read main.ts"` |
| `services/polaris-functions/import_map.json` | `{"imports": {"std/": "https://deno.land/std@0.224.0/", "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.45.0"}}` |
| `services/polaris-functions/Dockerfile` | FROM `denoland/deno:1.46.3`; copies module dirs; ENTRYPOINT `deno task start` |
| `services/polaris-functions/main.ts` | HTTP router — dispatches `/{name}` to the `handle(req, env)` export of the module with that name |
| `services/polaris-functions/env.ts` | Reads `SUPABASE_URL` (`http://kong:8000`), `SUPABASE_SERVICE_ROLE_KEY`, `TEI_URL` (`http://tei:80`, the internal Docker DNS name, NOT `tei:8080`, which is the host-side mapping), `PGREST_URL` (`http://kong:8000/rest/v1`). Throws if any is absent |
| `services/polaris-functions/README.md` | One page that describes each function and how to invoke it locally with `curl http://localhost:8082/<name>` |

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

Verify: `deno check services/polaris-functions/main.ts` exits 0.
`curl http://localhost:8082/health` returns `ok` after `docker compose up
polaris-functions`.

## Step 2 — `embed-seed` function

Created: `services/polaris-functions/embed-seed/mod.ts`

Behavior: the function reads JSONL from a path on disk. The default path is
`/data/synthetic/seed_embeddings.jsonl`. `build-seed.sh` writes that file.
Step 8 of plan-a-03 mounts it. For each row whose `table` is `"conditions"`,
the function POSTs the prose text to TEI (`POST ${TEI_URL}/embed`). TEI returns
a 384-dim vector. The function then upserts `{ id, condition_id, embedding }`
into `condition_embeddings` through PostgREST with `on_conflict=condition_id`.
The row id is the condition id, supplied for the NOT-NULL text PK. This upsert
needs the unique index from plan-a-02 step 3b.

Request shape:

```ts
type EmbedSeedRequest = { source?: string };  // defaults to /data/synthetic/seed_embeddings.jsonl
type EmbedSeedResponse = { seeded: number; skipped: number };
```

JSONL row shape (verified against
`libraries/libsyntheticrender/src/render/render-embeddings.js:35`):

```text
{"id":"<text-id>","table":"conditions","text":"…prose…"}
```

`id` is the entity's primary key. Here it is the condition id, which populates
`condition_embeddings.condition_id`. `table` is `"conditions"` for embeddings
that come from `clinical.conditions`. embed-seed filters on this field. It
ignores any other tables in the JSONL. If a future story.dsl adds embeddings
for `trials` or `sites`, embed-seed needs an explicit upsert path per table.
For 1160, expect only `conditions`.

HuggingFace TEI `/embed` returns a 2D array `[[…], …]` when `inputs` is a
string array. It returns `[[…]]` when `inputs` is a single string. Verify this
against the TEI 1.5 release notes when you implement the function. Adjust the
shape logic if the API shifted. TEI call:

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

The PostgREST upsert uses the unique index that plan-a-02 Step 3b added
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

Idempotent: a second `embed-seed` run upserts through the unique index on
`condition_id`. The run overwrites prior embeddings in place. The terrain
output sets the `id` column of condition_embeddings. The upsert leaves that
column untouched, because PostgREST `Prefer: resolution=merge-duplicates`
updates only the columns that the request supplies explicitly.

Verify: after `setup.sh` invokes embed-seed, `psql -c "SELECT COUNT(*)
FROM condition_embeddings;"` matches the JSONL row count.

## Step 3 — `eligibility-check` function

Created: `services/polaris-functions/eligibility-check/mod.ts`

Behavior: the function takes a `trial_id` and a screener answer payload. It
reads `criteria` for that trial through PostgREST. It evaluates each
`inclusion.custom[]` and `exclusion.custom[]` string against the answer that
matches. It returns a match score.

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

Rule for the score (this matches the design decision "criteria.custom[]", with
no LLM):

| Condition | Score |
| --- | --- |
| Any exclusion criterion matches | `not_eligible` |
| All inclusion criteria match (age range, conditions_required, ecog ≤ max, prior_treatments compatible, all custom_answers true) | `eligible` |
| ≥ 1 inclusion criterion unknown (answer missing) but no exclusion fails | `possibly_eligible` |
| Otherwise | `not_eligible` |

`reasons[]` lists which criteria drove the score (one string per criterion
checked).

Verify: a curl with the seeded "Type-2 diabetes" patient profile against a
trial that matches returns `eligible`. The same curl with an excluded patient
returns `not_eligible`.

## Step 4 — `notify-updates` function

Created: `services/polaris-functions/notify-updates/mod.ts`

Behavior: a DB trigger on a `trials.status` change starts this function. The
function queries `interest_signals` for the affected trial. For each interested
`screener_answers.email`, if any, it logs a "would-notify" line. The
interest_signals rows are anonymous, so that list is usually empty. The
function stubs the email send. The design defers the GoTrue email integration.

Created:
`products/polaris/site/supabase/migrations/20260601000002_notify_trigger.sql`

The trigger uses `pg_net.http_post`. Part 01's `00-extensions.sql` already
created it through the `supabase/postgres` image. Kong requires an `apikey`
header on `/functions/v1/*` routes (part 01 step 5). So the trigger reads the
service-role key from a Postgres setting that `setup.sh` populates:

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
`would-notify` line in `docker compose logs polaris-functions`.

## Step 5 — `sync-listings` function

Created: `services/polaris-functions/sync-listings/mod.ts`

Behavior: the function re-reads the staged trial/criteria migrations from the
rendered seed. It parses out the `INSERT` statements for the `trials` and
`criteria` tables. It upserts them through PostgREST. Use it to refresh seed
data without a full `setup.sh` run. In r3 there is no committed
`data/synthetic/seed/*.sql`. `build-seed.sh` renders the SQL into the staged
migrations directory. Mount that directory read-only into the
`polaris-functions` container. Add it to the `volumes` block that plan-a-03
step 8 edits:

```yaml
  - ./products/polaris/site/supabase/migrations:/data/migrations:ro
```

`sync-listings` reads `/data/migrations/20250101*_seed_004_trials.sql` and
`*_seed_005_criteria.sql`. `build-seed.sh` populates the directory before
`docker compose up`, so the mount is non-empty when the function runs. To
refresh after a DSL re-vendor, run `build-seed.sh`. Then invoke
`sync-listings`.

Request:

```ts
type SyncRequest = { dry_run?: boolean };
type SyncResponse = { trials_upserted: number; criteria_upserted: number; dry_run: boolean };
```

`pg_cron` schedule (added to a new migration
`products/polaris/site/supabase/migrations/20260601000003_sync_schedule.sql`):

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
'{"dry_run":true}'` returns a count and does not modify data.
`SELECT * FROM cron.job;` lists `sync-listings-daily`.

## Step 6 — Tests

Created:

| File | Tests |
| --- | --- |
| `services/polaris-functions/embed-seed/test.ts` | Unit: the TEI mock returns a vector. The test calls the upsert once per row. Integration: against a live stack, the function seeds the correct count |
| `services/polaris-functions/eligibility-check/test.ts` | Unit: each score branch (`eligible`, `not_eligible`, `possibly_eligible`). Reads a canned criteria fixture |
| `services/polaris-functions/notify-updates/test.ts` | Unit: builds the correct log line. Idempotent on a repeat trigger |
| `services/polaris-functions/sync-listings/test.ts` | Unit: parses SQL INSERTs. dry_run returns counts without writes |

Test runner:
`deno test --allow-net --allow-read --allow-env services/polaris-functions/`.

Verify: `deno test` exits 0. CI runs this in the `edge-functions` job of
`.github/workflows/check-edge.yml` (part 01 scaffolded it).

## Step 7 — Open part-04 PR

```sh
git checkout -b services/polaris-functions
git add services/polaris-functions/ products/polaris/site/supabase/migrations/20260601000002_notify_trigger.sql products/polaris/site/supabase/migrations/20260601000003_sync_schedule.sql docker-compose.yml setup.sh .github/workflows/check-edge.yml
git commit -m "services: polaris-functions edge functions"
git push -u origin services/polaris-functions
gh pr create --title "services: polaris-functions edge functions" --body "Implements plan-a-04 of spec 1160. Adds embed-seed, eligibility-check, notify-updates, sync-listings; wires pg_net + cron triggers."
```

Verify: PR CI green (deno check + deno test + compose validate).

## Verification (end of part 04)

- [ ] `curl http://localhost:8082/health` returns `ok`.
- [ ] `embed-seed` populates `condition_embeddings` with a row count that
      matches the JSONL.
- [ ] `eligibility-check` returns each of `eligible`, `possibly_eligible`,
      `not_eligible` for the appropriate seeded patient × trial pair.
- [ ] `UPDATE trials SET status=…` fires `notify-updates`. The log line
      appears.
- [ ] `sync-listings` upserts seeded SQL idempotently. The `pg_cron` schedule
      appears.
- [ ] `deno test services/polaris-functions/` exits 0.

— Staff Engineer 🛠️
