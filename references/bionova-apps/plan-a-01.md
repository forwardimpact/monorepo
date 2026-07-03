# Plan 1160-a-01 — Repo bootstrap + infrastructure

Stand up `forwardimpact/bionova-apps` **with the monorepo-setup skill**, then
layer the Polaris product and its PG On Rails Docker Compose stack onto that
skeleton — all infrastructure services configured but not yet wired to product
code.

All paths below are relative to the `bionova-apps/` repo root.

## Step 1 — Stand up the repo skeleton with the monorepo-setup skill

`bionova-apps` is a Monorepo-standard repository, so its scaffolding is **not
hand-rolled here**. Invoke the **monorepo-setup skill**, which owns the full
skeleton end to end and is authoritative for it, and let it run its upstream
skills (`coaligned-setup`, then `kata-setup`) to completion. Configuration to
hand it:

| Prompt | Value |
| --- | --- |
| Repo | `forwardimpact/bionova-apps`, public |
| Description | "BioNova Polaris — reference consumer of Forward Impact libraries" |
| Toolchain | Bun 1.2 + `just`; check/test scripts and workflows run `bun run …` / `deno …` |

Do not restate or re-implement what the skill produces. When it finishes the
repo already carries: `git` + `main`, `scripts/bootstrap.sh`, the base root
`package.json` (with `coaligned` wired into `check`), `.gitignore`, the
Monorepo directory tree, the installed `coaligned-skills` + `kata-skills` packs
and kata agent profiles under `.claude/`, `CLAUDE.md` / `CONTRIBUTING.md` /
`JTBD.md` / `.coaligned/`, the per-concern check workflows, the created remote
with the wiki enabled and `KATA_KILLSWITCH` engaged, `.claude/settings.json`
session hooks, the seeded wiki, and the `SETUP.md` operator runbook.

Everything below **layers** the Polaris product and its infrastructure onto
that skeleton. Where a skill-owned file needs bionova content (root
`package.json`, `.gitignore`, CI), this part **extends** it — it never
re-creates or overwrites a file the skill owns.

Verify: the skill's own Done-When checklist passes (skeleton present, both
upstream skills ran, `coaligned` clean, remote + wiki exist).

## Step 2 — Layer the Polaris workspace onto the skeleton

Created / extended:

| File | Change |
| --- | --- |
| `README.md` | Repo intro + quickstart (`docker compose up && ./setup.sh`) |
| `MONOREPO.md` | Repo's layout doc (three-shippable / three-support), scoped to bionova-apps |
| `LICENSE` | Apache-2.0 |
| `.nvmrc` | `20` (Node major) |
| `.tool-versions` | `bun 1.2.0`, `nodejs 20.11.1` (`supabase` added in part 02, `deno` in part 04) |
| `package.json` | **extend** the skeleton manifest — add `"type": "module"`, `engines`, the Polaris workspaces, the bionova scripts, and app devDependencies (below); keep the skeleton's `check`/`coaligned` entries |
| `.gitignore` | **append** the bionova ignores (below) to the skeleton's |
| `justfile` | Recipes: `up` (`docker compose up -d`), `down`, `setup`, `seed` (`bash scripts/build-seed.sh`), `cli`, `dev:site`, `test`, `lint` |
| `eslint.config.mjs` | Flat config; `eslint-config-prettier`; no unused vars, no console in `src/` |
| `prettier.config.mjs` | 2 spaces, single quotes, trailing commas `all` |
| `tsconfig.json` | Strict, ES2022 target, `moduleResolution: bundler`, paths to workspaces |

