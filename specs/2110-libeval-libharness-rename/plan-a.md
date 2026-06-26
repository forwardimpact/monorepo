# Plan 2110-a: Rename `libeval` → `libharness`

Executes [design 2110-a](./design-a.md) for [spec 2110](./spec.md).

## Approach

Land the six change-units (U1–U6) plus the cross-repo unit (X1) from the
design's § Change-units as ordered atomic commits, each leaving `bun run check`
(format, lint, jsdoc, `invariants`, `context`) and `bun run test` green. The
rename is a clean break: every identity token in the four families (`libeval`,
`@forwardimpact/libeval`, `LIBEVAL_*`, `fit-eval`) moves to its `harness`
equivalent and the old names stop being recognized, while the evaluation-domain
keep-list (criterion 6) is left untouched. Version `0.1.66` is preserved across
the directory move.

Libraries used: none.

## Token-classification rule (applies to every step)

Rename only the four identity families. **Keep** every match of:
`evaluateAssertion`, the `Judge`, "run an eval"/"an eval" phrasing, the package
`description`/`keywords: ["eval"]`/`jobs` evaluation language, the
`run-eval`/`run-benchmark`/`trace-analysis` doc slugs, and the
`libmock/src/fixture/eval.js` **filename**. When a kept surface also shows an
identity token (e.g. a guide that prints `@forwardimpact/libeval fit-eval …`),
rename only the identity token inside it.

## Codemod method (applies to every step)

Each unit performs a **category-scoped blanket replace** of its assigned token
family across **every file in its surface**, not only the files tabled below.
The file tables are a *verified inventory* (the exemplars and the non-obvious
sites), **not** an allowlist — comments, JSDoc, help strings, runtime strings
(e.g. a `mkdtemp` prefix), `describe(...)` titles, and test bodies inside the
surface all rename too. The authoritative completeness gate is each unit's
verify line: a **family-scoped `rg`** over the unit's surface must return zero
residual (modulo the keep-list). Golden CLI fixtures are **regenerated** from
actual CLI output via `scripts/capture-cli-golden.mjs`, never hand-edited.

Token-family → unit ownership:

| Family | Owning unit(s) |
| --- | --- |
| `@forwardimpact/libeval` (import specifiers, dep ranges) | U1 |
| `libeval` (dir, paths, prose, comments, `libeval:` stderr prefixes) | U1 (code + library tree + cross-lib consumers); U4 (docs/skills/`.github`) |
| `fit-eval` → `fit-harness` (CLI command, bins, launchers, help strings, golden, invariant) | U2 (package tree + launchers + invariant); U4 (docs/skills/`.github`/manifest) |
| `LIBEVAL_*` → `LIBHARNESS_*` (env reads/writes + test assertions) | U3 (code + tests + library READMEs); U4 (doc/workflow prose) |

## Step U1 — Library identity and importers (one commit)

Move the package directory and repoint every `@forwardimpact/libeval` importer
and `libeval` prose token in code so module resolution never breaks mid-commit.

**Surface:** `libraries/libharness/**` (the moved tree), plus the cross-library
consumers below. Blanket-replace `@forwardimpact/libeval` → `@forwardimpact/libharness`
and `libeval` → `libharness` (the latter excluding `fit-eval`/`LIBEVAL_`, owned
by U2/U3). Defer doc/skill/`.github` `libeval` prose to U4.

