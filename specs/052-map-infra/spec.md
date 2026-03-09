# Map Supabase Infrastructure

Stand up the Supabase infrastructure that the Map data product needs to run its
ELT pipeline, store raw documents, and serve activity data from database tables.
Integrate with the monorepo's environment management, config management, and
service management so that Map infrastructure follows the same patterns as every
other service.

## Why

Map's activity layer is designed around Supabase — the SQL schema, the ingestion
code, and the query functions all use the Supabase client. But the Supabase
instance itself has no defined infrastructure: there is no configuration for
local development, no edge function deployment, no storage bucket setup, and no
migration runner. Every developer must manually configure Supabase or skip the
activity layer entirely.

This blocks three workflows:

1. **Local development.** Without a local Supabase instance, developers cannot
   run or test the activity pipeline. The ingestion code, transforms, and
   queries all require a Supabase client connected to a real instance.

2. **Edge function deployment.** The ELT pipeline (spec 051) requires edge
   functions for the Extract step (GitHub webhook receiver, GetDX sync
   scheduler, people upload endpoint). There is no deployment configuration or
   development workflow for edge functions.

3. **Synthetic data loading.** The synthetic data pipeline (spec 060) needs to
   write raw documents to Supabase Storage and then run transforms. Without
   infrastructure in place, synthetic data can only be generated as local files
   with no way to exercise the full pipeline.

## What

### Supabase project configuration

A Supabase project configuration lives in `products/map/` and defines
everything needed to run Map's infrastructure locally and deploy to production.

### Database migrations

The existing SQL schema (`activity/migrations/001_activity_schema.sql`) is
executed by Supabase's migration runner. Additional migrations may be added for
indexes, RLS policies, or the `get_team` recursive CTE function.

### Storage bucket

A `raw` storage bucket for the ELT pipeline's Extract phase. Stores individual
raw documents (GitHub webhooks, GetDX API responses, people uploads) as JSON
files organized by source and identifier.

### Edge functions

Four edge functions handle the Extract and Transform phases of the ELT pipeline:

| Function            | Trigger                    | Purpose                                         |
| ------------------- | -------------------------- | ----------------------------------------------- |
| `github-webhook`    | HTTP POST (GitHub webhook) | Extract: store raw webhook, Transform: process  |
| `getdx-sync`        | Scheduled (cron)           | Extract: fetch + store GetDX APIs, Transform    |
| `people-upload`     | HTTP POST (manual)         | Extract: store raw file, Transform: process     |
| `transform`         | HTTP POST (manual/cron)    | Transform: reprocess all raw data               |

### Environment integration

Map's Supabase variables slot into the monorepo's layered `.env` system. The
Supabase URL and keys live in `.env.storage.supabase` because they are
storage-backend-specific. GetDX API credentials live in `.env` because they are
deployment-wide secrets unrelated to the storage layer.

| Variable                       | Layer                        | Purpose                        |
| ------------------------------ | ---------------------------- | ------------------------------ |
| `MAP_SUPABASE_URL`             | `.env.storage.supabase`      | Supabase API URL               |
| `MAP_SUPABASE_SERVICE_ROLE_KEY`| `.env.storage.supabase`      | Service-role JWT               |
| `MAP_SUPABASE_ANON_KEY`        | `.env.storage.supabase`      | Anonymous JWT (edge functions)  |
| `MAP_SUPABASE_DB_PORT`         | `.env.{local\|docker}`       | Postgres port (env-specific)   |
| `GETDX_API_TOKEN`              | `.env`                       | GetDX API credential           |
| `GETDX_BASE_URL`               | `.env`                       | GetDX API base URL             |

`scripts/env-storage.js` generates `MAP_SUPABASE_SERVICE_ROLE_KEY` and
`MAP_SUPABASE_ANON_KEY` using the same `createJwt` / `updateEnvFile` pattern
it already uses for `SUPABASE_SERVICE_ROLE_KEY`.

### Config integration

A `service.map` section in `config/config.json` holds Map-specific settings
that do not belong in environment variables:

```json
{
  "service": {
    "map": {
      "supabase": {
        "migrations_dir": "products/map/supabase/migrations",
        "storage_bucket": "raw"
      },
      "getdx": {
        "sync_interval": "0 */6 * * *"
      }
    }
  }
}
```

Code reads these through `libconfig`:

```js
const config = await createServiceConfig('map')
config.supabase.migrations_dir // "products/map/supabase/migrations"
```

### Service management

Supabase is an external dependency, like TEI. It follows the same pattern:

| Concern          | TEI pattern                          | Supabase pattern                    |
| ---------------- | ------------------------------------ | ----------------------------------- |
| Install          | `make tei-install` (cargo)           | `make supabase-install` (brew)      |
| Start (local)    | `make tei-start` → fit-rc            | `make supabase-start` → fit-rc      |
| Start (docker)   | `docker compose` service             | `docker compose --profile supabase` |
| Health check     | `curl localhost:8090/health`         | `curl localhost:54321/rest/v1/`     |
| Config entry     | `init.services[0]` (longrun)         | `init.services` (oneshot)           |
| Environment      | `EMBEDDING_BASE_URL` in `.env.local` | `MAP_SUPABASE_URL` in `.env.storage.supabase` |

In `config/config.json`, Supabase is a oneshot service in `init.services` —
started before the services that depend on it, stopped after them:

```json
{ "name": "supabase", "type": "oneshot", "up": "make supabase-up", "down": "make supabase-down" }
```

Makefile targets follow existing conventions (`ENVLOAD`, phony targets, help
comments):

```makefile
supabase-install:  ## Install Supabase CLI
supabase-start:    ## Start local Supabase (oneshot via fit-rc)
supabase-stop:     ## Stop local Supabase
supabase-migrate:  ## Run database migrations
supabase-status:   ## Health check
```

### Local development

Supabase CLI provides `supabase start` for local development with a full
Postgres instance, Storage, and Edge Functions runtime. The monorepo wraps
this behind `make supabase-start` so that environment loading, config reading,
and service ordering are handled consistently.

Developers run the full ELT pipeline locally with:

```sh
make env-setup                    # Generate secrets including Map Supabase keys
make supabase-start               # Start Supabase (Postgres + Storage + Edge Runtime)
make supabase-migrate             # Apply database migrations
make rc-start                     # Start remaining services (loads .env layers)
```

## Scope

### In scope

- Supabase project initialization in `products/map/`.
- Database migration configuration using the existing SQL schema.
- Storage bucket creation for raw documents.
- Edge function scaffolding for the four ELT entry points.
- Environment variables in `.env.example` and `.env.storage.supabase.example`.
- Secret generation in `scripts/env-storage.js`.
- Service config in `config/config.example.json` (`service.map` section).
- Oneshot service entry in `init.services`.
- Makefile targets for install, start, stop, migrate, status.
- Docker Compose service definition (profile: `supabase`).
- Local development setup via `make supabase-start`.

### Out of scope

- Modifying the activity database schema (same tables from spec 050).
- Modifying the ELT pipeline logic (see spec 051).
- Production Supabase project provisioning (hosting, billing, DNS).
- Authentication and RLS policies beyond basic service-role access.
- Modifying the query functions in `activity/queries/`.