`package.json` — the skeleton already carries `name`, `private`, and the
`coaligned` check wiring. Layer on the Polaris workspaces, scripts, and app
devDependencies (do **not** drop the skeleton's `check` / `coaligned` entries):

```json
{
  "type": "module",
  "workspaces": ["products/*/cli", "products/*/site", "products/*/handlers"],
  "engines": { "node": ">=20", "bun": ">=1.2" },
  "scripts": {
    "setup": "./setup.sh",
    "seed": "bash scripts/build-seed.sh",
    "lint:js": "eslint .",
    "lint:deno": "cd services/polaris-functions && deno lint",
    "lint": "bun run lint:js && bun run lint:deno",
    "test:js": "bun test products/polaris/handlers products/polaris/cli",
    "test:site": "cd products/polaris/site && bun run test",
    "test:deno": "cd services/polaris-functions && deno test --allow-net --allow-read --allow-env",
    "test": "bun run test:js && bun run test:site && bun run test:deno"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "@eslint/js": "9.39.4",
    "eslint": "9.39.4",
    "eslint-config-prettier": "9.1.2",
    "prettier": "3.9.4",
    "@forwardimpact/libterrain": "<pinned in part 03>",
    "@forwardimpact/map": "<pinned in part 03>"
  }
}
```

The Deno service `services/polaris-functions/` is **not** a Bun workspace — it
carries `deno.json`, not `package.json`, so `lint`/`test` run JS and Deno
tooling in separate steps. `@forwardimpact/libterrain` and `@forwardimpact/map`
are **build-time devDependencies only** — `setup.sh` and
`scripts/build-seed.sh` invoke `fit-terrain build` to render the seed from the
vendored `story.dsl`; no surface imports them. Part 03 pins the exact versions
that carry prerequisites A (`--output-root`) and B (prose→SQL).

`.gitignore` — append the rendered-seed and runtime-data ignores (the skeleton
already ignores `node_modules/`, `.env`, `*.log`, `wiki/`, `dist/`, `build/`,
`generated/`, and `apm_modules/`):

```gitignore
.next/
# Synthetic seed rendered locally from the vendored DSL (part 03):
data/synthetic/.build/
data/synthetic/seed_embeddings.jsonl
products/polaris/site/supabase/migrations/20250101*_seed_*.sql
# Per-service runtime data volumes:
infrastructure/*/data/
```

Verify: `bun install` exits 0; `just --list` shows recipes; `bun run check`
(coaligned + lint + tsc) passes.

## Step 3 — Scaffold the Polaris directory tree

The skeleton already carries the Monorepo top-level directories (`products/`,
`services/`, `infrastructure/`, `websites/`) each with a `README.md`, and the
`wiki/` working memory (a separate checkout, gitignored — **never committed
here**). Add only the Polaris-specific subtree (`.gitkeep` where a dir is
otherwise empty):

```text
data/synthetic/                # vendored story.dsl + prose-cache.json (verbatim) + PROVENANCE.md, SOURCE.sha256, SEED.sha256 (part 03 commits); .build/ rendered output is gitignored
infrastructure/kong/
infrastructure/postgres/
infrastructure/pgbouncer/
infrastructure/postgrest/
infrastructure/gotrue/
infrastructure/realtime/
infrastructure/storage/
infrastructure/imgproxy/
infrastructure/tei/
products/polaris/handlers/     # part 05
products/polaris/cli/          # part 06
products/polaris/site/         # part 07
services/polaris-functions/    # part 04
scripts/                       # build-seed.sh, smoke.sh (setup.sh at repo root)
```

Verify: `tree -L 3 -I node_modules` shows the Polaris subtree layered on the
skeleton.

## Step 4 — Author docker-compose.yml

Created: `docker-compose.yml` at repo root.

Service definitions (one per `infrastructure/` subdirectory):

| Service | Image | Port | Healthcheck | Depends on |
| --- | --- | --- | --- | --- |
| `kong` | `kong:3.4.3.1` | 8000:8000 | `kong health` | (none) |
| `postgres` | builds `infrastructure/postgres/` (Dockerfile based on `supabase/postgres:15.6.1.143`, which ships pgvector + pg_cron + pg_net + pgjwt + pgsodium + pgaudit + pgcrypto + uuid-ossp out of the box) | 5432:5432 | `pg_isready -U postgres` | (none) |
| `pgbouncer` | `edoburu/pgbouncer:1.22.1-p0` (the edoburu tags carry a `-pN` patch suffix; a bare `1.22.1` does not exist) | 6432:6432 | `nc -z 127.0.0.1 6432` | `postgres` |
| `postgrest` | builds `infrastructure/postgrest/` (`FROM postgrest/postgrest:v12.0.2` with a static busybox copied in — the upstream image is distroless) | 3000:3000 | `/bin/busybox nc -z -w 2 127.0.0.1 3000` | `pgbouncer` |
| `gotrue` | `supabase/gotrue:v2.151.0` | 9999:9999 | `wget -q --spider http://127.0.0.1:9999/health` | `postgres` |
| `realtime` | `supabase/realtime:v2.30.34` | 4000:4000 | `bash -c 'exec 3<>/dev/tcp/127.0.0.1/4000'` | `postgres` |
| `storage` | `supabase/storage-api:v1.0.6` | 5000:5000 | `wget -q --spider http://127.0.0.1:5000/status` | `postgres`, `minio` |
| `minio` | `minio/minio:RELEASE.2024-11-07T00-52-20Z` (S3 backend for `storage`) | 9000:9000 | `curl -f http://localhost:9000/minio/health/live` | (none) |
| `imgproxy` | `darthsim/imgproxy:v3.23` | 8081:8080 | `imgproxy health` | `storage` |
| `tei` | `ghcr.io/huggingface/text-embeddings-inference:cpu-1.5` (command `--model-id BAAI/bge-small-en-v1.5 --max-batch-tokens 16384 --max-client-batch-size 16 --auto-truncate`) | host `8080:80` (internal Docker DNS resolves `http://tei:80`, NOT `tei:8080`) | container-side: `bash -c 'exec 3<>/dev/tcp/127.0.0.1/80'`, `start_period: 120s`, retries 12 | (none) |
| `polaris-site` | builds `products/polaris/site/` (placeholder Dockerfile in this part) | 3001:3000 | `bash -c 'exec 3<>/dev/tcp/127.0.0.1/3000'` | `kong` |
| `polaris-functions` | builds `services/polaris-functions/` (placeholder Dockerfile) | 8082:8000 | `bash -c 'exec 3<>/dev/tcp/127.0.0.1/8000'` | `kong`, `tei` |

All services share a single Docker network `bionova` (created by compose).
Postgres password and JWT secret are read from `.env` (template at
`.env.example` committed; `.env` is gitignored).

**Healthchecks use only tools the image actually ships.** The `tei`,
`polaris-site`, and `polaris-functions` images carry `bash` but neither `curl`
nor `wget`, so they probe with a `bash` `/dev/tcp` TCP connect; `realtime` has
`curl` but no `/api/health` route, so it also uses a TCP probe. `postgrest` is
**distroless** — it ships only the `postgrest` binary, no shell, `wget`, `curl`,
or `nc` — so a container healthcheck has nothing to run and the probe can never
pass, leaving the container `unhealthy` forever. Its Dockerfile
(`infrastructure/postgrest/Dockerfile`) copies a static busybox
(`FROM busybox:1.36.1-musl`) into the image, and the healthcheck probes the API
port with `/bin/busybox nc -z -w 2 127.0.0.1 3000`. Probes target `127.0.0.1`,
never `localhost`: the BusyBox `nc`/`wget` in several images resolve `localhost`
to IPv6 `::1`, but the services bind IPv4 `0.0.0.0`.

**Only `postgrest` connects through pgbouncer.** The transaction pooler exists
for the high-connection PostgREST data API. `gotrue` and `storage` send a
`search_path` startup parameter that pgbouncer rejects (FATAL 08P01), and
`realtime` (Postgrex) depends on session-scoped prepared statements, so those
three connect directly to `postgres:5432`.

**Build context for product services**: `polaris-site` and
`polaris-functions` need workspace-root access at build time (their
Dockerfiles `COPY products/polaris/handlers …`). Set explicit build
context in `docker-compose.yml`:

```yaml
  polaris-site:
    build:
      context: .
      dockerfile: products/polaris/site/Dockerfile
  polaris-functions:
    build:
      context: .
      dockerfile: services/polaris-functions/Dockerfile
```

`postgrest` also builds rather than using its image directly, but from its own
directory (`build: { context: infrastructure/postgrest }`) — its Dockerfile
only copies a busybox into the distroless image and needs no workspace access.

Verify: `docker compose config` parses; `docker compose up -d postgres tei`
brings both healthy within 120s.

## Step 5 — Configure Kong

Created:

- `infrastructure/kong/kong.yml` — declarative routes
- `infrastructure/kong/Dockerfile` — copies kong.yml + sets `KONG_DATABASE=off`

Routes (mirroring `products/map/supabase/kong.yml`):

| Path | Upstream |
| --- | --- |
| `/rest/v1/*` | `http://postgrest:3000` |
| `/auth/v1/*` | `http://gotrue:9999` |
| `/realtime/v1/*` | `http://realtime:4000/api/realtime` |
| `/storage/v1/*` | `http://storage:5000` |
| `/functions/v1/*` | `http://polaris-functions:8000` |

Auth plugin (`key-auth` + `acl`) sits on every route reading `apikey` header;
service-role and anon keys defined in `.env`.

Verify: `curl http://localhost:8000/rest/v1/` returns PostgREST root JSON
after `docker compose up`.

## Step 6 — Configure Postgres + extensions

Created:

- `infrastructure/postgres/Dockerfile` — `FROM supabase/postgres:15.6.1.143`.
  This image ships pgvector, pg_cron, pg_net, pgjwt, pgsodium, pgaudit,
  pgcrypto, uuid-ossp pre-installed — chosen because the alternative
  `pgvector/pgvector:pg16` lacks pg_net, which the notify-updates trigger (part
  04) and pg_cron schedule (part 04) require.

**The `supabase/postgres` image owns its own role and schema bootstrap** — the
init scripts must cooperate with it, not fight it. The image's bootstrap
superuser is `supabase_admin` (not `postgres`), and its own `init-scripts/`
create the Supabase service roles (`anon`, `authenticated`, `service_role`,
`authenticator`, `supabase_auth_admin`, `supabase_storage_admin`) and schemas
(`auth`, `storage`, `realtime`, `net`). Two files in
`infrastructure/postgres/init/` bracket that image bootstrap:

- `00-aaa-bootstrap.sql` — sorts first (`aaa`). The image does not create a
  `postgres` role before `/docker-entrypoint-initdb.d/*.sql` runs, but pg_net
  and later scripts reference it, so create it here: `CREATE ROLE postgres
  SUPERUSER LOGIN CREATEDB CREATEROLE REPLICATION BYPASSRLS`, guarded by an
  existence check.
- `zz-bionova.sh` — sorts **last** (`zz` > the image's `init-scripts`), so
  every Supabase role already exists. Connecting as `supabase_admin`, it:
  (1) creates the extensions Polaris needs (`vector`, `pg_net`, `pg_cron`,
  `pgcrypto`, `uuid-ossp`, `pgjwt CASCADE`); (2) aligns the login passwords of
  the roles the compose services authenticate as (`postgres`, `authenticator`,
  `supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin`) with
  `$POSTGRES_PASSWORD`, and promotes `postgres` to `SUPERUSER` so `supabase db
  push` can create objects in `public` (PG15 revokes public CREATE; the image
  leaves `postgres` non-superuser); (3) grants `anon`/`authenticated`/
  `service_role` to `authenticator` plus `USAGE` on `public` and `net`.

Do **not** hand-create the Supabase roles or schemas in a `01-roles.sql` /
`02-schemas.sql`: on `supabase/postgres` they already exist, and re-creating
them collides with the image's own bootstrap and fails the container start.
This is the defect that blocked the first live boot — the earlier draft's
`01-roles.sql`/`02-schemas.sql` fought the image instead of deferring to it.

Verify: after `docker compose up -d postgres`, `psql -U postgres -c "SELECT
extname FROM pg_extension ORDER BY extname;"` includes `pg_cron`, `pg_net`,
`pgcrypto`, `pgjwt`, `uuid-ossp`, `vector`; and `\du` shows the Supabase roles
with the aligned passwords.

## Step 7 — Configure remaining infrastructure services

Created (one config file per service):

| Service | File | Purpose |
| --- | --- | --- |
| `pgbouncer` | env in docker-compose | `DB_HOST=postgres`, `DB_USER=authenticator`, `POOL_MODE=transaction`, `MAX_CLIENT_CONN=200`, `AUTH_TYPE=scram-sha-256`, and `LISTEN_PORT=6432` (the edoburu image defaults to 5432, but the mapping, healthcheck, and postgrest all expect 6432) |
| `postgrest` | env in docker-compose | `PGRST_DB_URI=postgres://authenticator:…@pgbouncer:6432/postgres`, `PGRST_JWT_SECRET=${JWT_SECRET}`, `PGRST_DB_ANON_ROLE=anon`, `PGRST_DB_SCHEMAS=public,storage`, and — because it runs behind the transaction pooler — `PGRST_DB_PREPARED_STATEMENTS=false` and `PGRST_DB_CHANNEL_ENABLED=false` (otherwise prepared-statement reuse collides, 42P05, and the LISTEN/NOTIFY reload channel cannot span pooled transactions) |
| `gotrue` | env in docker-compose | `GOTRUE_DB_DRIVER=postgres`, `GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:…@postgres:5432/postgres` (direct, not the pooler), `GOTRUE_JWT_SECRET=${JWT_SECRET}`, `GOTRUE_DISABLE_SIGNUP=false`, `GOTRUE_SITE_URL=http://localhost:3001` |
| `realtime` | env in docker-compose | `DB_HOST=postgres`, `DB_PORT=5432` (direct, not the pooler), `DB_NAME=postgres`, `SECRET_KEY_BASE=${REALTIME_SECRET}` |
| `storage` | env in docker-compose | `DATABASE_URL=postgres://supabase_storage_admin:…@postgres:5432/postgres` (direct, not the pooler), `STORAGE_BACKEND=s3`, `GLOBAL_S3_ENDPOINT=http://minio:9000`, `GLOBAL_S3_PROTOCOL=http`, `GLOBAL_S3_FORCE_PATH_STYLE=true`, bucket `trial-documents` created on boot via init script |
| `imgproxy` | env in docker-compose | `IMGPROXY_BIND=:8080`, `IMGPROXY_USE_S3=true`, `IMGPROXY_S3_ENDPOINT=http://minio:9000` |
| `tei` | command in docker-compose | `--model-id BAAI/bge-small-en-v1.5 --max-batch-tokens 16384 --max-client-batch-size 16 --auto-truncate` (auto-truncate keeps condition texts over bge-small's 512-token limit from 413-rejecting). Parametrize the model id and source via `TEI_MODEL_ID` / `TEI_MODEL_SOURCE` (default to HF download); a `just tei-model` recipe fetches the model to a host dir so `tei` can load it with no container network — needed where a TLS-inspecting proxy breaks the huggingface.co download and stalls the whole stack |

Created: `infrastructure/storage/init-bucket.sh` — uses `mc` CLI in a
one-shot sidecar container to create the `trial-documents` bucket against
MinIO.

Verify: `docker compose up -d` brings all services to `(healthy)` in
`docker compose ps` within 180s.

## Step 8 — Bootstrap `.env.example` and `setup.sh` skeleton

Created:

- `.env.example` — JWT_SECRET, POSTGRES_PASSWORD, ANON_KEY, SERVICE_ROLE_KEY,
  REALTIME_SECRET, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD (all placeholder
  values).
  **`ANON_KEY` and `SERVICE_ROLE_KEY` are JWTs signed with `JWT_SECRET`**, so
  they must be regenerated whenever `JWT_SECRET` changes and kept in sync with
  the same two keys baked into `infrastructure/kong/kong.yml`. A mismatch is
  silent for anonymous reads (PostgREST falls back to the `anon` role) but fails
  every verified-JWT path — `embed-seed` upserts and admin writes return 401
  `JWSError JWSInvalidSignature`.
- `setup.sh` — bash script, `set -euo pipefail`, idempotent

`setup.sh` skeleton (filled in by parts 02, 03, 04):

```sh
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Step A — wait for core services (parts 01)
wait_healthy() {
  local svc="$1" timeout="${2:-120}"
  for i in $(seq 1 "$timeout"); do
    if docker compose ps "$svc" --format json | grep -q '"Health":"healthy"'; then
      return 0
    fi
    sleep 1
  done
  echo "Service $svc not healthy after ${timeout}s" >&2
  exit 1
}
for svc in postgres pgbouncer postgrest gotrue tei; do wait_healthy "$svc"; done

# Step B — apply migrations (part 02 + part 03)
# (filled in by parts 02 + 03)

# Step C — seed embeddings (part 04)
# (filled in by part 04)

echo "Setup complete."
```

Verify: `./setup.sh` exits 0 when all services healthy; non-zero if any
service unhealthy within 120s.

## Step 9 — Add the bionova-specific CI concerns

`monorepo-setup` already generated the base per-concern check workflows
(`check-quality`, `check-test`, `check-context`) and wired the repo's Bun/Deno
lint, test, and `coaligned` scripts into them. This part adds only the concerns
those do not cover — **one workflow per concern, never folded into a single
`ci.yml`**, matching the skill's rule. SHA-pin every third-party action.

| File | Concern |
| --- | --- |
| `.github/workflows/check-compose.yml` | `cp .env.example .env && docker compose config --quiet` |
| `.github/workflows/check-seed.yml` | seed-render determinism: `bash scripts/build-seed.sh`, assert ≥15 seed migrations, `sha256sum -c data/synthetic/SEED.sha256` |
| `.github/workflows/check-edge.yml` | `deno check`, `deno test`, `deno lint` in `services/polaris-functions/` |
| `.github/workflows/check-e2e.yml` | render the seed, **pre-fetch the TEI model on the host** and point `tei` at the local copy (the container cannot fetch through the runner's TLS-inspecting proxy — see Step 7), then boot the stack, `./setup.sh`, `SMOKE_DESTRUCTIVE=1 ./scripts/smoke.sh` (filled in by part 08) |
| `.github/workflows/deploy.yml` | Railway watch-path deploy on push to `main` (filled in by part 08) |
| `.github/CODEOWNERS` | `* @forwardimpact/agent-team` (extend only if `kata-setup` did not already set it) |
| `.github/pull_request_template.md` | Summary, Test plan (if not already scaffolded) |

The seed and e2e jobs skip cleanly with a `::warning::` until the
`@forwardimpact/libterrain` release carrying `--output-root` (prerequisite A) is
resolvable from npm; until then they point `fit-terrain` at a pinned checkout
via `FIT_TERRAIN`. Do not add a monolithic `ci.yml` — a failing compose
validation and a failing edge-function test must read as two distinct red
checks, per the check-workflow rule the skill enforces.

Verify: `gh workflow list` shows the base check workflows plus these; each new
workflow validates locally (`docker compose config`, `deno`, `bun`).

## Step 10 — Commit the Polaris additions + open the part-01 PR

The remote and its `main` branch already exist — `monorepo-setup` created and
pushed them. Commit the infrastructure and Polaris scaffolding on a feature
branch and open the first product PR:

```sh
git checkout -b infra/repo-bootstrap
git add -A
git commit -m "infra: PG On Rails stack + Polaris workspace"
git push -u origin infra/repo-bootstrap
gh pr create --title "infra: PG On Rails stack + Polaris workspace" \
  --body "Implements plan-a-01 of spec 1160. Stack stands up via \`docker compose up\` to all-healthy; no product code yet."
```

Verify: PR opens with green CI (base checks + compose validation pass).

## Verification (end of part 01)

- [ ] The monorepo-setup skeleton is in place: `scripts/bootstrap.sh`,
      `CLAUDE.md`/`CONTRIBUTING.md`/`JTBD.md`/`.coaligned/`, the base check
      workflows, `.claude/settings.json`, the seeded wiki, and `SETUP.md` all
      exist; `bun run check` (coaligned) passes clean.
- [ ] `gh repo view forwardimpact/bionova-apps` returns the repo URL.
- [ ] `docker compose up -d` brings all 12 services to `healthy` within 180s.
- [ ] `curl -s http://localhost:8000/rest/v1/` returns PostgREST root JSON.
- [ ] `curl -s http://localhost:8000/auth/v1/health` returns
      `{"name":"GoTrue",…}`.
- [ ] `curl -s http://localhost:8080/health` (direct to TEI) returns `OK`.
- [ ] `psql -h localhost -U postgres -c "SELECT extname FROM pg_extension WHERE extname IN ('vector','pg_cron');"`
      returns 2 rows.
- [ ] `./setup.sh` exits 0 against a freshly booted stack.

— Staff Engineer 🛠️