| Path | Change |
| --- | --- |
| `libraries/libeval/` → `libraries/libharness/` | `git mv` the whole directory |
| `libraries/libharness/package.json` | `name` → `@forwardimpact/libharness`; `repository.directory` → `libraries/libharness`. Keep `version`, `description`, `keywords`, `jobs` |
| `libraries/libharness/src/**`, `bin/**`, `test/**` | every `@forwardimpact/libeval` import specifier → `@forwardimpact/libharness` (the ~35 test importers + `mock-runner.js` + `src/commands/{output,trace}.js`); every prose/comment `libeval` → `libharness`, incl. `src/events/github.js` (18,122), `src/profile-prompt.js` (4,23), `src/commands/task-input.js` (6), `src/benchmark/judge.js` (2,5,179), and the user-facing stderr prefix in `src/benchmark/env-loader.js:138` (`"libeval: env warning:"` → `"libharness: …"`) |
| `libraries/libharness/README.md` | `# libeval` title, body `libeval` prose, the `@forwardimpact/libeval` import example (119). Keep evaluation-framework prose; `fit-eval` rows → U2, `LIBEVAL_REDACTION_*` → U3 |
| `libraries/libwiki/package.json` (50) | dep key `@forwardimpact/libeval` → `@forwardimpact/libharness` (keep `^` range) |
| `libraries/libwiki/src/commands/fix.js` (8) | import specifier → `@forwardimpact/libharness` |
| `products/gear/package.json` (47) | dep key → `@forwardimpact/libharness` |
| `libraries/libmock/README.md` (52) | "libeval stream/message helpers" → "libharness …" |
| `libraries/libmock/src/fixture/eval.js` (2,5) | header comments "libeval-style" and the `libraries/libeval/test` path → `libharness` (**filename unchanged**) |
| `libraries/libharness/bin/fit-selfedit.js` (5) | `libraries/libeval/README.md` path comment → `libharness` |
| `libraries/libbridge/src/dispatch.js` (20) | "trace linkage in libeval" comment → `libharness` |
| `scripts/staff-engineer-record-prior-trace.mjs` (244) | "in libeval's trace-collector" comment → `libharness` |
| `bun.lock` | regenerated by `bun install` (see verify); commit the result |

**Verify:** `bun install` resolves with no unmet `@forwardimpact/libeval`;
`test -d libraries/libharness && test ! -d libraries/libeval`; case-sensitive `rg 'libeval'` over
`libraries/libharness libraries/libwiki products/gear libraries/libmock
libraries/libbridge scripts` returns nothing (it catches standalone `libeval`
and `@forwardimpact/libeval` but not uppercase `LIBEVAL_` or `fit-eval`, which
contains no `libeval` substring — both owned by U2/U3); `bun run test` green for `libharness`, `libwiki`,
`gear` (tests still carry `fit-eval`/`LIBEVAL_` strings — green because those
are inert describe/assertion text until U2/U3, and the bin smoke + golden
spawn-by-name still resolve `fit-eval` until U2).

## Step U2 — CLI, launchers, golden, and `public-cli-set` (one commit)

Blanket-replace `fit-eval` → `fit-harness` across the package tree, launchers,
and invariant, and regenerate the golden fixtures. The CLI rename, every
launcher byte-image, and the golden capture move together because
`public-cli-set` checks launcher bins byte-exact and the golden test spawns the
renamed bin.

**Surface:** `libraries/libharness/{src,bin,test}/**`, `launchers/**`,
`.coaligned/invariants/public-cli-set.rules.mjs`.

