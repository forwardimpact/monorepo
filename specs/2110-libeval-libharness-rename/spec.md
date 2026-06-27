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
| Bundled CLI: `fit-eval` | renamed to `fit-harness` — the invoked command, its package manifest entries, and every place the command name appears in prose and help text |
| Bundled CLIs: `fit-trace`, `fit-benchmark`, `fit-selfedit` | names unchanged; only their `@forwardimpact/libeval` source references change |
| Launchers | `launchers/fit-eval` → `launchers/fit-harness`; `launchers/fit-trace` and `launchers/fit-benchmark` keep names but repoint their import to `@forwardimpact/libharness` |
| `public-cli-set` invariant | `SIBLING_ACTION_CLIS` (the `fit-eval` entry) and the `canonicalBinContent` JSDoc `srcName` example in `.coaligned/invariants/public-cli-set.rules.mjs` updated so `fit-harness` is the public CLI and the launcher set stays computed-correct |
| Env-var contract | `LIBEVAL_*` → `LIBHARNESS_*` (`AGENT_PROFILE`, `SKILL`, `WORK_TRACKER`, `REDACTION_DISABLED`, `REDACTION_ENV_VARS`) in the harness, its **one** cross-library runtime reader `libxmr` (reads `LIBEVAL_SKILL`), and every doc/test that names the prefix — clean break, old names dropped (below). Note: `libwiki` is **not** a runtime reader; its `LIBEVAL_AGENT_PROFILE` occurrences are fail-closed test assertions only |
| Cross-library code consumers | `libwiki` (dep range + `src/commands/fix.js` import) and `products/gear` (dep range); `libeval`/`LIBEVAL_*` references in `libmock` (README, and `libraries/libeval/test` path comments inside `src/fixture/eval.js` — see note on the filename below), `libbridge` (`src/dispatch.js` comment), `scripts/` |
| Skills | `.claude/skills/fit-eval/` → `.claude/skills/fit-harness/` (name, frontmatter, body, Documentation links). Cross-skill identity tokens in `.claude/skills/{fit-benchmark,fit-trace}/SKILL.md` (incl. the `libraries/libeval/src/benchmark/result.js` path inside `fit-benchmark/SKILL.md`); the published `kata-setup` template's `forwardimpact/fit-eval@{{FIT_EVAL_REF}}` action ref **and** the `FIT_EVAL_REF` placeholder name itself (→ `FIT_HARNESS_REF`) across `kata-setup/SKILL.md`, `references/workflow-dispatch.md`, and `references/workflow-shift.md` |
| Env-var prose surfaces | `.claude/skills/fit-wiki/SKILL.md` `LIBEVAL_AGENT_PROFILE` doc line and the `fit-xmr --help` string in `libraries/libxmr/bin/fit-xmr.js` that names `LIBEVAL_SKILL` — both name the env prefix and must follow the `LIBHARNESS_*` rename (see note on the fit-wiki fallback claim below) |
| Other `.claude/` surfaces | `.claude/agents/references/work-trackers.md` (`LIBEVAL_WORK_TRACKER`, `fit-eval`), `.claude/rules/test-file-shape.md` (`libraries/libeval/test/…` path) |
| Repo CLAUDE.md worked examples | `libraries/CLAUDE.md` names `fit-eval` as the multi-guide-CLI worked example — an identity token outside docs/generated tables; update to `fit-harness` |
| Ref-resolution machinery | `libskill` ref-anchor / ref-lint handling of the `FIT_EVAL_REF`→`FIT_HARNESS_REF` token and its `forwardimpact/fit-eval` fixtures (`test/ref-anchors.test.js`, `test/ref-lint.test.js`) |
| Build manifest | `build/cli-manifest.json` carries a `"name": "fit-eval"` entry that drives binary compilation; it is tracked and **not** regenerated by `context:fix`, so it must be updated explicitly (see criterion 7 caveat) |
| Docs | `websites/**` references to the package and command; the `run-eval` doc slug stays, its content updates |
| Generated tables | `libraries/README.md` catalog + jobs, `websites/README.md`, any `enum:` blocks — regenerated via `context:fix`, not hand-edited |
| Workflows | `.github/workflows/{kata-dispatch,eval-guide,kata-interview}.yml` (sibling `uses:` SHA pins), `eval-kata.yml` (`LIBEVAL_WORK_TRACKER`), `sibling-edit.yml` (allowlist); `KATA.md` harness references and the `sibling-composite-actions` enum |
| `.github/CLAUDE.md` | **every** `fit-eval`/`libeval` occurrence — the sibling table, the `kata-agent` row prose, **and** the `IS_SANDBOX` section (`fit-eval`, "kept out of `libeval`") |
| Sibling action repo | `forwardimpact/fit-eval` → `forwardimpact/fit-harness` (new repo + release tags + SHA-pinned `uses:` lines), coordinated outside this checkout |
| Tests & golden fixtures | test files, `test/golden/fit-eval/` dir + golden `--help` stdout, and fixtures that pin renamed tokens — including `libcoaligned/test/enumeration-drift.test.js` (the `sibling-composite-actions` enum grammar fixture, `fit-eval`) |
| Launcher README prose | `launchers/README.md` uses `fit-eval` as its worked example of "npm name = invoked name"; update alongside the launcher rename |
| Lockfile | `bun.lock` regenerated |

Out of scope:

- **Immutable history** — `specs/**`, `CHANGELOG.md` entries, and
  already-published sibling release tags are left as written. They record what
  was true when written. New CHANGELOG entries describing this rename are in
  scope.
