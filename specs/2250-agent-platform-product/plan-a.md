# Plan 2250-a: The Gemba agent-runtime platform product

Executes [design 2250-a](./design-a.md) for [spec 2250](./spec.md).

## Name resolution

The spec's deferred product-name decision is resolved: the platform is
**Gemba** (`products/gemba/`, `@forwardimpact/gemba`, command family
`gemba-*`), decided by the repository owner in-session on 2026-07-19. The name
appears in the tree only in historical specs and in `design/kata/index.md` in
its Lean-philosophy sense — no live collision. All seven npm names
(`@forwardimpact/gemba` plus the six unscoped command names) were verified
available on the npm registry on 2026-07-19; five publish as launchers —
no `gemba-selfedit` launcher is computed, since no doc or published skill
invokes selfedit via `npx`/`bunx`. Every other deferred decision
(`fit-terrain` home, `svcpathway` mis-filing) stays open per spec § Deferred
decisions.

## Approach

Land the monorepo change as three sequential parts on one branch — Part 1 the
CLI axis (product package, bins, library purification, launchers, invariant,
and the repo-wide command rename), Part 2 the actions axis (the four
composite-action moves and their publish wiring), Part 3 the product framing
(Gear refocus, JTBD, page, skill, pack staging, catalogs) — merged as one PR so
the clean break is atomic, then run Part 4, the post-merge release-and-repin
chain that makes the renamed binaries real for CI and external consumers. The
rename follows the spec-2110 codemod method: category-scoped blanket replace of
the six command-token families with a keep-list, verified by scoped `rg` gates,
with golden fixtures regenerated from actual CLI output rather than hand-edited.

Libraries used: libpack (skill-pack stage selection, Part 3); no new library
dependencies.

## Rename map and token-classification rule

| Old token | New token |
| --- | --- |
| `fit-harness` | `gemba-harness` |
| `fit-trace` | `gemba-trace` |
| `fit-benchmark` | `gemba-benchmark` |
| `fit-selfedit` | `gemba-selfedit` |
| `fit-wiki` | `gemba-wiki` |
| `fit-xmr` | `gemba-xmr` |

Each family covers the command token everywhere it appears: bin filenames and
`bin`/`exports` keys, launcher/skill/golden directory names, help and usage
strings, `mkdtemp` prefixes, comments, doc prose, and workflow `bunx`
invocations.

**Keep** every match of: library identities (`libharness`, `libwiki`, `libxmr`,
all `@forwardimpact/*` package names, `LIBHARNESS_*` env vars); every other
`fit-*` CLI (`fit-doc`, `fit-terrain`, `fit-map`, `fit-pack`, `fit-svc*`, …);
the sibling action repo names (`bootstrap`, `harness`, `wiki`, `benchmark`) and
their `uses:` pins; the `fit-skills` pack name; the `fit-gear` cask name; the
`fit-install.sh` filename and the `FIT_RELEASE_REPO`/`FIT_GEAR_RELEASE`
variable names; `fit-bootstrap` prose aliases for the bootstrap action;
`specs/**`, `wiki/**`, `benchmarks/**`, and historical CHANGELOG entries.
**Path references into kept trees also keep their names**: a token that is a
path segment of a keep-listed directory is not a command invocation — e.g.
`family: ./benchmarks/fit-wiki` in `eval-wiki.yml` names the
`benchmarks/fit-wiki/` eval family dir, which keeps its name; renaming the
reference would break it permanently. Inventory these before replacing
(`rg -n 'benchmarks/fit-'`).

Three surfaces keep the old names **deliberately until Part 4**: every `clis:`
value in `.github/workflows/*.yml` (consumed by SHA-pinned sibling actions that
install old-name binaries); the bare-PATH invocations of those installed
binaries in workflow run steps (`fit-trace cost` and `fit-harness callback` in
`kata-dispatch.yml`, `fit-wiki curate` in `curate-wiki.yml`) — they execute
whatever `clis:` installed, so they flip together with it; and **everything
under `products/kata/`** (spec SC13: no Kata diff; follow-up issue filed in
Part 4).

## Codemod method

Each part performs a blanket replace of its assigned families across its whole
surface; the per-step file tables are a verified inventory of exemplars and
non-obvious sites, not an allowlist. The completeness gate is each part's
family-scoped `rg` verify line — always **line-level** (`rg -n`, never `-l`:
a file that legitimately keeps a `clis:` line must not mask a missed rename
elsewhere in it), run with `--hidden` and **explicit** `--glob` exclusions
(`rg` also honors `.rgignore`; the gates do not rely on it). Guard against
over-replacement the same way: before replacing, list keep-listed path
references (§ Rename map) and confirm afterwards they are byte-unchanged.
Golden CLI fixtures are regenerated via `scripts/capture-cli-golden.mjs`,
never hand-edited. Recorded test fixtures that embed the old tokens (e.g.
`libraries/libharness/test/fixtures/divergence-run481.ndjson`) are
deliberately edited, following the spec-2110 precedent — the consuming tests
compare event structure and cost, not those strings.

