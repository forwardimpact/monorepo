# Design 1160 — BioNova Polaris Application

All paths below are within the `bionova-apps` repository. That repository is
separate from this monorepo. It follows MONOREPO.md. It consumes Forward
Impact libraries from npm.

## Components

| Component | Location | Purpose |
| --- | --- | --- |
| Handlers | `products/polaris/handlers/` | Surface-agnostic business logic |
| Web frontend | `products/polaris/site/` | Next.js App Router + Tailwind + shadcn/ui |
| CLI | `products/polaris/cli/` | `bionova-polaris` with libcli |
| Edge Functions | `services/polaris-functions/` | Deno functions that check eligibility, seed, and sync |
| Infrastructure | `infrastructure/` | PG On Rails self-hosted Supabase stack |
| Synthetic source | `data/synthetic/story.dsl` + `prose-cache.json` | Verbatim vendored DSL. It is the domain source of truth. `fit-terrain` renders it locally. |
| Seed build | `data/synthetic/.build/` (gitignored) | Disposable target for `fit-terrain build --output-root`. `setup.sh` stages it into migrations. |

## Architecture

```mermaid
graph TD
    subgraph "data/synthetic/ (vendored verbatim)"
        dsl["story.dsl + prose-cache.json"]
        terrain["fit-terrain build --output-root .build/"]
        seed[".build/…/migrations/seed_*.sql + seed_embeddings.jsonl"]
        dsl --> terrain --> seed
    end

    subgraph "products/polaris/"
        site["site/ — Next.js"]
        cli["cli/ — bionova-polaris"]
        handlers["handlers/ — InvocationContext"]
    end

    seed -->|setup.sh stages + db push| pg

    subgraph "services/"
        ef["polaris-functions/ — Edge Functions"]
    end

    subgraph "infrastructure/"
        kong["Kong — API gateway"]
        pg["PostgreSQL + pgvector"]
        pgb["PgBouncer"]
        prest["PostgREST — REST from schema"]
        gotrue["GoTrue — auth"]
        tei["TEI — embeddings"]
        store["Storage — trial docs"]
    end

    site --> handlers
    cli --> handlers
    handlers -->|via Kong| kong
    kong --> prest
    kong --> gotrue
    kong --> ef
    kong --> store
    prest --> pgb --> pg
    ef --> pgb
    ef -->|embed-seed| tei
```

## Shared Library Consumption

| Library | Consumer | Role |
| --- | --- | --- |
| `libcli` | `products/polaris/cli/` | CLI dispatch, `--help`, and subcommand routes |
| `libui` | `products/polaris/site/` | Routes, reactive state, and `freezeInvocationContext` for the web surface |
| `libformat` | `products/polaris/handlers/` | Render handler output to ANSI (CLI) or HTML (web) |
| `libtemplate` | `products/polaris/handlers/` | Mustache templates for trial cards, eligibility reports |
| `librepl` | `products/polaris/cli/` | `bionova-polaris repl`. Staff explore trial data interactively. |
| `libterrain` (`fit-terrain`) | `setup.sh` / `package.json` build script | Build-time only. It renders the vendored `story.dsl` to seed SQL + embeddings JSONL. No surface imports it. |

## Shared Surface Architecture

Both surfaces produce an `InvocationContext { data, args, options }`. `libcli`
produces it on the terminal. `libui` produces it on the web. Both surfaces
dispatch to the same handler function. Handlers return surface-agnostic data.
`libformat` renders that data to ANSI or HTML.

