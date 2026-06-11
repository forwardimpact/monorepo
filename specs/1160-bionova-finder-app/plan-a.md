# Plan 1160-a — Clinical Research Finder Application

Build the `bionova-apps` external repository to spec
[1160](spec.md) / design [a](design-a.md).

## Approach

The implementation lives in a new, separate GitHub repository
(`forwardimpact/bionova-apps`) — not in this monorepo. **bionova-apps does
NOT run `fit-terrain` itself**: `libterrain`'s bin resolves its project
root by upward `package.json` search from the consumer's CWD
(`bin/fit-terrain.js:199`, `runtime.finder.findProjectRoot()`), so from an
external repo it would look for `data/synthetic/story.dsl` and
`products/map/schema/json` in that repo — neither exists outside the
monorepo, and the schema dir is not in the published npm package. The
data pipeline is therefore inverted (r2, see part 03): the implementer
regenerates terrain output inside the monorepo (spec 1150's
implementation; output paths are gitignored, never committed) and
**vendors** the SQL and JSONL artifacts into bionova-apps at
`data/synthetic/seed/` with recorded provenance. No network fetch occurs
at `setup.sh` time. Parts are decomposed by surface so they can run in
parallel where the design allows. Each part is independently verifiable
end-to-end against a local `docker compose` boot; the final part ties
everything to the spec's six success criteria.

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
| Spec 1150 — story.dsl clinical rewrite | **implemented** (`wiki/STATUS.md` row `1150 plan implemented`; live-verified 2026-06-11 — `bunx fit-terrain build` at `6010964b`: 0 cache misses, all 10 seed artifacts produced) | story.dsl carries `clinical {}` + `output … supabase_migration {…}` blocks at `data/synthetic/story.dsl:1250–1266` |
| `@forwardimpact/libcli@0.1.12`, `libui@1.3.0`, `libformat@0.1.18`, `libtemplate@0.2.12`, `librepl@0.1.14` on npm | published — versions verified via `npm view @forwardimpact/<lib> version` at panel-review time | part 01 pins these exact versions; implementer re-runs `npm view @forwardimpact/{libcli,libui,libformat,libtemplate,librepl} version` immediately before `bun install` and bumps in the part-01 PR if any further patch level published since. **libui crossed a minor (1.2 → 1.3): the implementer must scan `CHANGELOG.md` (or the GitHub release notes for `@forwardimpact/libui@1.3.0`) for breaking changes to `createBoundRouter`, `render`, `freezeInvocationContext`, and the exported `components` surface used by plan-a-07; record the scan result in the part-01 PR body** even when no breakage is found. **libterrain is NOT a bionova-apps dependency** — see Approach |

**This plan should not enter implementation until spec 1150 lands on
`origin/main`.** Spec 1150 generates the clinical schema and seed data
that every part beyond 01 references. Part 01 (bootstrap + infrastructure)
is the only part that can land without 1150 — and even that is risky
because the postgres image choice (see part 01 step 6) depends on the
extensions terrain ultimately needs. Approval recommendation: hold this
plan in `plan approved` state until `wiki/STATUS.md` shows `1150 plan
implemented`; route `kata-implement` only after that signal flips.

## Part Index

| Part | Title | Scope | Depends on |
| --- | --- | --- | --- |
| [01](plan-a-01.md) | Repo bootstrap + infrastructure | New repo, MONOREPO.md, `package.json`, `docker-compose.yml`, all `infrastructure/{service}/` dirs, Kong config, `setup.sh` skeleton | — |
| [02](plan-a-02.md) | Schema + RLS + interest_signals migration | Hand-written migration for `interest_signals`, RLS policies, schema verification | 01 |
| [03](plan-a-03.md) | Data pipeline (r2) | vendored terrain seed in `data/synthetic/seed/` + `PROVENANCE.md`, `scripts/stage-seed.sh`, `setup.sh` data steps | 01, 02, spec 1150 implemented |
| [04](plan-a-04.md) | Edge functions | `embed-seed`, `eligibility-check`, `notify-updates`, `sync-listings` under `services/finder-functions/` | 03 |
| [05](plan-a-05.md) | Shared handlers | `products/finder/handlers/` — `searchTrials`, `showTrial`, `checkEligibility`, `listSites`, `showAbout`, `manageTrial` | 03 |
| [06](plan-a-06.md) | CLI surface | `products/finder/cli/` + `bin/bionova-finder.js`, libcli wiring, `repl` subcommand | 05 |
| [07](plan-a-07.md) | Web surface | `products/finder/site/` — Next.js App Router, Tailwind, shadcn/ui, libui routing | 05 |
| [08](plan-a-08.md) | Deployment + smoke tests | Railway watch-path config per service, success-criteria verification script | 01–07 |

## Libraries used

Libraries used: `@forwardimpact/libcli` (createCli, dispatch, freezeInvocationContext), `@forwardimpact/libui` (createBoundRouter, render, components, freezeInvocationContext), `@forwardimpact/libformat` (createHtmlFormatter, createTerminalFormatter), `@forwardimpact/libtemplate` (createTemplateLoader), `@forwardimpact/librepl` (Repl).

## Risks

- **Spec 1150 not implemented before this plan starts.** Resolved — 1150
  is implemented and live-verified (see Prerequisites). r1's residual
  assumption that 1150's artifacts would be *committed* to monorepo
  `main` was never true (terrain output is generated, never committed —
  `products/finder/` is gitignored); part 03 (r2) therefore vendors
  regenerated artifacts instead of fetching committed ones. Part 03
  step 1 regenerates and verifies the artifact list before vendoring.
- **libterrain not invokable from external repos.** Re-confirmed at
  revision time (the mechanism changed since r1, the conclusion holds):
  `libraries/libterrain/bin/fit-terrain.js:199` now resolves
  `monorepoRoot` via `runtime.finder.findProjectRoot()` (upward
  `package.json` search from CWD), so in bionova-apps it would resolve
  bionova-apps' own root — which has no `data/synthetic/story.dsl` and
  no `products/map/schema/json` (line 200; the schema dir is absent
  from libterrain's published `files` field). Conclusion unchanged:
  bionova-apps cannot run terrain; it consumes terrain output produced
  inside the monorepo. SC6 (regenerable) is satisfied by regenerating
  in the monorepo at the provenance SHA and byte-diffing against the
  vendored copies — see part 03 (r2) and spec SC6 as corrected.
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
