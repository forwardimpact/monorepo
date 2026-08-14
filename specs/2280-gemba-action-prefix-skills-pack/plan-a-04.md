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

The `kata-agent`, `kata-interview`, and `jidoka` rows keep their link cells.
The count stays seven, so the `:count` fence body needs no edit. The
`kata-agent` row's **description** cell on line 19 does change:
`Full Kata run (auth, checkout, bootstrap, harness, wiki)` becomes
`Full Kata run (auth, checkout, gemba-bootstrap, gemba-harness, gemba-wiki)`.
The probe reads the `Action (`@v1`)` column only, so this cell is free text.

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

Verify with a sweep that skips the renamed forms, then a word count:

```sh
rg -n '(^|[^-])\b(bootstrap|harness|wiki|benchmark)\b' .github/CLAUDE.md
node -e 'const t=require("fs").readFileSync(".github/CLAUDE.md","utf8");
  console.log((t.match(/\S+/g)||[]).length)'
```

The sweep must return exactly these five lines, none of which names an action:

| Line | Why it stays |
| ---- | ------------ |
| 15 | The `gemba-bootstrap` row's description says `wiki checkout` and `` `bootstrap.sh` ``. Both are the ordinary word and the script name. |
| 25 | `out** the wiki (given a `token`)` describes the memory checkout, not the action. |
| 62 | The `## Environment bootstrap` heading. |
| 64 | `is the single bootstrap path` describes the path, not the action. |
| 68 | `` `curl | bash` bootstrap `` describes the operation. |

The count must still print 768. Both results are simulated and confirmed
against the current file.

## Step 2: Reseed the enum fences

Files modified: `CLAUDE.md`, `KATA.md`.

Print the canonical identifier set, then hand-edit each fence body to match it.

```sh
bunx jidoka invariants --seed enumeration-drift
```

`--seed` renders text to stdout and writes no file
(`libraries/libinvariant/src/enum-drift.js:215`). It emits `- name` bullets,
which do not paste into either consumer fence, so use the output as the
canonical set and reconcile each fence against it. This is the documented
refresh path (`.jidoka/invariants/enumeration-drift.topics.yml:15-16`). See
plan-a.md § Approach.

`CLAUDE.md:102-104` becomes:

```markdown
  <!-- enum:sibling-composite-actions:list -->
  `gemba-benchmark`, `gemba-bootstrap`, `gemba-harness`, `gemba-wiki`, `jidoka`, `kata-agent`, `kata-interview`
  <!-- /enum -->
```

`KATA.md:23` sits outside the fence and reads
`bootstrap/harness/wiki/benchmark CI actions are the substrate every shift`.
Rename all four names there. It is one slash-joined token, so the count holds.

`KATA.md:51-59` keeps its per-item descriptions. Rename the four Gemba items,
and rename the two bare names inside the `kata-agent` item on line 56:

```markdown
- `gemba-benchmark` — coding-agent benchmarks
- `gemba-bootstrap` — the FIT CI environment
- `gemba-harness` — agent task execution
- `gemba-wiki` — agent-memory commands with fresh App token
- `kata-agent` — full Kata workflow (auth, checkout, gemba-bootstrap, eval, gemba-wiki push)
```

The `KATA.md:45-49` count fence stays at seven.

Verify: `bun run invariants` reports no `enumeration-drift` finding, and
`rg -n '(^|[^-])\b(bootstrap|harness|wiki|benchmark)\b' KATA.md CLAUDE.md`
returns no hit that names a composite action.

## Step 3: Update the Distribution Model pack list and the Gemba mapping

File modified: `CLAUDE.md`.

| Line | Old | New |
| ---- | --- | --- |
| 74 | ``- **Gemba — `fit-skills`** — The agent-runtime platform …`` | ``- **Gemba — `gemba-skills`** — The agent-runtime platform …`` |
| 95 | ``forwardimpact/{fit-skills,kata-skills,jidoka-skills}`` | ``forwardimpact/{fit-skills,gemba-skills,kata-skills,jidoka-skills}`` |

Root `CLAUDE.md` sits at exactly 896 words against its 896-word L1 cap
(`libraries/libinvariant/src/instructions.js:155-156`). Both replacements above
and the fences in step 2 are one token for one token, so the count does not
move. Add no word.

The line-95 replacement makes that list item 87 characters, over the
`[MD013] line-length = 80` limit. Do not hand-wrap it. Step 6 runs the single
scoped format pass. Confirm with `bunx jidoka instructions` afterwards that the
file is still inside its 192-line cap.

