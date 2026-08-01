# Plan 1160-a — BioNova Polaris Application

Build the `bionova-apps` external repository to spec
[1160](spec.md) / design [a](design-a.md).

> **`bionova-apps` is a SEPARATE GitHub repository. It is its own monorepo.**
> It is a brand-new repo at `forwardimpact/bionova-apps`. It owns its own
> `MONOREPO.md`, workspaces, and CI. It consumes Forward Impact code only as
> published npm packages. It is **not** a directory inside this monorepo.
> **Never** vendor it, submodule it, or check it in here. Nothing in this plan
> creates files under this monorepo except the trailing `wiki/STATUS.md` +
> metrics update (part 08). If you write `bionova-apps` files inside this repo,
> stop. You are in the wrong working tree. See
> [§ Where this lives](#where-this-lives).

## Approach

The implementation lives in a new, separate GitHub repository
(`forwardimpact/bionova-apps`). It does not live in this monorepo. **The app
builds around synthetic data. `bionova-apps` vendors `data/synthetic/story.dsl`
and `prose-cache.json` verbatim. It then runs `fit-terrain build` against them
itself.** The DSL is the repository's domain source of truth. The build renders
the SQL migrations and the embeddings JSONL locally. Nobody authors them or
vendors them as output. This depends on two monorepo prerequisites, both
published to npm (see Prerequisites). The first is an `--output-root` flag, so
the build renders into a disposable directory and does not delete
`products/polaris/`. The second renders prose to SQL, so the build emits the
six clinical prose tables. The build needs no credentials. `fit-terrain build`
renders from the committed prose cache with zero LLM calls. A rebuild from the
vendored DSL reproduces the seed byte-for-byte (SC7). The parts decompose by
surface, so they can run in parallel where the design allows. You can verify
each part on its own, end to end, against a local `docker compose` boot. The
final part ties everything to the spec's seven success criteria.

**Do not hand-roll the repository skeleton.** Part 01 stands up the
Monorepo-standard skeleton with the **monorepo-setup skill**. That skill runs
`jidoka-setup` and then `kata-setup`. Part 01 then layers the Polaris product
and its infrastructure onto the skeleton. The skill is authoritative for the
skeleton: `git`, the base `package.json`, `.gitignore`, the directory tree,
`scripts/bootstrap.sh`, the skill packs and agent profiles, the root instruction
files, the per-concern check workflows, remote creation, the wiki, and
`.claude/settings.json`. This plan does not restate any of that. It does not
contradict it. Where a skeleton file needs bionova content, extend the file.
Never replace it.

> **Revision r3** replaces r2's "vendor the rendered SQL" pipeline with
> "vendor the DSL and render locally." r2 vendored `data/synthetic/seed/*.sql`
> because `fit-terrain` could not run outside the monorepo. r3 makes it run
> there (prerequisite A). r3 also surfaces the generated prose
> (prerequisite B). The app is then fully synthetic-data-driven. r3 rewrites
> part 03 to match.

## Where this lives

| Aspect | Value |
| --- | --- |
| Target repo | `forwardimpact/bionova-apps` (new, created in part 01) |
| Local working dir | `~/work/bionova-apps/` (sibling to this monorepo) |
| All file paths in parts | relative to `bionova-apps/` repo root |
| Monorepo deliverable | this plan and the STATUS update only. The monorepo has no `bionova-apps/` directory |

The implementer **must not** commit anything related to bionova-apps inside
this monorepo. The kata-implement skill operates on the external repo for
this spec. The monorepo PR (`plan-implemented`) updates only
`wiki/STATUS.md` and this plan's metrics row.

## Prerequisites

| Dep | Status | Where checked |
| --- | --- | --- |
| Spec 1140 — clinical-output pipeline | implemented (commits `8bbf8f1c`, `0c921e81`) | `libterrain` clinical-output stage emits `supabase_migration` + `embeddings_jsonl` files |
| Spec 1150 — story.dsl clinical rewrite | **implemented**. `wiki/STATUS.md` has the row `1150 plan implemented`. A live check on 2026-06-11 ran `bunx fit-terrain build` at `6010964b`: 0 cache misses, all seed artifacts produced | story.dsl carries `clinical {}` + `output … supabase_migration {…}` blocks at `data/synthetic/story.dsl:1250–1272` |
| **Prerequisite A — `fit-terrain` external execution** | **implemented**. `fit-terrain` 0.1.41 on npm ships `--output-root` and `--schema-dir`. `--output-root` routes the write sink off the project root, so the build does not `rm -rf products/polaris/`. `--schema-dir` defaults to `@forwardimpact/libskill`'s published `schema/json`, a hard dependency of `libterrain` | `bunx fit-terrain --help` lists `--output-root` and `--schema-dir`. See design § Prerequisite library changes A. |
| **Prerequisite B — clinical prose → SQL** | **implemented**. The six prose types materialize as records with `TABLE_SPEC` entries. The prose cache reaches `renderSql`. This ships in the same `fit-terrain` release | the rendered build output contains the six prose seed tables (part 03 asserts this). See design § Prerequisite library changes B. |
| `@forwardimpact/libcli@0.1.17`, `libui@1.4.1`, `libformat@0.1.21`, `libtemplate@0.2.14`, `librepl@0.1.16` on npm | published. The last reference pass verified the versions with `npm view @forwardimpact/<lib> version` | part 01 pins these exact versions. The implementer runs `npm view @forwardimpact/{libcli,libui,libformat,libtemplate,librepl} version` again immediately before `bun install`. The implementer bumps the pins in the part-01 PR if npm published a further patch level since. **If any of the five crossed a minor version or a major version since these pins, the implementer must scan its `CHANGELOG.md` (or the GitHub release notes) for breaking changes. The scan covers the symbols that plan-a-06 (CLI) and plan-a-07 (web) import: `createCli`, `createBoundRouter`, `render`, `freezeInvocationContext`, and the exported `components` surface. The implementer must record the scan result in the part-01 PR body** even when the scan finds no breakage. |
| `fit-terrain` on npm | published. 0.1.41 carries prerequisites A and B | part 01 adds it as a pinned `devDependency` (0.1.41). Part 03 verifies that the pinned version carries `--output-root` and renders prose to SQL. Part 03 records the result in its PR body |

**Prerequisites A and B are implemented and published to npm** (they ship in
`fit-terrain` 0.1.41 and later). Spec 1150 is also done. The plan is
unblocked end to end. Every part from 03 onward needs `fit-terrain build` to
run externally (A). Every part from 03 onward also needs the prose tables to
exist (B). The pinned devDependency satisfies both.

## Part Index

| Part | Title | Scope | Depends on |
| --- | --- | --- | --- |
| [01](plan-a-01.md) | Repo bootstrap + infrastructure | Repo skeleton with the **monorepo-setup skill**, then layered: `package.json`/`.gitignore`/CI extensions (+ the `fit-terrain` devDep), `docker-compose.yml`, all `infrastructure/{service}/` dirs, Kong config, `setup.sh` skeleton | A |
| [02](plan-a-02.md) | Schema + RLS + interest_signals migration | Hand-written migration for `interest_signals`, RLS policies (prose tables get `public_read` from terrain), schema verification | 01 |
| [03](plan-a-03.md) | Data pipeline (r3) | vendored `story.dsl` + `prose-cache.json` verbatim + `PROVENANCE.md`. `scripts/build-seed.sh` runs `fit-terrain build --output-root`. `setup.sh` data steps | 01, 02, prereqs A+B, spec 1150 |
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
`fit-terrain` (`fit-terrain build --output-root`). Its `libskill` dependency
ships the schema resolution. `setup.sh` and the `build-seed` script call it.
No surface ever imports it.

## Risks

- **A build against a `fit-terrain` that predates prerequisites A and B.**
  Both prerequisites are implemented and published (`fit-terrain` 0.1.41+).
  The residual risk is version drift. An implementer who resolves an older
  version loses external execution (A) or the prose tables (B). Part 01 pins
  the devDependency. Part 03 verifies that the pinned version carries
  `--output-root` and the prose seed tables before it proceeds.
- **`fit-terrain build` can delete `products/polaris/`.** Without
  `--output-root`, the write sink `rm -rf`s the first two path segments of
  each output path (`sinks.js` `writeFiles` ~262–285). Those segments are
  `products/polaris`, the app's own code. Part 03 always passes
  `--output-root data/synthetic/.build` and stages from there. The
  `build-seed.sh` script refuses to run if the output root resolves to the
  repo root. To satisfy SC7 (regenerable), run the build in bionova-apps
  against the vendored DSL. Then byte-diff the result against `SHA256SUMS`.
  The monorepo at the provenance SHA reproduces the same bytes.
- **`fit-terrain` drops the prose tables silently if prerequisite B is
  absent at build time.** `render-sql.js` ignores unknown entities in the
  output block's `entities[]` and raises no error. If part 03 runs against a
  `fit-terrain` that predates B, the six prose tables do not appear. The
  prose surfaces in parts 05 and 07 then 404 on empty tables. Part 03 step 1
  asserts that the build output has the prose tables before it proceeds. Part
  08 smoke-tests the row counts. The gap then fails loudly. It does not ship
  blank.
- **Schema type mismatch. `trials.id` is `text`. It is not `uuid`.**
  `libraries/libsyntheticrender/src/render/render-sql.js:32-33` holds the
  trials entity spec and confirms this. `renderEntityTable` renders that
  spec (same file, line 157). `inferColumns` walks the records. `inferType`
  returns `text` for the string `id` values story.dsl emits. Line 162
  appends `PRIMARY KEY` to the `pk` column. (Line 303 is
  `renderEmbeddingsTable()`, a different table. The previous draft cited
  the wrong line.) All FKs to `trials(id)` and `conditions(id)` in
  hand-written migrations must use `text`. Part 02 reflects this in
  `interest_signals.trial_id`.
- **`condition_embeddings.condition_id` lacks a UNIQUE constraint** in the
  output that render-sql.js emits. Part 02 adds a hand-written migration
  `CREATE UNIQUE INDEX condition_embeddings_condition_id_uidx ON
  condition_embeddings(condition_id)`. The PostgREST `on_conflict` upsert
  then works in `embed-seed`.
- **Forward Impact library versions** are pinned at the last reference pass
  (libcli 0.1.17, libui 1.4.1, libformat 0.1.21, libtemplate 0.2.14,
  librepl 0.1.16). Patches may publish between passes. Part 01's PR
  description must record the resolved versions. A minor bump or a major
  bump on any of the five requires a breaking-change scan in the part-01 PR.
  The scan reads the relevant `CHANGELOG.md`. It confirms that the symbols
  plan-a-06 (CLI) and plan-a-07 (web) import still behave as the plan
  assumes.
- **Postgres extension surface.** The plan uses `pgvector`, `pg_cron`,
  `pg_net`, `pgjwt`, `pgsodium`, `pgaudit`, `pgcrypto`, `uuid-ossp`. Only
  `supabase/postgres` ships all of these in one image. Part 01 step 6
  pins `supabase/postgres:15.6.1.143` (the version the Forward Impact
  monorepo runs). The alternative `pgvector/pgvector:pg16` lacks pg_net.
  It would block the notify-updates trigger pathway.
- **The monorepo has no shadcn/ui or Tailwind reference.** Part 07
  configures shadcn from scratch with the published `npx shadcn@latest
  init` flow against a Next.js App Router project. The implementer
  follows shadcn's then-current prompts. If a flag in the plan diverges
  from the current surface of the published CLI, the implementer records
  the divergence in the part-07 PR description.
- **`create-next-app` flag surface.** Part 07 step 1 uses `npx
  create-next-app@14.2 . --typescript --tailwind --eslint --app --src-dir
  --import-alias "@/*" --no-git`. The generator's documented surface no
  longer has `--use-bun`. So the plan lets npm scaffold the project. It then
  runs `bun install` immediately at the workspace root to convert the
  lockfile. If the `create-next-app` UX shifts further, the implementer
  follows the prompts and documents the chosen answers.
- **Cross-repo STATUS handoff.** The trailing monorepo PR (part 08 step 9)
  is the only signal `kata-release-merge` sees for this spec. The
  implementer must write the row exactly as `1160<TAB>plan<TAB>implemented`.
  The implementer must also include the bionova-apps repo URL in the PR
  body. The monorepo has no code diff to gate on. So the trusted-human
  approval and the panel review of the trailing PR are the only safety net.
- **Railway deployment requires a Railway project and a token.** Part 08
  step 1 creates the project. If the implementer has no Railway account
  access, the implementer documents the gap, defers the Railway-specific
  verification, and ships local-only smoke tests. The deploy workflow
  installs the Railway CLI from a pinned npm version (`@railway/cli@3.20.0`,
  immutable on the npm registry). It does not use the `curl | sh` flow.
  That flow resolves to whatever binary "latest" points to. We do not want that
  supply-chain point unpinned. The plan-a.md draft claimed earlier that it
  "pins a specific SHA of the railway action". No railway GitHub Action is
  in use. So the explicit npm pin replaces that claim.
- **TEI embeddings cold-start can exceed 60s** on a fresh container. Part 01
  configures the Docker Compose healthchecks with a 120s `start_period`.
  `setup.sh` waits on `tei`'s `/health` (internal port 80, host port 8080)
  before it invokes `embed-seed`.

## Execution recommendation

| Sequence | Notes |
| --- | --- |
| 01 → 02 → 03 sequential | Each builds on the previous (repo → schema → data) |
| 04 ∥ 05 parallel after 03 | Edge functions and handlers consume the same schema but do not depend on each other |
| 06 ∥ 07 parallel after 05 | CLI and web both consume handlers. You can staff both at the same time |
| 08 sequential after 07 | End-to-end smoke tests require all surfaces present |

Route all parts to `staff-engineer` through `kata-implement`. This is a build.
It is not a documentation task. Parts 04 and 05 can run as two concurrent
implementer agents. Parts 06 and 07 can do the same. Each part lands as one
PR in `bionova-apps`. The final part-08 PR also includes the success-criteria
verification script.

After all eight parts merge in `bionova-apps`, `staff-engineer` returns to
this monorepo. It opens a single trailing PR titled
`feat(1160): mark bionova-apps build implemented`. That PR sets the
`wiki/STATUS.md` row to `1160\tplan\timplemented`. It also records the
metrics row. That PR body captures the bionova-apps repo URL.

— Staff Engineer 🛠️
