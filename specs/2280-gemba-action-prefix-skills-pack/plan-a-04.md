# Plan 2280-a Part 04: Enum Source, Docs, and CLI Parity

Renames the enum source, reseeds the fences, updates the product docs, and
keeps the skill-to-CLI documentation parity. Depends on part 01. Owns every
line of `.github/CLAUDE.md`.

## Step 1: Rename the enum source table and its prose

File modified: `.github/CLAUDE.md`.

The § Third-party actions table is the `sibling-composite-actions` source
(`.jidoka/invariants/enumeration-drift.topics.yml:27-33`). The probe derives
each identifier from the **link text**, not the URL
(`libraries/libinvariant/src/enum-drift-grammar.js:129-139`), so both change.

| Old row cell | New row cell |
| ------------ | ------------ |
| `[bootstrap](https://github.com/forwardimpact/bootstrap)` | `[gemba-bootstrap](https://github.com/forwardimpact/gemba-bootstrap)` |
| `[wiki](https://github.com/forwardimpact/wiki)` | `[gemba-wiki](https://github.com/forwardimpact/gemba-wiki)` |
| `[benchmark](https://github.com/forwardimpact/benchmark)` | `[gemba-benchmark](https://github.com/forwardimpact/gemba-benchmark)` |
| `[harness](https://github.com/forwardimpact/harness)` | `[gemba-harness](https://github.com/forwardimpact/gemba-harness)` |

The `kata-agent`, `kata-interview`, and `jidoka` rows stay. The count stays
seven, so the `:count` fence body needs no edit.

Update the surrounding prose in the same file:

| Line | Old | New |
| ---- | --- | --- |
| 23 | `` Every workflow calls `bootstrap@v1` `` | `` `gemba-bootstrap@v1` `` |
| 24 | `` delegates to bootstrap/harness/wiki internally. `bootstrap` only `` | `` gemba-bootstrap/gemba-harness/gemba-wiki internally. `gemba-bootstrap` only `` |
| 26 | `` push memory with `wiki@v1` `` | `` `gemba-wiki@v1` `` |
| 43 | `` `kata-agent`'s call to `bootstrap@v1` `` | `` `gemba-bootstrap@v1` `` |
| 57-58 | `` `harness`, `benchmark`, `wiki`, and `kata-agent` set `IS_SANDBOX=1` `` and `` (`bootstrap` spawns no agent) `` | the four `gemba-*` names; `kata-agent` unchanged |
| 64 | `products/gemba/actions/bootstrap/fit-install.sh` | `products/gemba/actions/gemba-bootstrap/fit-install.sh` |
| 66 | `` It sits beside the `bootstrap` action `` | `` beside the `gemba-bootstrap` action `` |
| 98 | `forwardimpact/bootstrap/sub-action@v1` | `forwardimpact/gemba-bootstrap/sub-action@v1` |

The installer file name stays `fit-install.sh`.

Verify: `rg -n --hidden 'forwardimpact/(benchmark|bootstrap|harness|wiki)\b|products/gemba/actions/(benchmark|bootstrap|harness|wiki)\b'
.github/CLAUDE.md` returns nothing.

## Step 2: Reseed the enum fences

Files modified: `CLAUDE.md`, `KATA.md`.

Print the canonical identifier set, then hand-edit each fence body to match it.
The seed prints bare identifiers. Each consumer fence carries its own prose
form, so do not paste the seed output verbatim.

```sh
bunx jidoka invariants --seed enumeration-drift
```

`CLAUDE.md:102-104` becomes:

```markdown
  <!-- enum:sibling-composite-actions:list -->
  `gemba-benchmark`, `gemba-bootstrap`, `gemba-harness`, `gemba-wiki`, `jidoka`, `kata-agent`, `kata-interview`
  <!-- /enum -->
```

`KATA.md:51-59` keeps its per-item descriptions. Rename the four Gemba items:

```markdown
- `gemba-benchmark` — coding-agent benchmarks
- `gemba-bootstrap` — the FIT CI environment
- `gemba-harness` — agent task execution
- `gemba-wiki` — agent-memory commands with fresh App token
```

The `KATA.md:45-49` count fence stays at seven.

Verify: `bun run invariants` reports no `enumeration-drift` finding.

## Step 3: Update the Distribution Model pack list and the Gemba mapping

File modified: `CLAUDE.md`.

| Line | Old | New |
| ---- | --- | --- |
| 74 | ``- **Gemba — `fit-skills`** — The agent-runtime platform …`` | ``- **Gemba — `gemba-skills`** — The agent-runtime platform …`` |
| 95 | ``forwardimpact/{fit-skills,kata-skills,jidoka-skills}`` | ``forwardimpact/{fit-skills,gemba-skills,kata-skills,jidoka-skills}`` |

