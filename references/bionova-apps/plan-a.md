# Plan 1160-a — BioNova Polaris Application

Build the `bionova-apps` external repository to spec
[1160](spec.md) / design [a](design-a.md).

> **`bionova-apps` is a SEPARATE GitHub repository — its own monorepo.**
> It is created as a brand-new repo at `forwardimpact/bionova-apps`, owns its
> own `MONOREPO.md`, workspaces, and CI, and consumes Forward Impact code only
> as published npm packages. It is **not** a directory inside this monorepo and
> is **never** vendored, submoduled, or checked in here. Nothing in this plan
> creates files under this monorepo except the trailing `wiki/STATUS.md` +
> metrics update (part 08). If you find yourself writing `bionova-apps` files
> inside this repo, stop — you are in the wrong working tree. See
> [§ Where this lives](#where-this-lives).

## Approach

The implementation lives in a new, separate GitHub repository
(`forwardimpact/bionova-apps`) — not in this monorepo. **The app is built
around synthetic data: `bionova-apps` vendors `data/synthetic/story.dsl` and
`prose-cache.json` verbatim and runs `fit-terrain build` against them itself.**
The DSL is the repository's domain source of truth; the SQL migrations and
embeddings JSONL are rendered locally, never authored or vendored as output.
This depends on two monorepo prerequisites that must publish to npm first (see
Prerequisites): an `--output-root` flag so the build renders into a disposable
directory instead of deleting `products/polaris/`, and prose-to-SQL rendering
so the six clinical prose tables are emitted. The build is credential-free —
`fit-terrain build` renders from the committed prose cache with zero LLM calls.
Regenerating from the vendored DSL reproduces the seed byte-for-byte (SC7).
Parts are decomposed by surface so they can run in parallel where the design
allows. Each part is independently verifiable end-to-end against a local
`docker compose` boot; the final part ties everything to the spec's seven
success criteria.

**Repository scaffolding is not hand-rolled.** Part 01 stands up the
Monorepo-standard skeleton by invoking the **monorepo-setup skill** (which runs
`jidoka-setup` and `kata-setup` in turn), then layers the Polaris product and
its infrastructure onto it. The skill is authoritative for the skeleton —
`git`, the base `package.json`, `.gitignore`, the directory tree,
`scripts/bootstrap.sh`, the skill packs and agent profiles, the root instruction
files, the per-concern check workflows, remote creation, the wiki, and
`.claude/settings.json`. This plan does not restate or contradict any of that;
where a skeleton file needs bionova content it is extended, never replaced.

> **Revision r3** replaces r2's "vendor the rendered SQL" pipeline with
> "vendor the DSL and render locally." r2 vendored `data/synthetic/seed/*.sql`
> because `fit-terrain` could not run outside the monorepo. r3 makes it run
> there (prerequisite A) and surfaces the generated prose (prerequisite B), so
> the app is fully synthetic-data-driven. Part 03 is rewritten accordingly.

## Where this lives

| Aspect | Value |
| --- | --- |
| Target repo | `forwardimpact/bionova-apps` (new — created in part 01) |
| Local working dir | `~/work/bionova-apps/` (sibling to this monorepo) |
| All file paths in parts | relative to `bionova-apps/` repo root |
| Monorepo deliverable | this plan + STATUS update only; no `bionova-apps/` directory in the monorepo |

The implementer **must not** commit anything related to bionova-apps inside
this monorepo. The kata-implement skill operates on the external repo for
this spec; the monorepo PR (`plan-implemented`) updates only
`wiki/STATUS.md` and this plan's metrics row.

## Prerequisites

| Dep | Status | Where checked |
| --- | --- | --- |
| Spec 1140 — clinical-output pipeline | implemented (commits `8bbf8f1c`, `0c921e81`) | `libterrain` clinical-output stage emits `supabase_migration` + `embeddings_jsonl` files |
| Spec 1150 — story.dsl clinical rewrite | **implemented** (`wiki/STATUS.md` row `1150 plan implemented`; live-verified 2026-06-11 — `bunx fit-terrain build` at `6010964b`: 0 cache misses, all seed artifacts produced) | story.dsl carries `clinical {}` + `output … supabase_migration {…}` blocks at `data/synthetic/story.dsl:1250–1272` |
| **Prerequisite A — `fit-terrain` external execution** | **NOT YET SPECCED — blocks implementation.** Needs `--output-root` (route the write sink off the project root so it does not `rm -rf products/polaris/`) and `--schema-dir` defaulting to `@forwardimpact/libskill`'s published `schema/json` (a hard dependency of `libterrain`). Must publish in a new `@forwardimpact/libterrain` minor. | `libterrain/bin/fit-terrain.js` sink wiring (~233–241) + `src/sinks.js` `writeFiles` (~262–285); `bin/fit-terrain.js` `defaultSchemaDir()`. See design § Prerequisite library changes A. |
| **Prerequisite B — clinical prose → SQL** | **NOT YET SPECCED — blocks parts 05/07 prose surfaces.** Materialize the six prose types as records, add their `TABLE_SPEC` entries, and pass the prose cache into `renderSql`. Must publish in the same `libterrain`/`libsyntheticrender`/`libsyntheticgen` release train. | `libsyntheticgen/src/engine/clinical-entities.js` (~100–107); `libsyntheticrender/src/render/render-sql.js` `TABLE_SPEC` (~12–66); `libterrain/src/nodes.js` `renderClinicalOutput` (~543–545). See design § Prerequisite library changes B. |
| `@forwardimpact/libcli@0.1.12`, `libui@1.3.0`, `libformat@0.1.18`, `libtemplate@0.2.12`, `librepl@0.1.14` on npm | published — versions verified via `npm view @forwardimpact/<lib> version` at panel-review time | part 01 pins these exact versions; implementer re-runs `npm view @forwardimpact/{libcli,libui,libformat,libtemplate,librepl} version` immediately before `bun install` and bumps in the part-01 PR if any further patch level published since. **libui crossed a minor (1.2 → 1.3): the implementer must scan `CHANGELOG.md` (or the GitHub release notes for `@forwardimpact/libui@1.3.0`) for breaking changes to `createBoundRouter`, `render`, `freezeInvocationContext`, and the exported `components` surface used by plan-a-07; record the scan result in the part-01 PR body** even when no breakage is found. |
| `@forwardimpact/libterrain` on npm | required at the version that carries prerequisites A and B | part 01 adds it as a `devDependency`; part 03 pins the exact version that includes `--output-root` and prose-to-SQL rendering, and records it in its PR body |

**This plan must not enter implementation until prerequisites A and B are
implemented and published to npm, in addition to spec 1150 (done).** Part 01
(bootstrap + infrastructure) is the only part that can land without A/B; every
part from 03 onward needs `fit-terrain build` to run externally (A) and the
prose tables to exist (B). Approval recommendation: hold this plan in `plan
approved` state until both prerequisite specs show `plan implemented` in
`wiki/STATUS.md` and their npm releases are live; route `kata-implement` only
after both signals flip.

## Part Index

| Part | Title | Scope | Depends on |
| --- | --- | --- | --- |
| [01](plan-a-01.md) | Repo bootstrap + infrastructure | Repo skeleton via the **monorepo-setup skill**, then layered: `package.json`/`.gitignore`/CI extensions (+ `libterrain`/`map` devDeps), `docker-compose.yml`, all `infrastructure/{service}/` dirs, Kong config, `setup.sh` skeleton | A |
| [02](plan-a-02.md) | Schema + RLS + interest_signals migration | Hand-written migration for `interest_signals`, RLS policies (prose tables get `public_read` from terrain), schema verification | 01 |
| [03](plan-a-03.md) | Data pipeline (r3) | vendored `story.dsl` + `prose-cache.json` verbatim + `PROVENANCE.md`; `scripts/build-seed.sh` runs `fit-terrain build --output-root`; `setup.sh` data steps | 01, 02, prereqs A+B, spec 1150 |
| [04](plan-a-04.md) | Edge functions | `embed-seed`, `eligibility-check`, `notify-updates`, `sync-listings` under `services/polaris-functions/` | 03 |
| [05](plan-a-05.md) | Shared handlers | `products/polaris/handlers/` — `searchTrials`, `showTrial` (+FAQ/consent), `showCondition`, `checkEligibility`, `listSites` (+description), `listStories`, `showAbout` (+therapies), `manageTrial` | 03 |
| [06](plan-a-06.md) | CLI surface | `products/polaris/cli/` + `bin/bionova-polaris.js`, libcli wiring, `condition`/`stories` commands, `repl` subcommand | 05 |
| [07](plan-a-07.md) | Web surface | `products/polaris/site/` — Next.js App Router, Tailwind, shadcn/ui, libui routing, `/conditions/:id` + `/stories` routes | 05 |
| [08](plan-a-08.md) | Deployment + smoke tests | Railway watch-path config per service, seven-criteria verification script (incl. local `fit-terrain build` regen + prose tables) | 01–07 |

## Libraries used

Libraries used: `@forwardimpact/libcli` (createCli, dispatch,
freezeInvocationContext), `@forwardimpact/libui` (createBoundRouter, render,
components, freezeInvocationContext), `@forwardimpact/libformat`
(createHtmlFormatter, createTerminalFormatter), `@forwardimpact/libtemplate`
(createTemplateLoader), `@forwardimpact/librepl` (Repl). Build-time only:
`@forwardimpact/libterrain` (`fit-terrain build --output-root`; schema
resolution ships via its `libskill` dependency) — invoked by `setup.sh` and
the `build-seed` script, never imported by a surface.

## Risks

- **Prerequisites A and B are not yet specced or published.** This is the
  gating risk. r3 deliberately depends on `fit-terrain` running externally
  (A) and emitting prose tables (B); neither exists today. If either slips,
  this plan cannot start past part 01. Mitigation: the two prerequisites are
  small, well-scoped library changes (design § Prerequisite library changes
  lists the exact files and line ranges). They must be specced, implemented,
  and published as an `@forwardimpact/libterrain` (+`libsyntheticrender`,
  `libsyntheticgen`, `map`) release train before `kata-implement` is routed
  here. Part 03 pins the exact npm versions that carry them. **Fallback:** if
  A/B cannot ship, revert to r2's vendor-the-rendered-SQL pipeline (preserved
  in git history) — the app loses local regeneration and the prose surfaces,
  but still boots. That fallback is a different spec revision, not a silent
  degrade.