| Handler | CLI command | Web route | Args |
| --- | --- | --- | --- |
| `searchTrials` | `search` | `/search` | `--condition`, `--phase`, `--status`, `--location` |
| `showTrial` | `trial <id>` | `/trials/:id` | `id` positional. Includes the trial FAQ (`trial_faqs`) and consent summary (`consent_summaries`) |
| `showCondition` | `condition <id>` | `/conditions/:id` | `id` positional. Includes the condition explainer (`condition_explainers`) |
| `checkEligibility` | `eligibility <id>` | `/trials/:id/eligibility` | `id` positional |
| `listSites` | `sites` | `/sites` | `--specialty`. Each site includes its description (`site_descriptions`) |
| `listStories` | `stories` | `/stories` | `--condition`. Patient stories (`patient_stories`) |
| `showAbout` | `about` | `/about` | none. Includes therapy descriptions (`therapy_descriptions`) |
| `manageTrial` | `admin trial <id>` | `/admin/trials/:id` | `id` positional (staff auth). Includes interest-signal aggregates |

Every prose surface reads a generated seed table. No handler hand-authors
patient-facing copy. The text originates in `story.dsl`'s `clinical.content`
block. The terrain pipeline renders it through the prose cache.

The CLI entry point (`bin/bionova-polaris.js`) uses `createCli` from
`@forwardimpact/libcli`. The `admin` subcommand group requires a GoTrue JWT
through `--token` or `SUPABASE_SERVICE_ROLE_KEY`.

## PostgreSQL Schema

The terrain pipeline seeds these tables (`supabase_migration` output from
`renderSql()` in libsyntheticrender):

| Table | Columns | Source entity |
| --- | --- | --- |
| `conditions` | `id pk`, `name`, `icd10 text[]`, `synonyms text[]`, `synthea_module`, `severity`, `prose_topic`, `prose_tone` | `ClinicalConditionEntity` |
| `sites` | `id pk`, `name`, `address`, `city`, `state`, `country`, `org_ref`, `capacity int`, `specialties text[]` | `ClinicalSiteEntity` |
| `researchers` | `id pk`, `person_ref`, `name`, `email`, `role`, `trial_ids text[]`, `specialty` | `ClinicalResearcherEntity` |
| `trials` | `id pk`, `name`, `protocol_id`, `phase`, `therapeutic_area`, `sponsor`, `status`, `target_enrollment int`, `current_enrollment int`, `start_date date`, `estimated_end_date date`, `arms text[]`, `prose_topic`, `prose_tone`, `principal_investigator_id fk`, `project_ref`, `project_id` | `ClinicalTrialEntity` |
| `criteria` | `trial_id pk/fk`, `inclusion jsonb`, `exclusion jsonb` | `ClinicalCriterionEntity` |
| `trial_conditions` | `trial_id fk`, `condition_id fk` (composite pk) | Junction from `trial.conditions[]` |
| `trial_sites` | `trial_id fk`, `site_id fk` (composite pk) | Junction from `trial.sites[]` |
| `condition_embeddings` | `id pk`, `condition_id fk`, `embedding vector(384)` | `renderSql(include_embeddings: true)` + `embed-seed` edge function |
| `condition_explainers` | `condition_id pk/fk`, `explainer text` | `ClinicalConditionExplainerEntity` (prose-cache key `clinical_condition_explainer_<id>`) |
| `trial_faqs` | `trial_id pk/fk`, `faq text` | `ClinicalTrialFaqEntity` (`clinical_trial_faq_<id>`) |
| `consent_summaries` | `trial_id pk/fk`, `summary text` | `ClinicalConsentSummaryEntity` (`clinical_consent_summary_<id>`) |
| `site_descriptions` | `site_id pk/fk`, `description text` | `ClinicalSiteDescriptionEntity` (`clinical_site_description_<id>`) |
| `patient_stories` | `id pk`, `condition_id fk`, `story_index int`, `story text` | `ClinicalPatientStoryEntity` (`clinical_patient_story_<condId>_<i>`) |
| `therapy_descriptions` | `topic pk`, `description text` | `ClinicalTherapyDescriptionEntity` (`clinical_therapy_description_<topic>`) |

The six prose tables are **terrain-generated**. Nobody hand-writes them.
`render-sql.js` emits them once it gains specs for them (see § Prerequisite
library changes). The `polaris-seed` output block lists them in its
`entities[]`. Their text comes from the prose cache, keyed as shown. FK
columns to `trials(id)`, `conditions(id)`, and `sites(id)` are `text`. This
matches the `text` primary keys those tables receive from `inferType`.