| Path | Change |
| --- | --- |
| `libraries/libharness/bin/fit-eval.js` → `bin/fit-harness.js` | `git mv` |
| `libraries/libharness/package.json` | `bin` + `exports` keys `fit-eval` → `fit-harness` and their `./bin/fit-eval.js` → `./bin/fit-harness.js`; three other CLI keys unchanged |
| `libraries/libharness/src/**` | help/usage/runtime `fit-eval` strings → `fit-harness`: `commands/{run,supervise,output,tee,facilitate}.js`, `agent-runner.js` (3–4,39), `trace-collector.js` (274), and the `mkdtemp("fit-eval-agent-")` prefix in `supervise.js:27` → `"fit-harness-agent-"` |
| `libraries/libharness/bin/fit-trace.js` (53,458) | `fit-eval` in the `fit-trace` help description and the skill-doc line → `fit-harness` |
| `libraries/libharness/test/**` | `fit-eval` describe/spawn tokens: `bin-smoke.integration.test.js:11` (`BINS = ["fit-eval", …]` → `"fit-harness"`), `work-tracker.test.js` (21,130), `callback.test.js` (72) |
| `libraries/libharness/test/golden/fit-eval/` → `golden/fit-harness/` | `git mv` dir; **regenerate** via `node scripts/capture-cli-golden.mjs --bin fit-harness --exec libraries/libharness/bin/fit-harness.js --golden-dir libraries/libharness/test/golden/fit-harness` (re-captures `help/run-help/unknown/no-command` outputs that embed `fit-eval`) |
| `libraries/libharness/test/golden/fit-trace/` | dir name unchanged; **regenerate** after the `bin/fit-trace.js` help edit so `help.stdout.txt` (1,72) no longer prints `fit-eval` |
| `libraries/libharness/test/fixtures/divergence-run481.ndjson` (8,180) | the four `"fit-eval"` entries (each `init` event lists it in both its `slash_commands` and `skills` arrays) → `"fit-harness"`. Rationale: a deliberate fixture edit (not immutable history per spec § Out of scope) so the criterion-1 oracle stays clean; the divergence test compares event structure/cost, not those arrays |
| `libraries/libharness/README.md` (19,20,24,150) | `fit-eval` catalog rows and prose → `fit-harness` |
| `launchers/fit-eval/` → `launchers/fit-harness/` | `git mv` dir; rename `bin/fit-eval.js` → `bin/fit-harness.js` |
| `launchers/fit-harness/bin/fit-harness.js` | body = `#!/usr/bin/env node` then `import "@forwardimpact/libharness/bin/fit-harness.js";` — exactly the two-line shebang+import canonical image (LF, single trailing newline) |
| `launchers/fit-harness/package.json` | `name` → `fit-harness`; `description` → "Run fit-harness … launcher for @forwardimpact/libharness"; `repository.directory` → `launchers/fit-harness`; `bin` key → `fit-harness`; dep key → `@forwardimpact/libharness` (keep `0.0.0`) |
| `launchers/fit-trace/bin/fit-trace.js`, `launchers/fit-benchmark/bin/fit-benchmark.js` | import → `@forwardimpact/libharness/bin/<cli>.js` |
| `launchers/{fit-trace,fit-benchmark}/package.json` | dep key → `@forwardimpact/libharness` (names unchanged) |
| `.coaligned/invariants/public-cli-set.rules.mjs` | the `SIBLING_ACTION_CLIS` array entry `"fit-eval"` → `"fit-harness"` (in the `export` at ~35–40); `canonicalBinContent` JSDoc `srcName` example `@forwardimpact/libeval` → `@forwardimpact/libharness` (65) |

**Verify:** `bun run invariants` green (`public-cli-set`); `npx fit-harness
--help` exits 0; `package.json` `bin`+`exports` carry `fit-harness`,
`fit-trace`, `fit-benchmark`, `fit-selfedit`; `node
scripts/capture-cli-golden.mjs --bin fit-harness … --verify` and the
`fit-trace` golden verify both pass; `bun run test` green incl.
`bin-smoke.integration.test.js` and `fixture-divergence-run481.test.js`; `rg
'fit-eval' libraries/libharness launchers .coaligned/invariants/public-cli-set.rules.mjs`
returns nothing.

## Step U3 — Env-var contract `LIBEVAL_*` → `LIBHARNESS_*` (one commit)

Blanket-replace `LIBEVAL_*` → `LIBHARNESS_*` at every read site, write site, and
test assertion, plus the library READMEs — no alias or fallback. The `SKILL`
writer (`agent-runner`) and its cross-process reader (`libxmr`) must move
together here.

**Surface:** `libraries/libharness/{src,test}/**`, `libraries/libxmr/**`,
`libraries/libwiki/test/**`, and the two README env tokens. Doc/workflow
`LIBEVAL_*` prose is U4.