- **`fit-terrain build` deleting `products/polaris/`.** Without
  `--output-root`, the write sink `rm -rf`s the first two path segments of
  each output path (`sinks.js` `writeFiles` ~262–285), i.e. `products/polaris`
  — the app's own code. Part 03 always passes
  `--output-root data/synthetic/.build` and stages from there; the
  `build-seed.sh` script refuses to run if the output root resolves to the
  repo root. SC7 (regenerable) is satisfied by running the build in
  bionova-apps against the vendored DSL and byte-diffing against `SHA256SUMS`;
  the monorepo at the provenance SHA reproduces the same bytes.
- **Prose tables are silently dropped if prerequisite B is missing at
  build time.** `render-sql.js` ignores unknown entities in the output
  block's `entities[]` (no error). If part 03 runs against a `libterrain`
  that predates B, the six prose tables simply will not appear and parts
  05/07 prose surfaces will 404 on empty tables. Part 03 step 1 asserts the
  prose tables are present in the build output before proceeding, and part 08
  smoke-tests row counts, so the gap fails loudly rather than shipping blank.
- **Schema type mismatch: `trials.id` is `text` not `uuid`.** Confirmed
  at `libraries/libsyntheticrender/src/render/render-sql.js:32-33` (the
  trials entity spec) which is rendered by `renderEntityTable` (same
  file, line 157): `inferColumns` walks the records, `inferType` returns
  `text` for the string `id` values story.dsl emits, and line 162
  appends `PRIMARY KEY` to the `pk` column. (Line 303 is
  `renderEmbeddingsTable()`, a different table — the previous draft cited
  the wrong line.) All FKs to `trials(id)` and `conditions(id)` in
  hand-written migrations must use `text`. Part 02 reflects this in
  `interest_signals.trial_id`.
