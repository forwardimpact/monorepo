# Plan 2280-a Part 04: Enum Source, Docs, and CLI Parity

Renames the enum source, reseeds the fences, updates the product docs, and
keeps the skill-to-CLI documentation parity. Depends on part 01. Owns every
line of `.github/CLAUDE.md`.

## Step 1: Rename the enum source table and its prose

File modified: `.github/CLAUDE.md`.

**Word budget.** The file sits at exactly 768 words against the 768-word
`subdir CLAUDE.md` cap (`libraries/libinvariant/src/instructions.js:161-163`).
It has zero headroom. Every replacement below is one token for one token, so
the count does not move. Add no word, and split no slash-joined token into
separate words.

The § Third-party actions table is the `sibling-composite-actions` source
(`.jidoka/invariants/enumeration-drift.topics.yml:27-32`). The probe derives
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

Update the prose in the same file. Every bare action name changes, including
the ones no sweep can reach:

| Line | Old | New |
| ---- | --- | --- |
| 23 | `` Every workflow calls `bootstrap@v1` `` | `` `gemba-bootstrap@v1` `` |
| 24 | `` delegates to bootstrap/harness/wiki internally `` | `` gemba-bootstrap/gemba-harness/gemba-wiki internally `` (stays one token) |
| 24-25 | `` `bootstrap` only **checks out** the wiki `` | `` `gemba-bootstrap` only **checks out** the wiki `` |
| 26 | `` push memory with `wiki@v1` `` | `` `gemba-wiki@v1` `` |
| 43 | `` `kata-agent`'s call to `bootstrap@v1` `` | `` `gemba-bootstrap@v1` `` |
| 57-58 | `` `harness`, `benchmark`, `wiki`, and `kata-agent` set `IS_SANDBOX=1` `` and `` (`bootstrap` spawns no agent) `` | the four `gemba-*` names; `kata-agent` unchanged |
| 64 | `products/gemba/actions/bootstrap/fit-install.sh` | `products/gemba/actions/gemba-bootstrap/fit-install.sh` |
| 66 | `` It sits beside the `bootstrap` action `` | `` beside the `gemba-bootstrap` action `` |
| 98 | `forwardimpact/bootstrap/sub-action@v1` | `forwardimpact/gemba-bootstrap/sub-action@v1` |

The installer file name stays `fit-install.sh`.

Verify: `rg -n --hidden '\b(bootstrap|harness|wiki|benchmark)\b'
.github/CLAUDE.md` returns no bare action name, and the word count still reads
768:

```sh
node -e 'const t=require("fs").readFileSync(".github/CLAUDE.md","utf8");
  console.log((t.match(/\S+/g)||[]).length)'
```

## Step 2: Reseed the enum fences

Files modified: `CLAUDE.md`, `KATA.md`.

Print the canonical identifier set, then hand-edit each fence body to match it.

```sh
bunx jidoka invariants --seed enumeration-drift
```

`--seed` renders text to stdout and writes no file
(`libraries/libinvariant/src/enum-drift.js:215`).
design-a.md:71 frames this as "reseed with the invariant
tooling" against a rejected "hand-edit each fence". The tooling has no write
mode, and each consumer fence carries its own prose form, so the seed output is
a reference set and the edit is by hand. This is a deliberate, recorded
divergence from the design's wording, not from its intent: the invariant still
owns the canonical set and `bun run invariants` still gates the result.

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

The line-95 replacement makes that list item 89 characters. `.rumdl.toml` sets
`[MD013] line-length = 80, reflow = true`, so run `bunx rumdl fmt .` after the
edit and let it reflow. Do not hand-wrap it.

Verify: `bunx rumdl check .` passes, and `rg -n 'Gemba — |forwardimpact/\{'
CLAUDE.md` shows `gemba-skills` in both lines.

## Step 4: Update the Gemba skills, product docs, and CLI parity

Files modified:

- `.claude/skills/gemba/SKILL.md`
- `.claude/skills/gemba-benchmark/SKILL.md`
- `websites/fit/gemba/index.md`
- `websites/fit/gear/index.md`
- `websites/fit/docs/libraries/prove-changes/run-benchmark/ci-workflow/index.md`
- `libraries/libharness/src/commands/benchmark-definition.js`
- `products/gemba/test/golden/gemba-benchmark/help.stdout.txt`