Hand-written migrations live at `products/polaris/site/supabase/migrations/`.
Terrain does not generate them. They sequence after the seed migrations:

```sql
-- interest_signals table
CREATE TABLE interest_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id TEXT NOT NULL REFERENCES trials(id),
  screener_answers JSONB NOT NULL,
  match_score TEXT NOT NULL
    CHECK (match_score IN ('eligible', 'possibly_eligible', 'not_eligible')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- notify-updates trigger (invokes the notify-updates edge function)
CREATE OR REPLACE FUNCTION notify_trial_status_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.edge_function_url') || '/notify-updates',
    body := jsonb_build_object('trial_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trial_status_change
  AFTER UPDATE OF status ON trials
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_trial_status_change();
```

`sites.org_ref` is a plain text column with no foreign key constraint. Orgs
live in the non-clinical entity graph. The clinical migration output does not
include them. The same applies to `trials.project_ref` and
`trials.project_id`. Both are plain text columns. They carry cross-domain
references for display (e.g. a link from a trial to its project page). The
database does not enforce referential integrity on them.

The `criteria.inclusion` and `criteria.exclusion` JSONB columns carry
structured objects: `{ age_min, age_max, conditions_required, ecog_max,
prior_treatments_allowed, custom[] }` and `{ conditions_excluded,
active_autoimmune, prior_immunotherapy, custom[] }` respectively. The
`eligibility-check` edge function reads `custom[]` strings as the
screener-question source. It has no runtime LLM dependency.

### Row-Level Security

| Table | Policy |
| --- | --- |
| `conditions`, `sites`, `researchers`, `trials`, `criteria`, junction tables, `condition_embeddings`, the six prose tables | `public_read`: `FOR SELECT USING (true)` (`render-sql.js` generates it for every table it emits) |
| `trials` | Staff write: `FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'staff')`; `FOR UPDATE USING (auth.jwt() ->> 'role' = 'staff')` |
| `interest_signals` | Anonymous insert: `FOR INSERT WITH CHECK (true)`; staff read: `FOR SELECT USING (auth.jwt() ->> 'role' = 'staff')`. Anonymous inserts must not use PostgREST `Prefer: return=representation`. The staff-only SELECT policy blocks anon read-back. |

## Edge Functions

| Function | Trigger | Data flow |
| --- | --- | --- |
| `embed-seed` | `setup.sh` (one-time) | Read condition/trial text from PG, POST to TEI (`tei:8080`), INSERT vectors into `condition_embeddings` |
| `eligibility-check` | POST from screener UI/CLI | Read `criteria` for trial, evaluate answers against `custom[]`, return match score |
| `notify-updates` | DB trigger on `trials.status` change | Query `interest_signals` for the affected trial, log the notification (a stub, with GoTrue email deferred) |
| `sync-listings` | Cron (`pg_cron`) or manual invoke | Re-read seed SQL from `data/synthetic/output/`, upsert changed rows |

## Data Seeding Pipeline

`bionova-apps` runs `fit-terrain` itself, against its own verbatim copy of the
DSL. The build needs no credentials for two reasons. The repository commits
the prose cache. `build` makes no LLM calls.

```text
data/synthetic/story.dsl + prose-cache.json   (vendored verbatim, committed)
  → npx fit-terrain build \
       --story data/synthetic/story.dsl \
       --cache data/synthetic/prose-cache.json \
       --output-root data/synthetic/.build
  → data/synthetic/.build/products/polaris/site/supabase/migrations/
       seed_*.sql + seed_embeddings.jsonl
  → setup.sh stages those into products/polaris/site/supabase/migrations/
       (timestamp-prefixed so terrain files sort before hand-written ones)
  → docker compose up → supabase db push → schema + seed data (incl. prose tables)
  → setup.sh invokes embed-seed edge function
  → TEI (tei:8080) generates 384-dim vectors
  → condition_embeddings populated with pgvector
```

