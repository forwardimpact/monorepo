# Spec 2110: Rename the `libeval` library to `libharness`

**Classification:** Internal. The change lands on a shared library
(`libraries/`), its launchers, CI/automation (`.github/`), sibling action
repos, and library documentation — none of which is a `products/` or
`services/` surface. It does carry external blast radius because the library
ships published CLIs; that radius is scoped and sequenced below, not waved
away.

## Problem

`libraries/libeval` is the Kata agent **harness**: it provides the
orchestration loop, the async Ask/Answer/Announce tool surface, role-based
tool surfaces, and NDJSON trace capture. Every description of its role already
calls it the harness. `KATA.md` says it outright — "using the same harness
(`libeval`)" and renders a `Harness / libeval` node in the architecture
diagram. The package name still says `eval`.

The mismatch is not cosmetic. `eval` names a different thing that the library
*also* contains — agent **evaluation** (the `Judge`, `evaluateAssertion`, "run
an eval"). Naming the whole library after one of its features hides the
orchestration role it actually plays and conflates two concepts that the team
treats as distinct. A reader who knows the harness as "the harness" cannot find
it under `libeval`, and a reader who finds `libeval` assumes the library is
*only* about evaluation.

This spec renames the library identity, its CLI/product surface, its runtime
env-var contract, and its prose to `harness`, while deliberately preserving the
evaluation **domain** vocabulary that is genuinely about evaluation.

## The three things being separated

The word "eval" appears in three distinct roles. The plan must treat them
separately; this spec fixes which bucket each token lands in.

| Role | Examples | Disposition |
| --- | --- | --- |
| **(a) Library identity** | dir `libraries/libeval`, package `@forwardimpact/libeval`, README title, `repository.directory`, internal import specifiers, workspace dependents | **Rename → `libharness` / `@forwardimpact/libharness`** |
| **(b) Published CLI / product surface** | `fit-eval` command, its launcher package, the `forwardimpact/fit-eval` sibling action repo, install names, public doc URLs that embed the package or command name | **Rename → `fit-harness` / `forwardimpact/fit-harness`** (full rename) |
| **(c) Evaluation domain concept** | `evaluateAssertion`, the `Judge`, "run an eval", "Agent evaluation framework" description, `keywords: ["eval"]`, the `prove-changes/run-eval` doc slug | **Keep** — harness and evaluation are not synonyms |

The hard cases sit on the (b)/(c) boundary and are resolved as follows:

- `fit-eval` the **command name** is identity-bound (it is the harness entry
  point that runs/supervises/facilitates/discusses agents), so it becomes
  `fit-harness`.
- The `run-eval` **doc task slug** and "run an eval" **phrasing** name the
  evaluation task, not the harness, so they stay. The guide *content* under
  that slug still updates the package and command tokens it shows
  (`@forwardimpact/libeval fit-eval …` → `@forwardimpact/libharness
  fit-harness …`).
- The package `description` and `jobs` keep their evaluation language; only the
  identity tokens inside them change if any are present.

## Scope

In scope — rename across these categories (full inventory belongs in the
design):

| Category | What changes |
| --- | --- |
| Package metadata | name, `repository.directory`; identity tokens only — evaluation `description`/`keywords`/`jobs` language preserved |
| Directory path | `libraries/libeval/` → `libraries/libharness/` |
| Bundled CLI: `fit-eval` | renamed to `fit-harness` (command, bin key, `bin/` file, exports subpath, `--help` usage strings) |
| Bundled CLIs: `fit-trace`, `fit-benchmark`, `fit-selfedit` | names unchanged; only their `@forwardimpact/libeval` source references change |
| Launchers | `launchers/fit-eval` → `launchers/fit-harness`; `launchers/fit-trace` and `launchers/fit-benchmark` keep names but repoint their import to `@forwardimpact/libharness` |
| `public-cli-set` invariant | `SIBLING_ACTION_CLIS` (the `fit-eval` entry) and the `canonicalBinContent` JSDoc `srcName` example in `.coaligned/invariants/public-cli-set.rules.mjs` updated so `fit-harness` is the public CLI and the launcher set stays computed-correct |
| Env-var contract | `LIBEVAL_*` → `LIBHARNESS_*` (`AGENT_PROFILE`, `SKILL`, `WORK_TRACKER`, `REDACTION_DISABLED`, `REDACTION_ENV_VARS`) in the harness, its **one** cross-library runtime reader `libxmr` (reads `LIBEVAL_SKILL`), and every doc/test that names the prefix — with a transition window (below). Note: `libwiki` is **not** a runtime reader; its `LIBEVAL_AGENT_PROFILE` occurrences are fail-closed test assertions only |
| Cross-library code consumers | `libwiki` (dep range + `src/commands/fix.js` import) and `products/gear` (dep range); `libeval`/`LIBEVAL_*` references in `libmock` (`src/fixture/eval.js`, README), `libbridge` (`src/dispatch.js` comment), `scripts/` |
| Skills | `.claude/skills/fit-eval/` → `.claude/skills/fit-harness/` (name, frontmatter, body, Documentation links), **plus** the cross-skill references in `.claude/skills/{fit-benchmark,fit-trace,fit-wiki}/SKILL.md` and the published `kata-setup` workflow template's `forwardimpact/fit-eval@{{FIT_EVAL_REF}}` action-ref token |
| Other `.claude/` surfaces | `.claude/agents/references/work-trackers.md` (`LIBEVAL_WORK_TRACKER`, `fit-eval`) and `.claude/rules/test-file-shape.md` (`libraries/libeval/test/…` path) |
| Ref-resolution machinery | `libskill` ref-anchor / ref-lint handling of the `FIT_EVAL_REF` token and its `forwardimpact/fit-eval` fixtures (`test/ref-anchors.test.js`, `test/ref-lint.test.js`) |
| Docs | `websites/**` references to the package and command; the `run-eval` doc slug stays, its content updates |
| Generated tables | `libraries/README.md` catalog + jobs, `websites/README.md`, any `enum:` blocks — regenerated, not hand-edited |
| Workflows | `.github/workflows/{kata-dispatch,eval-guide,kata-interview}.yml` (sibling `uses:` SHA pins), `eval-kata.yml` (`LIBEVAL_WORK_TRACKER`), `sibling-edit.yml` (allowlist), `.github/CLAUDE.md` (sibling table **and** the `kata-agent` row's prose `fit-eval` step), `KATA.md` harness references and the `sibling-composite-actions` enum |
| Sibling action repo | `forwardimpact/fit-eval` → `forwardimpact/fit-harness` (new repo + release tags + SHA-pinned `uses:` lines), coordinated outside this checkout |
| Tests & golden fixtures | test files, `test/golden/fit-eval/` dir, golden `--help` stdout, fixtures referencing the renamed tokens |
| Lockfile | `bun.lock` regenerated |

Out of scope:

- **Immutable history** — `specs/**` (718 occurrences across 112 files), `CHANGELOG.md`
  entries, and already-published sibling release tags are left as written.
  They record what was true when written. New CHANGELOG entries describing this
  rename are in scope.
- **Evaluation domain vocabulary** — see the (c) row above. No `evaluateAssertion`,
  `Judge`, "run an eval", or evaluation-framework description text is renamed to
  "harness".
- **Behavior** — no functional change to orchestration, tracing, redaction,
  benchmarking, or evaluation. Rename only.

## Env-var transition

`LIBEVAL_*` is a runtime contract: the harness sets it on agent environments,
`libxmr` reads `LIBEVAL_SKILL`, and external CI configurations set it directly.
A hard rename is a silent breaking change for any external caller that sets the
old names. Success therefore **requires** that during a transition window the
old names keep working: a configuration that sets `LIBEVAL_*` must continue to
behave identically while `LIBHARNESS_*` becomes the documented form. How that
compatibility is implemented (alias, fallback read, deprecation notice) is the
design's call. The window's removal is a follow-up, not part of this spec.

## External blast radius and sequencing

Because the full rename touches the published surface, this spec succeeds only
if the order avoids a broken intermediate state for external consumers:

- The new `@forwardimpact/libharness` package and the `fit-harness` CLI must be
  publishable before SHA-pinned workflows and the sibling action switch to
  them.
- The `forwardimpact/fit-harness` sibling repo and its release tags are a
  separate, coordinated change; the monorepo's `uses:` lines flip to it only
  once it exists and is pinned.
- The launcher set and `public-cli-set` invariant must stay green at every
  commit — the invariant computes the launcher set from what docs/skills/sibling
  actions invoke, so renaming the CLI and its launcher must land together.

The detailed ordering is the plan's job; this spec asserts only that a green,
non-breaking sequence must exist and is a success criterion.

## Success Criteria

| # | Criterion | Verified by |
| --- | --- | --- |
| 1 | No `libeval`, `@forwardimpact/libeval`, or `LIBEVAL_` **identity** tokens remain outside immutable history and the evaluation-domain allowlist | `rg 'libeval\|LIBEVAL_' --glob '!specs/**' --glob '!**/CHANGELOG.md'` returns only the evaluation-domain tokens the design enumerates as keep-list (criterion 6); every other match is gone |
| 2 | The library lives at `libraries/libharness` with package `@forwardimpact/libharness`, version continuity preserved | `test -d libraries/libharness`; `package.json .name == "@forwardimpact/libharness"`; `bun install` resolves with no unmet `@forwardimpact/libeval` |
| 3 | `fit-harness` is the harness CLI; `fit-trace`/`fit-benchmark`/`fit-selfedit` keep their names and resolve against the renamed package | `npx fit-harness --help` exits 0; `package.json` `bin` + `exports` carry `fit-harness` and the three unchanged CLIs |
| 4 | `public-cli-set` invariant passes with `fit-harness` as the public CLI and the launcher set computed-correct | `bun run invariants` |
| 5 | `LIBHARNESS_*` is the documented contract honored by the harness and by `libxmr` (`LIBHARNESS_SKILL`); a config that sets the old `LIBEVAL_*` names behaves identically during the transition window | env-var tests in `libeval`→`libharness` and `libxmr` pass for both prefixes |
| 6 | Evaluation domain vocabulary is unchanged | `evaluateAssertion`, `Judge`, "run an eval", and the framework description still read as evaluation; `run-eval` slug still resolves |
| 7 | Generated catalog/jobs/enum tables reflect `libharness`/`fit-harness` and are regenerated, not hand-edited | `bun run context:fix` produces no diff after the rename |
| 8 | Full quality suite passes | repository check, test, format, and invariant commands all green |
| 9 | A non-breaking publish/sibling-repo sequence is documented | the design/plan ordering keeps `bun run invariants` green at every commit and never points a `uses:` line at an unpublished sibling tag |

## Persona and Job

Serves **Platform Builders** (the `libraries/` catalog audience who hire the
harness/eval CLIs) and **Internal contributors** (who navigate the monorepo by
role). The rename makes the library findable by the role it plays — the harness
— without erasing the evaluation capability it also provides.

## Open decisions (resolved with the requester)

These were surfaced before writing and are recorded here so reviewers see the
basis, not a silent pick:

| Decision | Resolution | Needs human signal |
| --- | --- | --- |
| Extend rename to the `fit-eval` CLI + launcher + sibling action repo + public doc URLs? | **Yes — full rename** to `fit-harness` | Yes (external blast radius) — confirmed |
| `LIBEVAL_*` env-var prefix | **Rename to `LIBHARNESS_*`** with a transition window in which the old names keep working | Yes (interface contract) — confirmed |
| Which "eval" tokens change | **Identity/CLI tokens → harness; evaluation-domain tokens kept** | Recommendation — confirmed |
| `specs/` + CHANGELOG history | **Left as-is (immutable)** | Recommendation — confirmed |