Verify: `rg -n 'Gemba — |forwardimpact/\{' CLAUDE.md` shows `gemba-skills` in
both lines, and the word count still prints 896.

## Step 4: Update the Gemba skills, product docs, and CLI parity

Files modified:

- `.claude/skills/gemba/SKILL.md`
- `.claude/skills/gemba-benchmark/SKILL.md`
- `websites/fit/gemba/index.md`
- `websites/fit/gear/index.md`
- `websites/fit/docs/libraries/prove-changes/run-benchmark/ci-workflow/index.md`
- `libraries/libharness/src/commands/benchmark-definition.js`
- `products/gemba/test/golden/gemba-benchmark/help.stdout.txt`

`.claude/skills/gemba-benchmark/SKILL.md` sits close to both L5 caps
(`instructions.js:218-219`). Its edits below are all in-place replacements.
Add no line and no word to it. Treat `bunx jidoka instructions` as the
authority on headroom. It does not count raw lines, so `wc -l` disagrees with
it.

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
| `websites/fit/gear/index.md:29-30` | The sentence `Every library ships a matching skill in the `forwardimpact/fit-skills` pack` stops being true when the runtime skills move. Replace it with: `Every library ships a matching skill. Most ship in the `forwardimpact/fit-skills` pack. The runtime platform's skills ship in `forwardimpact/gemba-skills`.` Do not enumerate libraries. The catalog is larger than the skill set and any list drifts. |
| `websites/fit/gear/index.md:9` | The front-matter subtitle names `the forwardimpact/fit-skills skill pack`. Leave the pack name. It is Gear's own pack and stays correct. |
| `websites/fit/gear/index.md:180` | The § Getting Started block installs `forwardimpact/fit-skills` alone, directly under the sentence above. Add a second line: `apm install forwardimpact/gemba-skills`, so the page does not name a pack it never installs. |
| `ci-workflow/index.md:3,8,40,119,169` | `forwardimpact/benchmark` → `forwardimpact/gemba-benchmark`. |
| `ci-workflow/index.md:186` | `forwardimpact/gemba-benchmark/.github/workflows/benchmark.yml@v1`. |
| `benchmark-definition.js:177` | Description string: `"Run benchmarks in CI with the forwardimpact/gemba-benchmark action."` |

Do not touch `ci-workflow/index.md:167` (`./benchmarks/fit-skills`). It is a
benchmark family fixture path the spec excludes.

The skill § Documentation list and the CLI `documentation` array must stay
identical in order, titles, and URLs (`products/CLAUDE.md:75-82`). Only the
shared description text changes here.

Verify: `bun test libraries/libharness/test/benchmark-parity.test.js` passes.
That suite asserts the skill-to-CLI documentation parity and is the real gate
for the description change. Then run
`rg -n '(^|[^-])\b(bootstrap|harness|wiki|benchmark)\b' .claude/skills/gemba/
.claude/skills/gemba-benchmark/ websites/fit/gemba/index.md
websites/fit/gear/index.md` and confirm no hit names a composite action.

## Step 5: Recapture the benchmark golden output

File modified: `products/gemba/test/golden/gemba-benchmark/help.stdout.txt`.

**Do not run the capture script in capture mode.** Two traps make it unsafe
here, both confirmed by running it:

1. Without `--exec`, `capture()` falls back to the bare bin name
   (`scripts/capture-cli-golden.mjs:90`). `gemba-benchmark` is not on PATH in a
   working checkout, so `spawnSync` fails, every captured stream becomes `""`,
   and the script still exits 0. It overwrites the goldens with empty files and
   reports success.
2. Even with `--exec`, the `report-empty` case reads
   `test/golden/gemba-benchmark/empty-runs`, an **empty directory**. Git cannot
   track empty directories, so the fixture is absent in any fresh checkout, and
   a capture rewrites `report-empty.stderr.txt` with an un-normalised local
   path. That is a pre-existing repository condition, not something this change
   introduces.

Edit line 31 by hand to match the new `benchmark-definition.js:177` string. This
is byte-equivalent to a correct capture: `libraries/libcli/src/help.js:103`
emits descriptions unwrapped, and `--help` output reproduces the committed
snapshot exactly (verified with
`diff <(node products/gemba/bin/gemba-benchmark.js --help) products/gemba/test/golden/gemba-benchmark/help.stdout.txt`).