| Path | Tokens |
| --- | --- |
| `libraries/libharness/src/commands/work-tracker.js` | `LIBEVAL_WORK_TRACKER` (code + JSDoc) |
| `libraries/libharness/src/redaction.js` | `LIBEVAL_REDACTION_DISABLED`, `LIBEVAL_REDACTION_ENV_VARS`, the `"libeval: trace redaction DISABLED …"` stderr string, and the JSDoc cross-refs to `LIBEVAL_SKILL`/`LIBEVAL_AGENT_PROFILE` |
| `libraries/libharness/src/agent-runner.js` | `env.LIBEVAL_SKILL` write + two JSDoc mentions |
| `libraries/libharness/src/commands/{run,supervise,facilitate,discuss,benchmark-run}.js` | `LIBEVAL_AGENT_PROFILE` / `LIBEVAL_WORK_TRACKER` writes + JSDoc |
| `libraries/libxmr/src/commands/record.js` | `LIBEVAL_SKILL` read + error message |
| `libraries/libxmr/bin/fit-xmr.js` (124) | `--help` string "falls back to LIBEVAL_SKILL" → `LIBHARNESS_SKILL` |
| `libraries/libharness/test/**` | `work-tracker.test.js` (wholesale rename of its ~15 `LIBEVAL_WORK_TRACKER` sites, not just new assertions), `redaction-opt-out.test.js`, `redaction-matching.test.js`, `redaction-pipeline-producer.test.js`, `agent-runner-skill-env.test.js` |
| `libraries/libxmr/test/**` | `record.test.js`, golden `record-no-skill.stderr`, `cases.json` (the `LIBEVAL_SKILL` assertion surface) |
| `libraries/libwiki/test/{cli-claim,cli-memo.integration,cli-log,cli-boot,cli-inbox,cli-agent-flag}.test.js` | `LIBEVAL_AGENT_PROFILE` fail-closed assertions → `LIBHARNESS_AGENT_PROFILE` |
| `libraries/libharness/README.md` (154,160) | `LIBEVAL_REDACTION_ENV_VARS`, `LIBEVAL_REDACTION_DISABLED` |

Add/adjust assertions so the tests prove `LIBHARNESS_*` is honored and
`LIBEVAL_*` is ignored.

**Verify:** `bun run test` green for `libharness`, `libxmr`, `libwiki`; `rg
'LIBEVAL_'` over `libraries/libharness libraries/libxmr libraries/libwiki`
returns nothing (remaining `LIBEVAL_` lives only in the four U4-owned
doc/workflow surfaces).

## Step U4 — Prose, docs, skills, refs, and build manifest (one commit)

Rename every identity token in non-generated prose, the `FIT_EVAL_REF`
placeholder family, the build manifest, and the remaining `LIBEVAL_*`
doc/workflow surfaces; then reseed the `sibling-composite-actions` enum.

**Surface:** `KATA.md`, `CLAUDE.md`, `.github/**` (non-`uses:`), `.claude/**`,
`websites/**`, `build/cli-manifest.json`, the `libskill`/`libcoaligned`
fixtures, and `launchers/README.md`.