- **`condition_embeddings.condition_id` lacks a UNIQUE constraint** as
  emitted by render-sql.js. Part 02 adds a hand-written migration
  `CREATE UNIQUE INDEX condition_embeddings_condition_id_uidx ON
  condition_embeddings(condition_id)` so PostgREST `on_conflict` upsert
  works in `embed-seed`.
- **Forward Impact library versions** are pinned at panel-review time
  (libcli 0.1.12, libui 1.3.0, libformat 0.1.18, libtemplate 0.2.12,
  librepl 0.1.14). Patches may publish between approval and
  implementation; part 01's PR description must record the resolved
  versions. libui already crossed a minor (1.2 → 1.3) between plan-write
  and panel review, and any further minor (or major) bump on any of the
  five requires a breaking-change scan recorded in the part-01 PR — the
  scan reads the relevant `CHANGELOG.md` and confirms the symbols
  imported by plan-a-06 (CLI) and plan-a-07 (web) still behave as the
  plan assumes.
- **Postgres extension surface.** The plan uses `pgvector`, `pg_cron`,
  `pg_net`, `pgjwt`, `pgsodium`, `pgaudit`, `pgcrypto`, `uuid-ossp`. Only
  `supabase/postgres` ships all of these in one image. Part 01 step 6
  pins `supabase/postgres:15.6.1.143` (the version the Forward Impact
  monorepo runs); the alternative `pgvector/pgvector:pg16` lacks pg_net
  and would block the notify-updates trigger pathway.