Verify with that same diff, which must print nothing:

```sh
diff <(node products/gemba/bin/gemba-benchmark.js --help) \
  products/gemba/test/golden/gemba-benchmark/help.stdout.txt
```

Do **not** rely on `products/gemba/test/golden.test.js`. It pins `GOLDEN_DIR`
to `./golden/gemba-wiki` (line 17), and no suite in `bun run test` reads the
`gemba-benchmark` golden, so that test passes with a stale snapshot.

## Step 6: Run the whole-change verification

Run this step after parts 01 to 04 are complete.

Files modified: `libraries/libharness/src/claude-code-executable.js` and
`MONOREPO.md`. Part 04 owns both. No other part touches them.

**First, make the last two edits.** Two authored references sit outside every
sweep below and outside every other part's file list:

| File:line | Old | New |
| --------- | --- | --- |
| `libraries/libharness/src/claude-code-executable.js:12` | `` The bootstrap action's `fit-install.sh` installs it beside gemba-harness. `` | `` The gemba-bootstrap action's `fit-install.sh` … `` |
| `MONOREPO.md:103` | `The CI bootstrap action invokes it by path` | `The CI gemba-bootstrap action invokes it by path` |

`MONOREPO.md:103` is 79 characters today and becomes 85, over the MD013 limit.
The format pass below reflows it. Make both edits before that pass, not after.

**Then format.** This is the only step that runs a formatter. `bun run check`
reaches `format:md` (`rumdl fmt --check .`) third in its chain, and edits
across parts 02, 03, and 04 push lines past 80 columns. Scope the pass to the
files this change touched, so it does not write files other parts own:

```sh
bunx rumdl fmt $(git diff --name-only --diff-filter=d origin/main -- '*.md')
bunx jidoka instructions
```

Two details in that range matter. Use two-dot `origin/main`, not three-dot
`origin/main...HEAD`: the three-dot form lists committed changes only, so the
two edits made at the top of this step are still in the working tree and never
reach the formatter, which leaves `MONOREPO.md` at 85 columns and fails
`format:md` in this same step. `--diff-filter=d` drops deleted paths, because
`rumdl fmt` exits 2 and formats nothing if any argument is missing.

The second command confirms the reflow did not push any capped instruction file
over its line budget. `.rumdl.toml` excludes `products/{gemba,kata}/actions/**`,
so the action-home READMEs are never reflowed and stay byte-faithful mirrors.

Then run the sweeps. The spec defines three (criteria 3, 4, 6). The two below
them close gaps those regexes cannot reach. Each `(^|[^-])` guard stops `\b`
from matching inside a renamed `gemba-*` form.

```sh
rg -n --hidden -g '!.git/**' -g '!specs/**' -g '!**/CHANGELOG.md' \
  'forwardimpact/(benchmark|bootstrap|harness|wiki)\b'
rg -n --hidden -g '!.git/**' -g '!specs/**' \
  'products/gemba/actions/(benchmark|bootstrap|harness|wiki)\b'
rg -n --hidden -g '!.git/**' -g '!specs/**' 'FIT_(BOOTSTRAP|HARNESS|WIKI)_REF'
rg -n --hidden -g '!.git/**' -g '!specs/**' -g '!**/CHANGELOG.md' \
  '`(benchmark|bootstrap|harness|wiki)@v1`'
rg -n --hidden -g '!.git/**' -g '!specs/**' -g '!**/CHANGELOG.md' \
  '\bfit-(bootstrap|benchmark|wiki)\b'
bun run check
bun run test
```

`.rgignore` already excludes `benchmarks/` repo-wide, so no sweep needs a
`benchmarks` glob. It also hides `data/` and `JIDOKA.md`. Neither carries an
old-name reference today, but a sweep run with `--no-ignore` is the way to
confirm that if the tree changes.

Verify: sweeps one to four return nothing. Sweep five returns six lines across
three sanctioned sources: the `specs/1580-fit-bootstrap-…` link in
`products/gemba/actions/gemba-bootstrap/README.md` (one line), the grammar
fixture strings in
`libraries/libinvariant/test/enumeration-drift-grammar.test.js` (four lines,
150, 152, 203, and 219), and the `./benchmarks/fit-wiki` family path in
`.github/workflows/eval-wiki.yml` (one line). The alternation deliberately
omits `fit-harness`: the two hits in `products/kata/actions/*/README.md` name
the `@forwardimpact/libharness` npm package, not an action. Both commands pass.