| Path | Change |
| --- | --- |
| `KATA.md` | harness `libeval` prose mentions and the diagram node `Harness / libeval` → `libharness` (the `forwardimpact/fit-eval` line inside the `enum:sibling-composite-actions:list` fence is reseed-generated, not hand-edited) |
| `.github/CLAUDE.md` | the `fit-eval` third-party-actions table row (→ `fit-harness`, URL → `forwardimpact/fit-harness`), the `kata-agent` row prose, the `IS_SANDBOX` section (`fit-eval`, "kept out of `libeval`") |
| `CLAUDE.md` | `sibling-composite-actions` enum-list block (reseed, below) |
| `libraries/CLAUDE.md` | `fit-eval` worked example → `fit-harness` |
| `.claude/skills/fit-eval/` → `.claude/skills/fit-harness/` | `git mv` dir; frontmatter `name`, body, `references/cli.md`, Documentation links → `fit-harness`; keep "run an eval" phrasing, rename printed `@forwardimpact/libeval fit-eval …` tokens |
| `.claude/skills/fit-benchmark/SKILL.md` | identity tokens incl. the `libraries/libeval/src/benchmark/result.js` path → `libharness` |
| `.claude/skills/fit-trace/SKILL.md` | identity tokens → `fit-harness` / `libharness` |
| `.claude/skills/fit-wiki/SKILL.md` | `LIBEVAL_AGENT_PROFILE` doc line → `LIBHARNESS_AGENT_PROFILE` |
| `.claude/skills/kata-setup/SKILL.md`, `references/workflow-dispatch.md`, `references/workflow-shift.md` | `forwardimpact/fit-eval@{{FIT_EVAL_REF}}` **and** the `{{FIT_EVAL_REF}}` placeholder → `{{FIT_HARNESS_REF}}`; `.../fit-eval/tags` example → `.../fit-harness/tags` |
| `.claude/agents/references/work-trackers.md` | `LIBEVAL_WORK_TRACKER`, `fit-eval` → `LIBHARNESS_WORK_TRACKER`, `fit-harness` |
| `.claude/rules/test-file-shape.md` | `libraries/libeval/test/…` path → `libharness` |
| `libraries/libskill/test/{ref-anchors,ref-lint}.test.js` | `FIT_EVAL_REF` → `FIT_HARNESS_REF`, `forwardimpact/fit-eval` fixtures + the `.claude/skills/fit-eval/SKILL.md` fixture path → `fit-harness`, `repo: "fit-eval"` → `"fit-harness"` |
| `libraries/libcoaligned/test/enumeration-drift.test.js` (254,258) | the `sibling-composite-actions` grammar fixture rows (`fit-eval` → `fit-harness`) |
| `build/cli-manifest.json` (90) | `"name": "fit-eval"` entry → `"fit-harness"` (hand-maintained; not a `context:fix` output) |
| `websites/fit/docs/internals/release/index.md` (66) | the `fit-gear` catalog row's `fit-eval` → `fit-harness` |
| `websites/fit/docs/libraries/{bridge-channels,prove-changes,prove-changes/run-benchmark,prove-changes/run-eval,prove-changes/trace-analysis}/index.md` | identity tokens (`@forwardimpact/libeval`, `fit-eval`) → `libharness` / `fit-harness`; keep `run-eval` slug and "run an eval" phrasing |
| `.github/workflows/kata-dispatch.yml` | `bunx fit-eval callback` (216) → `bunx fit-harness callback` (CI-green pre-publish because `bunx` resolves the workspace bin renamed by U2 in the same merge train, not the npm registry); the two `libeval` path/prose comments (142,145) → `libharness` |
| `.github/workflows/eval-kata.yml` (22) | `LIBEVAL_WORK_TRACKER` → `LIBHARNESS_WORK_TRACKER` |
| `launchers/README.md` | `fit-eval` "npm name = invoked name" worked example → `fit-harness` |

Reseed the enum consumers **in this same commit** (the source row in
`.github/CLAUDE.md` changed, so `enumeration-drift` would otherwise be red):
`bunx coaligned invariants --seed enumeration-drift` updates the `enum:` blocks
in `CLAUDE.md`, `KATA.md`, and `.github/CLAUDE.md`.

**Verify:** `bun run invariants` green (`enumeration-drift`, `public-cli-set`,
`skill-genericity`); `bun run build-all` (or the targeted binary build)
resolves the `fit-harness` `cli-manifest.json` entry; `bun run test` green for
`libskill`, `libcoaligned`, `libxmr`; `rg 'LIBEVAL_'` returns nothing
repo-wide.

## Step U5 — Regenerate package-derived tables (one commit)

Regenerate the catalog/jobs tables from the renamed `package.json`; never
hand-edit them.

**Modified (generated):** `libraries/README.md` catalog + jobs blocks,
`websites/README.md` jobs line.

Concrete: run `bun run context:fix`; commit only its output.