- **No existing shadcn/ui or Tailwind reference in the monorepo.** Part 07
  configures shadcn from scratch using the published `npx shadcn@latest
  init` flow against a Next.js App Router project. The implementer
  follows shadcn's then-current prompts; if a flag in the plan diverges
  from the published CLI's current surface, the implementer records the
  divergence in the part-07 PR description.
- **`create-next-app` flag surface.** Part 07 step 1 uses `npx
  create-next-app@14.2 . --typescript --tailwind --eslint --app --src-dir
  --import-alias "@/*" --no-git` — `--use-bun` is dropped from the
  generator's documented surface, so the plan instead lets npm scaffold
  and immediately runs `bun install` at workspace root to convert the
  lockfile. If `create-next-app` UX has shifted further, the implementer
  follows the prompts and documents the chosen answers.
- **Cross-repo STATUS handoff.** The trailing monorepo PR (part 08 step 9)
  is the only signal `kata-release-merge` sees for this spec; the
  implementer must write the row exactly as `1160<TAB>plan<TAB>implemented`
  and include the bionova-apps repo URL in the PR body. There is no code
  diff in the monorepo to gate on, so the trusted-human approval and
  panel review of the trailing PR are the only safety net.
- **Railway deployment requires a Railway project + token.** Part 08
  step 1 creates the project; if Railway account access is unavailable
  the implementer documents the gap, defers Railway-specific verification,
  and ships local-only smoke tests. The deploy workflow installs the
  Railway CLI from a pinned npm version (`@railway/cli@3.20.0` —
  immutable on the npm registry) rather than the `curl | sh` flow,
  which resolves to a floating "latest" binary and is not a supply-chain
  point we want unpinned. The plan-a.md draft previously claimed "pins
  a specific SHA of the railway action" — there is no railway GitHub
  Action in use, so that claim is replaced with the explicit npm pin.
- **TEI embeddings cold-start can exceed 60s** on a fresh container. Part 01
  configures Docker Compose healthchecks with a 120s `start_period` and
  `setup.sh` waits on `tei`'s `/health` (internal port 80, host port 8080)
  before invoking `embed-seed`.

## Execution recommendation

| Sequencing | Notes |
| --- | --- |
| 01 → 02 → 03 sequential | Each builds on the previous (repo → schema → data) |
| 04 ∥ 05 parallel after 03 | Edge functions and handlers consume the same schema but do not depend on each other |
| 06 ∥ 07 parallel after 05 | CLI and web both consume handlers; both can be staffed concurrently |
| 08 sequential after 07 | End-to-end smoke tests require all surfaces present |

Route all parts to `staff-engineer` via `kata-implement` (this is a build,
not a documentation task). Parts 04, 05 can run as two concurrent
implementer agents; same for 06 and 07. Each part lands as one PR in
`bionova-apps`; the final part-08 PR also includes the success-criteria
verification script.

After all eight parts merge in `bionova-apps`, `staff-engineer` returns to
this monorepo, opens a single trailing PR titled
`feat(1160): mark bionova-apps build implemented`, that sets the
`wiki/STATUS.md` row to `1160\tplan\timplemented` and records the metrics
row. The bionova-apps repo URL is captured in that PR body.

— Staff Engineer 🛠️
