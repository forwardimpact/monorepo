# Plan Part 01 — Repo Bootstrap and the PG On Rails Stack

Stand up `forwardimpact/bionova-apps` through the scaffolding skill gates.
Then layer the Polaris workspace and the self-hosted Supabase stack onto
the skeleton. All paths are relative to the `bionova-apps/` repo root.

## Skill gates

The **monorepo-setup** skill stands up the repository skeleton end to end
and runs `jidoka-setup` and `kata-setup` to completion. It is a hard gate
with its own done-when checklist. This part restates none of it. Where a
skill-owned file needs bionova content, extend the file. Never replace
it.

Only the bionova-specific extensions belong here:

- **Polaris workspace layering.** The root manifest gains ESM
  (`"type": "module"`), the three Polaris workspaces (`handlers`, `cli`,
  `site`), `fit-terrain` as a build-time devDependency that no surface
  imports, and engine minimums per spec § Version policy. The Deno
  service `services/polaris-functions/` is not a Bun workspace; lint and
  test scripts run the JS tooling and the Deno tooling in separate
  steps.
- **Gitignore appends.** The rendered seed output (`data/synthetic/.build/`,
  the embeddings JSONL, the staged seed migrations), the per-service
  runtime data volumes (`infrastructure/*/data/`), and the APM skill
  packs plus agent profiles, which the skeleton's bootstrap script
  reconstitutes on every environment.
- **Bionova-only CI concerns**, one workflow per concern, each
  third-party action SHA-pinned:

| Workflow | Concern |
| --- | --- |
| `check-compose` | The compose file parses against the example env |
| `check-seed` | Render determinism: run the seed build, assert at least 15 staged seed migrations, verify `SEED.sha256` |
| `check-edge` | `deno check`, `deno test`, `deno lint` in `services/polaris-functions/` |
| `check-e2e` | Render the seed, stage the TEI model per C9, boot the stack, run setup, run the destructive smoke |
| `deploy` | Railway watch-path deploy on push to `main` (part 05) |

## Compose stack

`docker-compose.yml` at the repo root defines 12 long-running services
plus the `storage-init` oneshot, all on one Docker network. Image tags,
ports, and probe text follow C1, C2, C3, and C9.

| Service | Role | Probe class |
| --- | --- | --- |
| `kong` | API gateway on 8000 | native CLI |
| `postgres` | `supabase/postgres` base image: it ships pgvector, pg_cron, pg_net, and the other required extensions | native CLI |
| `pgbouncer` | Transaction pooler for PostgREST only (C1, C2) | TCP connect |
| `postgrest` | Data API from the schema; image and probe per C1 | busybox TCP |
| `gotrue` | Auth; direct Postgres connection (C2) | HTTP spider |
| `realtime` | Baseline service; direct Postgres connection (C2) | TCP connect |
| `minio` | S3 backend | HTTP |
| `storage` | Supabase storage API over MinIO; direct Postgres connection (C2) | HTTP spider |
| `storage-init` | Oneshot sidecar: creates the `trial-documents` bucket, then exits | completes successfully |
| `imgproxy` | Baseline image service | native CLI |
| `tei` | Embeddings service; port per C1, runtime options and model fetch per C9; 120 s start period | TCP connect |
| `polaris-functions` | Deno edge functions | TCP connect |
| `polaris-site` | Next.js frontend on host port 3001 | TCP connect |

The two product services build with the repo root as context, because
their Dockerfiles copy the shared handlers workspace.

## Kong routes

`infrastructure/kong/kong.yml` declares five routes. The `key-auth` plus
`acl` plugins sit on every route and read the `apikey` header.

| Path | Upstream |
| --- | --- |
| `/rest/v1/*` | PostgREST |
| `/auth/v1/*` | GoTrue |
| `/realtime/v1/*` | Realtime |
| `/storage/v1/*` | Storage |
| `/functions/v1/*` | polaris-functions |

## Postgres init

The `supabase/postgres` image owns its own role and schema bootstrap.
Two init scripts bracket it and defer to it:

- A first script (sorts before the image bootstrap) creates the missing
  `postgres` role, guarded with an existence check, because later
  scripts reference it before the image creates one.
- A last script (sorts after the image bootstrap) connects as
  `supabase_admin`. It creates the extensions Polaris needs, aligns the
  service-role login passwords with `POSTGRES_PASSWORD`, promotes
  `postgres` to superuser so `db push` can create objects, and grants
  the API roles to `authenticator`.

The init scripts never re-create the image's own roles or schemas. A
script that does collides with the image bootstrap and fails the
container start.

## `.env` contract

`.env.example` commits the template; `.env` is gitignored. Keys:
`JWT_SECRET`, `POSTGRES_PASSWORD`, `ANON_KEY`, `SERVICE_ROLE_KEY`,
`REALTIME_SECRET`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`. The anon
and service-role keys are JWTs signed with `JWT_SECRET` and must stay in
sync with the copies in the Kong config (C4).

## Verification

- All 12 long-running services reach `healthy` and the `storage-init`
  oneshot completes.
- Each Kong route answers through `http://localhost:8000`.
- PostgREST answers through Kong on `/rest/v1`, and the handler clients
  (part 03) target it exclusively as the data API.
- The skill gates pass their own done-when checklists. This part adds no
  restated steps.

— Staff Engineer 🛠️
