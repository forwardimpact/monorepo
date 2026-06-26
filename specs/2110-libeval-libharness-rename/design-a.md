# Design 2110-a: Rename `libeval` → `libharness`

Spec 2110 renames the harness library identity, its published CLI surface
(`fit-eval`→`fit-harness`), its `LIBEVAL_*` env contract, and its prose to
`harness`, while keeping the evaluation **domain** vocabulary and treating
`specs/`+CHANGELOG history as immutable. This design fixes WHICH change-units
exist, WHERE the identity/domain token boundary falls, and in WHAT order the
units land so the monorepo stays CI-green at every commit.

A rename has no new architecture — it is a **clean break** end to end, with no
shims, aliases, or fallbacks anywhere (the env-var rename included). The design
work is three things: (1) partition the blast radius into **atomic commits**
that each keep CI green; (2) fix the **identity-vs-domain token boundary** so
the codemod never corrupts the evaluation vocabulary; (3) sequence the
**cross-repo publish** so no `uses:` pin ever points at an unpublished tag.

## Change-units (atomic commits)

Each unit is a single commit that leaves `bun run invariants`, `bun run
context:fix`, and the test suite green. Ordering across units is § Sequencing.

| Unit | Surface | Atomicity constraint |
| --- | --- | --- |
| **U1 Library identity** | `git mv libraries/libeval libraries/libharness`; package `name`+`repository.directory`; internal import specifiers; the dep ranges + import sites in `libwiki`, `products/gear`, and the spec-named consumers `libmock`/`libbridge`/`scripts/` | dir move + every importer in one commit or module resolution breaks |
| **U2 CLI + launchers + invariant** | `bin/fit-eval.js`→`fit-harness.js`, `bin`/`exports` keys; **all three launchers** — `launchers/fit-eval`→`fit-harness` (dir) **and** the byte-exact `import "@forwardimpact/libeval/bin/*"` in the `fit-trace`+`fit-benchmark` launcher bins → `@forwardimpact/libharness`; `SIBLING_ACTION_CLIS` entry; `canonicalBinContent` JSDoc | `public-cli-set` checks launcher bins byte-exact against the package name, so every launcher flips with U1's rename in one commit |
| **U3 Env contract** | `LIBEVAL_*`→`LIBHARNESS_*` at every read site (`work-tracker.js`, `redaction.js`, `libxmr/record.js`) and write site (lead commands' `AGENT_PROFILE`/`WORK_TRACKER`, `agent-runner`'s `SKILL`) — old names dropped, no alias | harness + its sole reader `libxmr` rename in one commit so the cross-process `SKILL` handoff stays consistent |
| **U4 Prose + docs + build manifest** | `KATA.md`, `.github/CLAUDE.md` (incl. `IS_SANDBOX`), `libraries/CLAUDE.md`, skills, `websites/**`, `build/cli-manifest.json`, `FIT_EVAL_REF`→`FIT_HARNESS_REF` + `libskill`/`libcoaligned` fixtures | `cli-manifest.json` is hand-maintained — verify the binary build, not just `context:fix` |
| **U5 Generated tables** | `bun run context:fix` output (`libraries/README.md`, `websites/README.md`, `enum:` blocks) | regenerated last so it reflects U1–U4; never hand-edited |
| **X1 Sibling repo** | create `forwardimpact/fit-harness`, port `fit-eval` action, cut release tag | external repo; must precede U6 |
| **U6 Flip `uses:` pins** | `kata-dispatch`/`eval-guide`/`kata-interview` SHA pins, `sibling-edit.yml` allowlist | after X1 tag exists |

`public-cli-set` has a fourth input beyond U2's three: it also scrapes
`npx/bunx fit-*` invocations from `.claude/skills/**` and `websites/**`
markdown (renamed in U4). The invariant stays green across the U2→U4 gap
because `SIBLING_ACTION_CLIS` seeds `fit-harness` unconditionally and the rule
intersects invoked names with live `bin` keys — a stale `fit-eval` left in a
doc maps to no bin and is dropped, never producing drift.

## Token-classification gate

The rename is **not** a blanket `sed`. A codemod that rewrites every `eval`
would corrupt the evaluation domain. The gate: rename only the four identity
token-families — `libeval`, `@forwardimpact/libeval`, `LIBEVAL_*`, `fit-eval` —
and leave `evaluateAssertion`, `Judge`, "run an eval", the package
`description`/`keywords`/`jobs`, and the `run-eval` doc slug untouched.
Criterion 1's `rg --hidden 'libeval|LIBEVAL_|fit-eval'` is the completeness oracle; the
keep-list (criterion 6) is the allowlist of surviving matches.