`--output-root data/synthetic/.build` is load-bearing. The `polaris-seed`
output block writes to `products/polaris/site/supabase/migrations/`. Before it
writes, `fit-terrain`'s write sink `rm -rf`s the first two path segments of
each output file. Without an output root that points at a disposable
directory, the build would delete `products/polaris/`. That directory holds
the app's own code. The build writes into `data/synthetic/.build/`
(gitignored) instead. That directory is a throwaway zone. `setup.sh` then
copies the rendered migrations into place. The monorepo avoids the same
hazard. It routes terrain output away from authored code.

## Key Decisions

| Decision | Chosen | Rejected | Why |
| --- | --- | --- | --- |
| Seed source vendored | `story.dsl` + `prose-cache.json` verbatim. `bionova-apps` runs `fit-terrain build` | Vendor the rendered SQL/JSONL only | The DSL is the legible source of truth. To audit the app, you read one DSL file. You do not read SQL dumps. `bionova-apps` runs the build, which proves `fit-terrain` works for external teams (a spec goal). Requires the external-execution prerequisite (`--output-root`). |
| Terrain output path | `--output-root data/synthetic/.build` (gitignored) + `setup.sh` copy to migrations | Direct output to `products/polaris/site/supabase/migrations/` | `writeFiles()` in sinks.js joins the first two path segments of each output file into a directory. It `rm -rf`'s that directory before it writes. With the project root as the output root, it would delete `products/polaris/`, including `cli/`, `handlers/`, and authored code. `--output-root` points the write sink at a disposable build dir. `setup.sh` copies the rendered migrations into place. |
| Prose tables | Terrain emits six prose tables. The app surfaces them read-only | Hand-author patient copy in the app, or skip prose | The DSL already generates the prose into the cache. Terrain emits it as seed tables. This keeps the app fully synthetic-data-driven. It also gives every condition/trial/site real explanatory copy. Requires the prose-to-SQL prerequisite. |
| Build credentials | `fit-terrain build` (cache-only, no LLM) | `fit-terrain generate` | `generate` resolves an Anthropic credential at startup even at full cache (`bin/fit-terrain.js:141–145`). `build` renders from the committed cache with zero LLM calls and no key. Identical bytes at a full cache. |
| Deployment | Railway watch-path CI/CD. One service per `infrastructure/` subdirectory | Kubernetes, Fly.io | PG On Rails provides Railway config out of the box. Watch-paths limit rebuilds to changed services. |
| API layer | PostgREST auto-generated from schema | Hand-written API routes | Schema-driven REST eliminates boilerplate. Handlers call PostgREST through Kong. Staff writes also go through PostgREST with a GoTrue JWT to enforce RLS. |
| Screener questions | Derived from `criteria.custom[]` strings at display time | Pre-generated `screener_questions` JSONB column | `custom[]` already contains plain-language criteria from the DSL. The app displays them as yes/no questions. This is a presentation concern. It is not a data concern. Avoids an extra prose-pipeline key. |
| Embedding model | HuggingFace TEI (`BAAI/bge-small-en-v1.5`, 384-dim) on Docker network | External API (OpenAI, Cohere) | It needs no external API keys. It is deterministic. It runs locally alongside the stack. The TEI container joins the Docker network as `tei`. |
| Location search | City/state dropdown filter on `sites.city`, `sites.state` | PostGIS proximity search | Seed data has 5 sites. A dropdown filter is simpler and sufficient. It has no geocoding dependency. |
| CLI auth | `--token` flag or `SUPABASE_SERVICE_ROLE_KEY` env var | Interactive OAuth flow | The CLI is for staff automation. The service role key avoids the GoTrue browser flow. |

## Infrastructure Services

Docker Compose orchestrates these PG On Rails services under
`infrastructure/`:

