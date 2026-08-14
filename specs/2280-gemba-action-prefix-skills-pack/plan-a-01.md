# Plan 2280-a Part 01: Action Homes and Publish Matrix

Renames the four Gemba action homes, repoints their internal references, and
repoints the publish matrix. Runs after [part 05 step 1](plan-a-05.md). Every
later part assumes the new paths.

## Step 1: Rename the four home directories

Move each home with `git mv`, so git records a rename and the split lineage
change stays reviewable.

Files created / modified / deleted: four directory renames.

```sh
cd products/gemba/actions
git mv benchmark gemba-benchmark
git mv bootstrap gemba-bootstrap
git mv harness  gemba-harness
git mv wiki     gemba-wiki
```

The installer file name inside the bootstrap home stays `fit-install.sh`.

Verify: `ls products/gemba/actions/` lists exactly `gemba-benchmark`,
`gemba-bootstrap`, `gemba-harness`, `gemba-wiki`.

## Step 2: Repoint the benchmark home's own references

Files modified:

- `products/gemba/actions/gemba-benchmark/README.md`
- `products/gemba/actions/gemba-benchmark/action.yml`
- `products/gemba/actions/gemba-benchmark/.github/workflows/benchmark.yml`

| File:line | Old | New |
| --------- | --- | --- |
| `README.md:10` | `uses: forwardimpact/benchmark@v1` | `uses: forwardimpact/gemba-benchmark@v1` |
| `README.md:86` | `uses: forwardimpact/benchmark/.github/workflows/benchmark.yml@v1` | `uses: forwardimpact/gemba-benchmark/.github/workflows/benchmark.yml@v1` |
| `action.yml:162` | comment `forwardimpact/bootstrap installs gemba-benchmark …` | `forwardimpact/gemba-bootstrap installs gemba-benchmark …` |
| `.github/workflows/benchmark.yml:118` | `forwardimpact/bootstrap@71bd75533e5bc5f3046004839ab1b1c36261b033 # v1.0.17` | `forwardimpact/gemba-bootstrap@71bd75533e5bc5f3046004839ab1b1c36261b033 # v1.0.17` |
| `.github/workflows/benchmark.yml:124` | `forwardimpact/benchmark@v1.0.8` | `forwardimpact/gemba-benchmark@v1.0.8` |
| `.github/workflows/benchmark.yml:151` | comment `it from forwardimpact/bootstrap, but bootstrap needs a repo checkout` | `it from forwardimpact/gemba-bootstrap, but gemba-bootstrap needs a repo checkout` |
| `.github/workflows/benchmark.yml:162` | `forwardimpact/benchmark@v1.0.8` | `forwardimpact/gemba-benchmark@v1.0.8` |

Line 151 carries the name twice. Change both occurrences. Every SHA and tag
keeps its value.

Verify: run the sweep below and confirm no hit names a composite action. It
returns roughly 19 lines, nearly all legitimate: input defaults
(`benchmark-runs`, `benchmark-merge`, `benchmark-results`), the artifact
pattern `benchmark-shard-*`, the `benchmark:` job key, and the
`- name: Run benchmark` step title. Those are the action's own published
interface. Renaming them would be a breaking change and is out of scope.

```sh
rg -n --hidden '(^|[^-])\b(benchmark|bootstrap)\b' \
  products/gemba/actions/gemba-benchmark/
```

`--hidden` is required. Without it ripgrep skips the home's own
`.github/workflows/` directory, which is exactly what this step edits.

## Step 3: Repoint the bootstrap, harness, and wiki homes

Files modified:

- `products/gemba/actions/gemba-bootstrap/README.md`
- `products/gemba/actions/gemba-bootstrap/action.yml`
- `products/gemba/actions/gemba-harness/README.md`
- `products/gemba/actions/gemba-harness/action.yml`
- `products/gemba/actions/gemba-wiki/README.md`
- `products/gemba/actions/gemba-wiki/action.yml`