## Parts

| Part | Scope | Executor |
| --- | --- | --- |
| [plan-a-01](./plan-a-01.md) | CLI axis: `products/gemba/` package + bins, selfedit extraction, library purification, launchers, `public-cli-set`, cli-manifest, moved bin-surface tests, repo-wide command rename (skills, agents, docs, scripts, workflows' `bunx` sites) | staff-engineer |
| [plan-a-02](./plan-a-02.md) | Actions axis: move `bootstrap`/`harness`/`benchmark`/`wiki` into `products/gemba/actions/`, repoint `publish-actions.yml`, edit `fit-install.sh`, root test excludes, `.github/CLAUDE.md` | staff-engineer |
| [plan-a-03](./plan-a-03.md) | Product framing: Gear refocus, overview page + site card, `gemba` product skill, pack staging (libpack + `publish-skills.yml`), KATA.md/CLAUDE.md framing, counts + `context:fix` | staff-engineer |
| [plan-a-04](./plan-a-04.md) | Post-merge release chain: npm cuts, gear binary release, bootstrap `FIT_GEAR_RELEASE` bump + tag, repin PR (`uses:` pins + `clis:` flips), old-launcher deprecation, Kata follow-up issue | release-engineer |

## Execution

Parts 1–3 are strictly sequential commits on one branch
(`feat/2250-gemba-platform`), merged as **one PR** — the launcher invariant
couples bins, launchers, and doc invocations, so the rename must reach `main`
atomically. Each part ends with `bun run context:fix` (the generated JTBD and
catalog blocks track the part that changed them, so `bun run check` can pass
per part), then `bun run check` and `bun run test` green. Part 4 runs
immediately after the merge, by `release-engineer`, as its own sequence (tags,
one bootstrap-bump PR, one repin PR). No parts run in parallel.

## Risks

- **The rename window.** Between the PR merge and Part 4's repin, CI installs
  old-name binaries (pinned `bootstrap` + `FIT_GEAR_RELEASE`) while the merged
  skills and agent profiles instruct `gemba-*`. Scheduled agent workflows that
  fire in the window will fail visibly on bare-name invocations. Mitigation:
  execute Part 4 the same day; if a longer gap is expected, pause the scheduled
  kata workflows for the window.
- **Skill-pack publish in the window.** The merge push fires
  `publish-skills.yml`, whose legs run the SHA-pinned old `fit-pack` gear
  binary — which parses only a single `--prefix` (last flag wins). The fit
  leg therefore **keeps `prefix: fit` until Part 4** (Step 4.3 flips it to
  `fit gemba` once the repinned bootstrap installs the multi-prefix
  `fit-pack`); flipping it in Part 3 would publish a fit-skills pack silently
  stripped of every `fit-*` skill. Consequence of the hold: between the merge
  and Part 4, the published fit-skills pack lacks the renamed runtime skills
  and the `gemba` product skill.
- **Downstream pack consumers.** The same merge publishes the kata-skills pack
  with skills instructing `gemba-*`, while downstream Kata installations run
  the old pinned bootstrap/gear chain that installs `fit-*` binaries. Fresh
  `apm` installs in the window get instructions ahead of their binaries; the
  Step 4.5 follow-up issue owns the Kata-side repoint.
- **Silent `bunx` fallback.** After the rename, a missed `bunx fit-<cli>` does
  not error — it resolves the old npm launcher from the registry and runs stale
  code. The family-scoped `rg --hidden` gates are the only guard; run them
  exactly as written, over the whole tree minus the keep-list.
- **Scanner prefixes.** `public-cli-set` (`INVOKE_RE`, skill-dir walk) and
  `skill-genericity` (npx-prefix and cross-pack-link patterns) both hardcode
  prefix lists. Missing `gemba` in any of them silently shrinks the computed
  launcher set or lint coverage; Part 1/Part 3 verify by asserting the expected
  launcher set and running the full invariant suite.
- **One tag, two pipelines.** A `gear@v*` tag triggers both the npm publish and
  the binary/cask release. Part 4's ordering (libraries → gemba → gear) exists
  so the binary build compiles bins that resolve, and the npm gear package
  ships the slimmed dependency list, from the same tag.
- **Local environments.** Developer machines keep old brew binaries until the
  gear cask updates; `bunx gemba-<cli>` from the checkout works throughout. The
  checked-out `fit-install.sh` cannot install gemba binaries until Part 4 bumps
  `FIT_GEAR_RELEASE`; this is the same window as risk 1.