`.claude/skills/gemba-benchmark/SKILL.md` is at 189 of 192 lines and 1276 of
1280 words (L5 caps, `instructions.js:218-219`). Its edits below are all
in-place replacements. Add no line and no word to it.

| File:line | Change |
| --------- | ------ |
| `gemba/SKILL.md:23,33,36,38` | The four action names become `forwardimpact/gemba-bootstrap`, `forwardimpact/gemba-harness`, `forwardimpact/gemba-wiki`, `forwardimpact/gemba-benchmark`. |
| `gemba/SKILL.md` § When to Use | Add one bullet under **Stand up an agent team**: install the pack with `apm install forwardimpact/gemba-skills`. |
| `gemba-benchmark/SKILL.md:127,132` | `forwardimpact/benchmark@v1` → `forwardimpact/gemba-benchmark@v1`. |
| `gemba-benchmark/SKILL.md:198` | Documentation entry text: `Run benchmarks in CI with the forwardimpact/gemba-benchmark action.` |
| `websites/fit/gemba/index.md:61-64` | The actions table's four link texts and URLs take the `gemba-*` names. |
| `websites/fit/gemba/index.md:95` | `` The bring-up layer is the `bootstrap` action `` → `` the `gemba-bootstrap` action ``. |
| `websites/fit/gemba/index.md:98` | `- uses: forwardimpact/gemba-bootstrap@v1`. |
| `websites/fit/gemba/index.md:119` | `` The bootstrap action also runs that script in CI `` → `` The gemba-bootstrap action … ``. |
| `websites/fit/gemba/index.md` § Getting Started | Add a pack install block above the CI block: `apm install forwardimpact/gemba-skills`, with one sentence saying it installs the six platform skills. |
| `websites/fit/gear/index.md:29-30` | `Every library ships a matching skill in the `forwardimpact/fit-skills` pack` becomes true again: say the retrieval and evaluation libraries ship matching skills in the `forwardimpact/fit-skills` pack, and the runtime libraries (`libharness`, `libwiki`, `libxmr`) ship theirs in `forwardimpact/gemba-skills`. |
| `ci-workflow/index.md:3,8,40,119,169` | `forwardimpact/benchmark` → `forwardimpact/gemba-benchmark`. |
| `ci-workflow/index.md:186` | `forwardimpact/gemba-benchmark/.github/workflows/benchmark.yml@v1`. |
| `benchmark-definition.js:177` | Description string: `"Run benchmarks in CI with the forwardimpact/gemba-benchmark action."` |

Do not touch `ci-workflow/index.md:167` (`./benchmarks/fit-skills`). It is a
benchmark family fixture path the spec excludes.

The skill § Documentation list and the CLI `documentation` array must stay
identical in order, titles, and URLs (`products/CLAUDE.md:75-82`). Only the
shared description text changes here.

## Step 5: Recapture the benchmark golden output

File modified: `products/gemba/test/golden/gemba-benchmark/help.stdout.txt`.

The golden snapshot is generated, so regenerate it rather than hand-editing:

```sh
cd products/gemba && bun run --cwd ../.. capture-cli-golden -- --bin gemba-benchmark
```

If the capture path cannot run in the sandbox, edit line 31 to match the new
`benchmark-definition.js:177` string exactly, then say so in the commit
message. `libraries/libcli/src/help.js:103` emits descriptions unwrapped, so
the single-line edit is byte-equivalent to a capture.

Verify: `bun test products/gemba/test/golden.test.js` passes.

## Step 6: Run the whole-change verification

No files change in this step. Run it after parts 01 to 04 are complete. The
spec defines three sweeps (criteria 3, 4, 6). The three below them close the
gaps those regexes cannot reach.

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
rg -n --hidden -g '!.git/**' -g '!specs/**' 'fit gemba|prefix: fit gemba'
bun run check
bun run test
```

Verify: sweeps one to four and sweep six return nothing. Sweep five returns
only the three sanctioned exclusions: the `specs/1580-fit-bootstrap-…` link in
`products/gemba/actions/gemba-bootstrap/README.md`, the grammar fixture strings
in `libraries/libinvariant/test/enumeration-drift-grammar.test.js`, and the
`./benchmarks/fit-wiki` family path in `.github/workflows/eval-wiki.yml`. Both
commands pass.