| Service | Image / Build | Port | Purpose |
| --- | --- | --- | --- |
| `kong` | `kong:3.4` | 8000 | Routes API requests |
| `postgres` | `supabase/postgres` + pgvector | 5432 | Primary database |
| `pgbouncer` | `edoburu/pgbouncer` | 6432 | Connection pool for the PostgREST data API only |
| `postgrest` | `postgrest/postgrest` | 3000 | REST API from schema |
| `gotrue` | `supabase/gotrue` | 9999 | Auth service |
| `realtime` | `supabase/realtime` | 4000 | PG On Rails baseline (not wired for MVP) |
| `storage` | MinIO + `supabase/storage-api` | 5000 | `trial-documents` bucket. `manageTrial` uploads through Kong |
| `imgproxy` | `darthsim/imgproxy` | 8081 | PG On Rails baseline (not wired for MVP) |
| `tei` | `ghcr.io/huggingface/text-embeddings-inference` | 8080 | Generates embeddings |
| `polaris-site` | `products/polaris/site/Dockerfile` | 3001 | Next.js frontend |
| `polaris-functions` | `services/polaris-functions/` | 8082 | Deno edge functions |

Only `postgrest` connects through the pooler. It is the high-connection data
API. `gotrue` and `storage` send a `search_path` startup parameter that
transaction-mode pgbouncer rejects. `realtime` relies on session-scoped
prepared statements. So those three connect directly to `postgres:5432`.
`postgrest` is pooled, so it runs with prepared statements and with the
LISTEN/NOTIFY schema-reload channel disabled. `setup.sh` reloads its schema
cache (SIGUSR1) after it applies the migrations. The `anon`/`service_role` API
keys are JWTs. You must sign them with the same `JWT_SECRET` the services
verify against. Keep them in sync with `kong.yml`.

## Prerequisite library changes

This design depends on two monorepo capabilities that did not exist when it
was written. They are not `bionova-apps` work. Both shipped from the monorepo
since then. Both publish on npm in `fit-terrain` 0.1.41 and later. The tables
below record what changed and where, as designed.

### A — `fit-terrain` runs outside the monorepo

| Change | File | Evidence today |
| --- | --- | --- |
| Add the `--output-root` flag. Route the write sink there instead of the resolved project root | `libraries/libterrain/bin/fit-terrain.js` (sink setup ~233–241), `libraries/libterrain/src/sinks.js` (`writeFiles` ~262–285) | `writeFiles` does `fs.rm(dir, {recursive, force})` on `join(monorepoRoot, parts[0], parts[1])` for each output path. In an external repo this would delete `products/polaris/` |
| Add the `--schema-dir` flag. It resolves by default to `@forwardimpact/libskill`'s published `schema/json` | `libraries/libterrain/bin/fit-terrain.js` (`defaultSchemaDir()`). `@forwardimpact/libskill` is a hard dependency of `libterrain` | `@forwardimpact/libskill` publishes the standard schemas in its `files`. They ship with every `libterrain` install. So you need no extra package to render pathways. `options.schemaDir` gates the pathway render (`src/nodes.js:184–187`) |

`--story` and `--cache` overrides already exist (`bin/fit-terrain.js:226–227`,
`:201–203`). `findProjectRoot()` (`libraries/libutil/src/finder.js:134–144`)
already resolves the external repo's own root. It needs no change once the
caller controls the output and schema paths.

### B — clinical prose rendered to SQL tables

The clinical `content {}` block already generates the six prose types into the
prose cache. Today they reach HTML output only. They never reach SQL.

| Change | File | Evidence today |
| --- | --- | --- |
| Materialize the six prose types as entity records | `libraries/libsyntheticgen/src/engine/clinical-entities.js` (`buildClinicalEntities` returns `content` as raw metadata, ~100–107) | Prose keys exist (`clinical-prose-keys.js:139–154`). Nothing turns them into records |
| Add table specs for the six prose entities | `libraries/libsyntheticrender/src/render/render-sql.js` (`TABLE_SPEC` ~12–66. The entity filter at ~100–108 silently ignores unknown entities) | `TABLE_SPEC` hardcodes only conditions/sites/researchers/trials/criteria |
| Pass the prose cache into `renderSql` | `libraries/libterrain/src/nodes.js` (`renderClinicalOutput` passes prose only to `renderEmbeddings`, ~543–545) | `renderSql(clinical, out.config)` has no prose argument today |