Verify: `rg -n 'Gemba — |forwardimpact/\{' CLAUDE.md` shows `gemba-skills` in
both lines.

## Step 4: Update the Gemba skills, product docs, and CLI parity

Files modified:

- `.claude/skills/gemba/SKILL.md`
- `.claude/skills/gemba-benchmark/SKILL.md`
- `websites/fit/gemba/index.md`
- `websites/fit/docs/libraries/prove-changes/run-benchmark/ci-workflow/index.md`
- `libraries/libharness/src/commands/benchmark-definition.js`
- `products/gemba/test/golden/gemba-benchmark/help.stdout.txt`

| File:line | Change |
| --------- | ------ |
| `gemba/SKILL.md:23,33,36,38` | The four action names become `forwardimpact/gemba-bootstrap`, `forwardimpact/gemba-harness`, `forwardimpact/gemba-wiki`, `forwardimpact/gemba-benchmark`. |
| `gemba/SKILL.md` § When to Use | Add one bullet under **Stand up an agent team**: install the pack with `apm install forwardimpact/gemba-skills`. |
| `gemba-benchmark/SKILL.md:127,132` | `forwardimpact/benchmark@v1` → `forwardimpact/gemba-benchmark@v1`. |
| `gemba-benchmark/SKILL.md:198` | Documentation entry text: `Run benchmarks in CI with the forwardimpact/gemba-benchmark action.` |
| `websites/fit/gemba/index.md:61-64` | The actions table's four link texts and URLs take the `gemba-*` names. |
| `websites/fit/gemba/index.md:98` | `- uses: forwardimpact/gemba-bootstrap@v1`. |
| `websites/fit/gemba/index.md:95` | `` The bring-up layer is the `bootstrap` action `` → `` the `gemba-bootstrap` action ``. |
| `websites/fit/gemba/index.md` § Getting Started | Add a pack install block above the CI block: `apm install forwardimpact/gemba-skills`, with one sentence saying it installs the six platform skills. |
| `ci-workflow/index.md:3,8,40,119,169` | `forwardimpact/benchmark` → `forwardimpact/gemba-benchmark`. |
| `ci-workflow/index.md:186` | `forwardimpact/gemba-benchmark/.github/workflows/benchmark.yml@v1`. |
| `benchmark-definition.js:177` | Description string: `"Run benchmarks in CI with the forwardimpact/gemba-benchmark action."` |
| `help.stdout.txt:31` | Same string, so the golden snapshot matches the definition. |

Do not touch `ci-workflow/index.md:167` (`./benchmarks/fit-skills`). It is a
benchmark family fixture path the spec excludes.

The skill § Documentation list and the CLI `documentation` array must stay
identical in order, titles, and URLs (`products/CLAUDE.md:76-82`). Only the
shared description text changes here.

Verify: `bun test products/gemba/test/golden.test.js` passes, and
`rg -n 'forwardimpact/benchmark' .claude/skills/ websites/ libraries/ products/gemba/test/`
returns nothing.

## Step 5: Run the whole-change verification

No files change in this step. Run it after parts 01 to 04 are complete.

```sh
rg -n --hidden -g '!.git/**' -g '!specs/**' -g '!**/CHANGELOG.md' \
  'forwardimpact/(benchmark|bootstrap|harness|wiki)\b'
rg -n --hidden -g '!.git/**' -g '!specs/**' \
  'products/gemba/actions/(benchmark|bootstrap|harness|wiki)\b'
rg -n --hidden -g '!.git/**' -g '!specs/**' 'FIT_(BOOTSTRAP|HARNESS|WIKI)_REF'
rg -n --hidden -g '!.git/**' -g '!specs/**' -g '!**/CHANGELOG.md' \
  -g '!benchmarks/**' '`(benchmark|bootstrap|harness|wiki)@v1`'
rg -n --hidden -g '!.git/**' -g '!specs/**' -g '!**/CHANGELOG.md' \
  -g '!benchmarks/**' '\bfit-(bootstrap|benchmark|wiki)\b'
bun run check
bun run test
```

Verify: the first three sweeps return nothing, the fourth sweep returns no
sibling-action reference, and both commands pass. The fifth sweep returns only
the three known exclusions: the `specs/1580-fit-bootstrap-…` link in
`products/gemba/actions/gemba-bootstrap/README.md`, the grammar fixture strings
in `libraries/libinvariant/test/enumeration-drift-grammar.test.js`, and the
`./benchmarks/fit-wiki` family path in `.github/workflows/eval-wiki.yml`.