```mermaid
graph LR
  T["'eval' token"] --> Q{identity family?}
  Q -->|libeval / @…/libeval / LIBEVAL_ / fit-eval| R["rename → harness"]
  Q -->|evaluateAssertion, Judge, run an eval, description, run-eval slug| K["keep"]
```

## Env-var rename (clean break)

No resolver, no alias, no dual-write. Every site moves to `LIBHARNESS_*` and the
old names stop being recognized; a config that still sets `LIBEVAL_*` gets the
default. Two interface points, both inside U3:

- **Reads** — `work-tracker.js` (`WORK_TRACKER`), `redaction.js`
  (`REDACTION_DISABLED`, `REDACTION_ENV_VARS`), `libxmr/record.js` (`SKILL`).
- **Writes** — lead commands set `AGENT_PROFILE`/`WORK_TRACKER` and
  `agent-runner` sets `SKILL` on the **child** agent env; `SKILL` then crosses a
  process boundary into `libxmr`.

The `SKILL` handoff is the one cross-process coupling, so its writer
(`agent-runner`) and reader (`libxmr/record.js`) must rename in the **same
commit** (U3) — that is the only consistency constraint, and it is satisfied
because both live in this monorepo and release together. Because there is no
fallback, no shared helper is needed; each site is a direct token rename.

```mermaid
sequenceDiagram
  participant H as Harness (libharness)
  participant A as Agent child env
  participant X as libxmr record
  H->>A: set LIBHARNESS_SKILL
  A->>X: env
  X->>X: read LIBHARNESS_SKILL
```

This is a breaking change for external CI that sets `LIBEVAL_*`; the CHANGELOG
documents the one-step migration.

## Cross-repo publish sequencing

```mermaid
graph LR
  P1["U1–U5 merge<br/>(monorepo internal rename)"] --> P2["publish @forwardimpact/libharness<br/>+ fit-harness launcher to npm"]
  P2 --> P3["X1: create forwardimpact/fit-harness<br/>port action, cut tag"]
  P3 --> P4["U6: flip uses: SHA pins"]
```

`@forwardimpact/libharness` and the `fit-harness` launcher must be on npm
before the sibling action (which `npx`-invokes `fit-harness`) is cut, and the
sibling tag must exist before any monorepo `uses:` points at it. The old
`forwardimpact/fit-eval` repo and its tags stay published (immutable history)
until consumers migrate; this design does not delete them.

## Key Decisions

| Decision | Choice | Rejected alternative |
| --- | --- | --- |
| Rename mechanism | Category-scoped codemod gated by the four identity families | Blanket `sed s/eval/harness/` — corrupts evaluation domain (spec (c)) |
| Clean break, no compat | Clean break everywhere incl. the env contract — old package name, CLI name, and `LIBEVAL_*` names all dropped, no alias/shim/fallback | Any compat layer (package re-export, env alias) — adds code to delete later; npm + CHANGELOG handle the one-step migration |
| Env-var rename | Direct token rename at each read/write site; `SKILL` writer+reader in one commit | Shared resolver / dual-write — pure compat machinery, forbidden under clean break |
| CLI atomicity | bin + launcher + invariant in one commit (U2) | Separate commits — `public-cli-set` red between them |
| Sibling repo | New `forwardimpact/fit-harness`; old repo not deleted (external, immutable) | Rename-in-place — breaks every existing SHA pin with no clean cutover |
| History | `specs/`+CHANGELOG immutable (spec) | Rewrite — large diff, no value, self-referential count churn |

## Verification mapping

| Criterion | Where satisfied |
| --- | --- |
| 1 identity tokens gone | U1–U6; `rg` oracle includes `fit-eval` |
| 2 library at new path | U1 |
| 3 `fit-harness` + 3 unchanged CLIs | U2 |
| 4 `public-cli-set` green | U2 (atomic) |
| 5 only `LIBHARNESS_*` recognized | U3; read+write sites incl. `libxmr/record.js`, old names dropped |
| 6 domain vocab intact | token-classification gate |
| 7 generated tables + manifest | U5 (`context:fix`) + U4 (`cli-manifest.json` manual) |
| 8 full suite green | every unit's atomicity constraint |
| 9 CI-green rollout sequence | § Cross-repo publish sequencing |

## Risks

- **`cli-manifest.json` slips `context:fix`.** Mitigation: its own change-unit
  (U4) + an explicit binary-build check, since neither criterion-1 `rg` nor
  `context:fix` catches a stale `fit-eval` entry there.
- **External pin still on `forwardimpact/fit-eval`.** Acceptable: the old repo
  is not deleted; external consumers migrate on their own clock. No monorepo pin
  points at it after U6.
- **External CI breaks on the env rename.** Accepted consequence of the clean
  break; the CHANGELOG documents the `LIBEVAL_*`→`LIBHARNESS_*` swap so the
  migration is one mechanical step.