| File:line | Old | New |
| --------- | --- | --- |
| `gemba-bootstrap/README.md:9` | `` `bootstrap` action and every FIT sibling action `` | `` `gemba-bootstrap` action and every FIT sibling action `` |
| `gemba-bootstrap/README.md:16` | `uses: forwardimpact/bootstrap@v1` | `uses: forwardimpact/gemba-bootstrap@v1` |
| `gemba-bootstrap/README.md:64` | `` [`forwardimpact/wiki@v1`](https://github.com/forwardimpact/wiki) `` | `` [`forwardimpact/gemba-wiki@v1`](https://github.com/forwardimpact/gemba-wiki) `` |
| `gemba-bootstrap/README.md:124` | same link form as line 64 | same replacement |
| `gemba-bootstrap/action.yml:8,16` | prose `forwardimpact/wiki@v1` | `forwardimpact/gemba-wiki@v1` |
| `gemba-harness/README.md:11,78,100` | `uses: forwardimpact/harness@v1` | `uses: forwardimpact/gemba-harness@v1` |
| `gemba-harness/action.yml:166` | comment `forwardimpact/bootstrap installs them …` | `forwardimpact/gemba-bootstrap installs them …` |
| `gemba-wiki/README.md:14` | prose `` `forwardimpact/bootstrap@v1` `` | `` `forwardimpact/gemba-bootstrap@v1` `` |
| `gemba-wiki/README.md:19,29` | `uses: forwardimpact/wiki@v1` | `uses: forwardimpact/gemba-wiki@v1` |
| `gemba-wiki/action.yml:7` | prose `forwardimpact/bootstrap@v1 with clis: gemba-wiki` | `forwardimpact/gemba-bootstrap@v1 with clis: gemba-wiki` |
| `gemba-wiki/action.yml:71` | comment `forwardimpact/bootstrap installs it …` | `forwardimpact/gemba-bootstrap installs it …` |

Rename the code span only. Do not reword the surrounding prose. `.rumdl.toml`
excludes `products/gemba/actions/**`, so a longer line is not reflowed and the
mirror stays byte-faithful.

Verify: `rg -n --hidden 'forwardimpact/(benchmark|bootstrap|harness|wiki)\b'
products/gemba/actions/` returns nothing.

## Step 4: Retire the superseded action names inside the homes

Nine comments name the actions by a superseded name. Four use the `fit-` names
that spec 2140 retired. Five use the bare names this spec retires. They sit
inside the homes this part renames, so they move now. None of the sweeps in
part 04 step 6 can reach them, so the table below is the only census. Work
every row.

Files modified:

- `products/gemba/actions/gemba-bootstrap/fit-install.sh`
- `products/gemba/actions/gemba-wiki/action.yml`
- `products/gemba/actions/gemba-benchmark/action.yml`
- `products/gemba/actions/gemba-benchmark/.github/workflows/benchmark.yml`

| File:line | Old | New |
| --------- | --- | --- |
| `gemba-benchmark/action.yml:107` | `# this action carries no duplicate pin. bootstrap usually provides apm` | `… gemba-bootstrap usually provides apm` |
| `gemba-benchmark/.github/workflows/benchmark.yml:121` | `# action has no bunx/npx fallback. It needs a bootstrap pin whose` | `… It needs a gemba-bootstrap pin whose` |
| `gemba-bootstrap/fit-install.sh:3` | `CI (fit-bootstrap), Claude …` | `CI (gemba-bootstrap), Claude …` |
| `gemba-bootstrap/fit-install.sh:31` | `The benchmark action …` | `The gemba-benchmark action …` |
| `gemba-bootstrap/fit-install.sh:48` | `fit-bootstrap consumes this …` | `gemba-bootstrap consumes this …` |
| `gemba-bootstrap/fit-install.sh:181` | `the bootstrap action re-runs `brew install` …` | `the gemba-bootstrap action re-runs …` |
| `gemba-bootstrap/fit-install.sh:318` | `the bootstrap action always runs the install step on macOS` | `the gemba-bootstrap action always runs …` |
| `gemba-wiki/action.yml:16` | `fit-bootstrap installs it with `clis: gemba-wiki`.` | `gemba-bootstrap installs it with `clis: gemba-wiki`.` |
| `gemba-wiki/action.yml:60` | `actions/checkout (in fit-bootstrap) persists …` | `actions/checkout (in gemba-bootstrap) persists …` |

Leave `gemba-bootstrap/README.md:111` unchanged. It links a
`specs/1580-fit-bootstrap-…` path, which is an immutable historical record.

Verify: `rg -n 'fit-bootstrap' products/gemba/actions/` returns only the
`README.md` specs link.

## Step 5: Repoint the action publish matrix

File modified: `.github/workflows/publish-actions.yml`.

Edit the four Gemba `paths:` entries and the four Gemba matrix rows in place.
**Do not reorder the matrix.** The Kata rows sit between the Gemba rows, and
this change moves no row.

| Line | Old | New |
| ---- | --- | --- |
| 20 | `- "products/gemba/actions/harness/**"` | `- "products/gemba/actions/gemba-harness/**"` |
| 21 | `- "products/gemba/actions/benchmark/**"` | `- "products/gemba/actions/gemba-benchmark/**"` |
| 22 | `- "products/gemba/actions/wiki/**"` | `- "products/gemba/actions/gemba-wiki/**"` |
| 23 | `- "products/gemba/actions/bootstrap/**"` | `- "products/gemba/actions/gemba-bootstrap/**"` |
| 42-43 | `prefix: products/gemba/actions/harness` / `repo: harness` | `prefix: products/gemba/actions/gemba-harness` / `repo: gemba-harness` |
| 44-45 | `… /benchmark` / `repo: benchmark` | `… /gemba-benchmark` / `repo: gemba-benchmark` |
| 46-47 | `… /wiki` / `repo: wiki` | `… /gemba-wiki` / `repo: gemba-wiki` |
| 52-53 | `… /bootstrap` / `repo: bootstrap` | `… /gemba-bootstrap` / `repo: gemba-bootstrap` |

Leave lines 48-51 (`kata-agent`, `kata-interview`) and 54-55 (`jidoka`)
untouched.

Verify:
`rg -n 'prefix: products/gemba/actions/' .github/workflows/publish-actions.yml`
lists four `gemba-*` prefixes, and `git diff --stat` shows no line moved.

## Step 6: Correct the one-time-seed comments

Files modified:

- `.github/workflows/publish-actions.yml`
- `.github/actions/split-and-push/action.yml`

| File:line | Old | New |
| --------- | --- | --- |
| `publish-actions.yml:12-13` | `The lineage was seeded once, and that force push is the only sanctioned one.` | `Each lineage is seeded once. A prefix rename re-seeds it once more. Those are the only sanctioned force pushes.` |
| `split-and-push/action.yml:14` | docstring example `products/gemba/actions/wiki.` | `products/gemba/actions/gemba-wiki.` |
| `split-and-push/action.yml:18` | docstring example `e.g. wiki.` | `e.g. gemba-wiki.` |
| `split-and-push/action.yml:32` | `the one-time seed` | `each sanctioned seed` |

The `publish-actions.yml` wording is tense-neutral on purpose. It lands at
merge, while part 05 step 3 performs the re-seed after the merge.

Verify: `rg -n 'products/gemba/actions/(benchmark|bootstrap|harness|wiki)\b'
.github/workflows/publish-actions.yml .github/actions/split-and-push/action.yml`
returns nothing, and each Gemba matrix row pairs a `gemba-*` prefix with the
matching `gemba-*` repo in its original position.
