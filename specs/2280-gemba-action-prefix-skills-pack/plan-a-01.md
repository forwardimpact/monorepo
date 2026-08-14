# Plan 2280-a Part 01: Action Homes and Publish Matrix

Renames the four Gemba action homes, repoints their internal references, and
repoints the publish matrix. Depends on nothing. Every later part assumes the
new paths.

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
| `.github/workflows/benchmark.yml:151` | comment `it from forwardimpact/bootstrap, but …` | `it from forwardimpact/gemba-bootstrap, but …` |
| `.github/workflows/benchmark.yml:162` | `forwardimpact/benchmark@v1.0.8` | `forwardimpact/gemba-benchmark@v1.0.8` |

Every SHA and tag keeps its value. Only the owner path changes.

Verify: `rg -n 'forwardimpact/(benchmark|bootstrap)\b'
products/gemba/actions/gemba-benchmark/` returns nothing.

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

Each home stays the byte-faithful mirror of its sibling repo root. Change no
other content.

Verify: `rg -n 'forwardimpact/(benchmark|bootstrap|harness|wiki)\b'
products/gemba/actions/` returns nothing.

## Step 4: Retire the `fit-bootstrap` names inside the homes

Four comments still name the bootstrap action by the `fit-` name that spec 2140
retired. They are the third naming generation the spec's problem statement
names. They sit inside the homes this part renames, so they move now.

Files modified:

- `products/gemba/actions/gemba-bootstrap/fit-install.sh`
- `products/gemba/actions/gemba-wiki/action.yml`

| File:line | Old | New |
| --------- | --- | --- |
| `gemba-bootstrap/fit-install.sh:3` | `CI (fit-bootstrap), Claude …` | `CI (gemba-bootstrap), Claude …` |
| `gemba-bootstrap/fit-install.sh:48` | `fit-bootstrap consumes this …` | `gemba-bootstrap consumes this …` |
| `gemba-wiki/action.yml:16` | `fit-bootstrap installs it with clis: gemba-wiki.` | `gemba-bootstrap installs it with clis: gemba-wiki.` |
| `gemba-wiki/action.yml:60` | `actions/checkout (in fit-bootstrap) persists …` | `actions/checkout (in gemba-bootstrap) persists …` |

Leave `gemba-bootstrap/README.md:111` unchanged. It links a
`specs/1580-fit-bootstrap-…` path, which is an immutable historical record.

Verify: `rg -n 'fit-bootstrap' products/gemba/actions/` returns only the
`README.md` specs link.

## Step 5: Repoint the action publish matrix

File modified: `.github/workflows/publish-actions.yml`.

Rewrite the four Gemba `paths:` entries (lines 20-23) and the four Gemba matrix
rows (lines 42-47, 52-53). Leave the Kata and Jidoka entries untouched.

```yaml
    paths:
      - "products/gemba/actions/gemba-harness/**"
      - "products/gemba/actions/gemba-benchmark/**"
      - "products/gemba/actions/gemba-wiki/**"
      - "products/gemba/actions/gemba-bootstrap/**"
```

```yaml
          - prefix: products/gemba/actions/gemba-harness
            repo: gemba-harness
          - prefix: products/gemba/actions/gemba-benchmark
            repo: gemba-benchmark
          - prefix: products/gemba/actions/gemba-wiki
            repo: gemba-wiki
          - prefix: products/gemba/actions/gemba-bootstrap
            repo: gemba-bootstrap
```

Verify: `rg -n 'products/gemba/actions/(benchmark|bootstrap|harness|wiki)\b'
.github/workflows/publish-actions.yml` returns nothing, and each remaining
Gemba row pairs a `gemba-*` prefix with the matching `gemba-*` repo.