- **Evaluation domain vocabulary** — see the (c) row above. No
  `evaluateAssertion`, `Judge`, "run an eval", or evaluation-framework
  description text is renamed to "harness".
- **The `libmock/src/fixture/eval.js` filename** — kept. It is an
  evaluation-domain-adjacent test-helper name, not a `libeval` identity token;
  only the `libraries/libeval/test` path references *inside* it move.
- **The fit-wiki `--from` fallback doc bug** — `fit-wiki/SKILL.md` documents a
  fallback to the env profile var, but `libwiki` source offers no such
  fallback. This rename only renames the prefix it names; correcting the
  pre-existing inaccuracy is a separate fix, not folded in here.
- **Behavior** — no functional change to orchestration, tracing, redaction,
  benchmarking, or evaluation. Rename only.

## Env-var rename — clean break

`LIBEVAL_*` is a runtime contract: the harness sets it on agent environments,
`libxmr` reads `LIBEVAL_SKILL`, and external CI configurations set it directly.
The rename is a **clean break**: every read and write site moves to
`LIBHARNESS_*` and the `LIBEVAL_*` names stop being recognized. No alias, no
fallback read, no deprecation window. A configuration that still sets the old
names gets the default (as if unset). This is a breaking change for any
external CI that sets `LIBEVAL_*`; it is called out in the CHANGELOG so
consumers migrate in one step. The harness and its sole runtime reader
`libxmr` rename together in the same release, so the cross-process `SKILL`
handoff stays internally consistent.

## External blast radius and rollout ordering

The rename is a clean break, so it **is** a breaking change for external
consumers — they migrate in one step (new package name, new CLI name, new env
names, new sibling action). The CHANGELOG documents the break. What the rollout
must still get right is the monorepo's own consistency at every commit:

- The new `@forwardimpact/libharness` package and the `fit-harness` CLI must be
  published before SHA-pinned workflows and the sibling action switch to them.
- The `forwardimpact/fit-harness` sibling repo and its release tags are a
  separate, coordinated change; the monorepo's `uses:` lines flip to it only
  once it exists and is pinned.
- The launcher set and `public-cli-set` invariant must stay green at every
  commit — the invariant computes the launcher set from what docs/skills/sibling
  actions invoke, so renaming the CLI and its launcher must land together.

The detailed ordering is the plan's job; this spec asserts only that the
sequence keeps every commit's CI green and never points a `uses:` line at an
unpublished tag.

## Success Criteria

| # | Criterion | Verified by |
| --- | --- | --- |
| 1 | No `libeval`, `@forwardimpact/libeval`, `LIBEVAL_`, or `fit-eval` **identity** tokens remain outside immutable history and the evaluation-domain allowlist | `rg --hidden 'libeval\|LIBEVAL_\|fit-eval' --glob '!specs/**' --glob '!**/CHANGELOG.md'` returns only the evaluation-domain tokens the design enumerates as keep-list (criterion 6); every other match is gone. `--hidden` is load-bearing — `.github/` and `.claude/` are dotfile dirs ripgrep skips by default, yet both carry identity tokens (workflow `uses:` pins, `.github/CLAUDE.md`, the renamed skill), so the oracle is blind to them without it. The `fit-eval` alternative is load-bearing too — it is the only check that catches the (b) CLI rename, since those tokens carry no `libeval` substring |
| 2 | The library lives at `libraries/libharness` with package `@forwardimpact/libharness`, version continuity preserved | `test -d libraries/libharness`; `package.json .name == "@forwardimpact/libharness"`; `bun install` resolves with no unmet `@forwardimpact/libeval` |
| 3 | `fit-harness` is the harness CLI; `fit-trace`/`fit-benchmark`/`fit-selfedit` keep their names and resolve against the renamed package | `npx fit-harness --help` exits 0; `package.json` `bin` + `exports` carry `fit-harness` and the three unchanged CLIs |
| 4 | `public-cli-set` invariant passes with `fit-harness` as the public CLI and the launcher set computed-correct | `bun run invariants` |
| 5 | `LIBHARNESS_*` is the only env contract; the harness and `libxmr` (`LIBHARNESS_SKILL`) read and write only the new names and no `LIBEVAL_*` name is recognized anywhere | env-var tests in `libeval`→`libharness` and `libxmr` assert `LIBHARNESS_*` works and `LIBEVAL_*` is ignored |
| 6 | Evaluation domain vocabulary is unchanged | `evaluateAssertion`, `Judge`, "run an eval", and the framework description still read as evaluation; `run-eval` slug still resolves |
| 7 | Generated catalog/jobs/enum tables reflect `libharness`/`fit-harness` and are regenerated, not hand-edited | `bun run context:fix` produces no diff after the rename. Caveat: `build/cli-manifest.json` is **not** a `context:fix` output — it is hand-maintained and must be updated and verified separately (criterion 1 will not catch it either, hence its own scope row) |
| 8 | Full quality suite passes | repository check, test, format, and invariant commands all green |
| 9 | A CI-green publish/sibling-repo rollout sequence is documented | the design/plan ordering keeps `bun run invariants` green at every commit and never points a `uses:` line at an unpublished sibling tag |

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
| `LIBEVAL_*` env-var prefix | **Rename to `LIBHARNESS_*`** as a clean break — old names stop being recognized; breaking change documented in CHANGELOG | Yes (interface contract) — confirmed |
| Which "eval" tokens change | **Identity/CLI tokens → harness; evaluation-domain tokens kept** | Recommendation — confirmed |
| `specs/` + CHANGELOG history | **Left as-is (immutable)** | Recommendation — confirmed |