**Verify:** `bun run context:fix` produces no further diff;
`rg 'libeval|@forwardimpact/libeval|LIBEVAL_' --glob '!specs/**' --glob '!**/CHANGELOG.md'`
returns nothing, and `rg 'fit-eval' …` returns only the `uses:`/allowlist lines
deferred to U6.

## Step U6 — Flip sibling `uses:` pins and allowlist (one commit, after X1)

Point every sibling reference at the new repo once X1's tag exists (see §
Execution for ordering).

**Modified:**

| Path | Change |
| --- | --- |
| `.github/workflows/{eval-guide,kata-dispatch,kata-interview}.yml` | `uses: forwardimpact/fit-eval@<oldSHA> # v1` → `forwardimpact/fit-harness@<newSHA> # v1` |
| `.github/workflows/sibling-edit.yml` (4,28,85) | allowlist `fit-eval` → `fit-harness` (comment, input description, `case` arm) |

**Verify:** every pinned SHA resolves on `forwardimpact/fit-harness`
([citation integrity](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/citation-integrity.md));
final `rg 'libeval|LIBEVAL_|fit-eval' --glob '!specs/**' --glob '!**/CHANGELOG.md'`
returns only the criterion-6 evaluation-domain keep-list (criterion 1).

## Step X1 — Sibling action repo (outside this checkout; runs before U6)

Create `forwardimpact/fit-harness`, port the `fit-eval` composite action (its
`npx`/`bunx` invocations switch to `fit-harness`), and cut a `v1.0.x` release
tag. Coordinated per [`.github/CLAUDE.md`](../../.github/CLAUDE.md); not a
monorepo commit.

**Verify:** the cut tag and its SHA exist on `forwardimpact/fit-harness`
before U6 references them.

## CHANGELOG

Add entries under `libraries/libharness/CHANGELOG.md` (and the launcher
CHANGELOGs if present) recording the rename and the breaking
`LIBEVAL_*` → `LIBHARNESS_*` env-var change with its one-step migration. Do not
edit historical entries (immutable).

## Execution

Route all monorepo units (U1–U6, CHANGELOG) to an engineering agent
(`staff-engineer`); they are strictly sequential — each depends on the prior
commit's renamed surfaces and every commit must stay CI-green. X1 is a
cross-repo release task for the `release-engineer`. No parts run in parallel.

**Rollout ordering (design § Cross-repo publish sequencing):**

1. Merge U1–U5 (monorepo-internal rename).
2. Publish `@forwardimpact/libharness` and the `fit-harness` launcher to npm.
3. **X1**: create `forwardimpact/fit-harness`, port the action, cut the tag.
4. Merge U6 (flip `uses:` pins + allowlist).

X1 is documented last for readability but executes at step 3, before U6. No
`uses:` line points at an unpublished tag at any step; the old
`forwardimpact/fit-eval` repo and tags stay published.

## Risks

- **Content tokens hide inside the moved tree.** `git mv` relocates files
  without renaming their contents; the per-unit blanket replace + family-scoped
  `rg` verify (see § Codemod method) is what catches help strings, golden
  fixtures, `describe(...)` titles, and test bodies. Skipping the `rg` gate
  silently leaves criterion-1 matches.
- **Enum source/consumer split.** The `sibling-composite-actions` source row
  (`.github/CLAUDE.md`) and its consumer `enum:` blocks (`CLAUDE.md` list,
  `KATA.md` list+count, `.github/CLAUDE.md` count) are coupled by the
  `enumeration-drift` invariant; they must be edited and reseeded in the
  **same** commit (U4) or that commit is red.
- **`cli-manifest.json` slips regeneration.** It is hand-maintained, not a
  `context:fix` output; only the binary build (U4 verify) proves the renamed
  entry resolves.
- **`run-eval` slug over-rename.** The codemod must not touch the `run-eval`
  doc slug or "run an eval" phrasing; only identity tokens shown inside that
  guide change. A blanket replace that ignores the keep-list breaks criterion 6.