The `polaris-seed` output block in `data/synthetic/story.dsl` already lists the
six prose entities (the only DSL change this spec makes). The parser accepts
them. The renderer silently ignores them until specs B land.

## Interviewing Polaris

Polaris proves Forward Impact's method for an external team. So Polaris should
be interviewable the same way this monorepo interviews its own products. Use
the published `forwardimpact/kata-interview` composite action. Do not fork the
workflow. The action owns the generic infrastructure (token, checkout,
bootstrap, `fit-terrain build`, the supervised run, cost, wiki push, log
scan). Polaris supplies only its own entry point and substrate command. For
staff-facing interviews, Polaris also supplies a persona command built from
the `fit-terrain substrate` verbs against the
[Substrate Contract](https://www.forwardimpact.team/docs/libraries/substrate-contract/index.md).
The guide is the normative reference for the relations, columns, auth model,
and degradation semantics. This section names only how Polaris maps onto the
contract.

**One-time scaffold, committed.** `npx fit-terrain substrate init --cwd .`
writes the starter migration into `supabase/migrations/`. Polaris edits the
commented example views to map its clinical schema onto the contract. Staff
and researchers become `substrate.people` rows, with Polaris roles mapped onto
the mandated `discipline`/`level`/`track` columns. `substrate.evidence` and
`substrate.discovery` start declared optional-absent, or Polaris maps them
later. That declaration brings a degradation. Pick invariants become
structural-only. `issue` produces an identity-only `.substrate.json`.

`.github/workflows/kata-interview.yml` in `bionova-apps`:

```yaml
jobs:
  interview:
    runs-on: ubuntu-latest
    timeout-minutes: 50 # composite actions cannot set a job timeout
    steps:
      - uses: forwardimpact/kata-interview@<sha> # pin like every sibling action
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          website-url: https://polaris.bionova.example
          # Polaris' own compose stack (not the Supabase CLI): boot, render +
          # apply the seed via setup.sh, then the contract gate and identity
          # provisioning. `fit-terrain` is on PATH via the action's bootstrap.
          substrate-setup-command: >-
            cp .env.example .env
            && docker compose up -d --wait
            && ./setup.sh
            && fit-terrain substrate check
            && fit-terrain substrate provision
          jwt-secret: ${{ secrets.SUPABASE_JWT_SECRET }}
          service-role-key: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

Patient interviews omit `persona-select-command` entirely. Polaris is
patient-facing with anonymous access. So the supervisor builds the persona
from the vendored `story.dsl`. The supervisor issues no JWT. A staff-facing
interview passes a persona command over the same verbs the FI wrapper uses.
That command carries Polaris' own token name. If diversification across runs
matters, it also carries a Polaris-scoped `--memory` path:

```sh
persona=$(fit-terrain substrate pick --format json) \
&& email=$(printf '%s' "$persona" | jq -r '.personas[0].email') \
&& fit-terrain substrate issue --email "$email" --cwd "$AGENT_CWD" \
  --token-env PRODUCT_POLARIS_TOKEN --stash "$RUNNER_TEMP/.persona-jwt"
```

This satisfies the same `.env` / `.substrate.json` / stash contract the action
documents. `--token-env` carries the Polaris token name, so nothing
Landmark-specific enters the flow.

The substrate command brings Polaris' own compose stack up from the repo
checkout. It then seeds the stack through `setup.sh`. The interview itself
stages its working files into the temp `agent-cwd` the action creates. The
whole loop runs on `fit-terrain` plus Polaris' own migrations and seed. No
Polaris application code runs in the runner. Prerequisite A (`fit-terrain`
runs outside the monorepo) is the same dependency the seed pipeline already
relies on.
