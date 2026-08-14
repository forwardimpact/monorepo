# Plan 2280-a Part 02: Consumer Refs and Repo-Local Paths

Repoints every `uses:` line and every repo-local path that names an old sibling
or an old home directory. Depends on part 01. Part 04 owns `.github/CLAUDE.md`.

## Step 1: Repoint the monorepo workflow `uses:` lines

Each pin keeps its SHA and its `# vX.Y.Z` comment. Only the owner path changes.

Files modified (`.github/workflows/`):

| File | Lines | Change |
| ---- | ----- | ------ |
| `build-binaries.yml` | 75 | `forwardimpact/bootstrap@` → `forwardimpact/gemba-bootstrap@` |
| `check-context.yml` | 17, 26, 33, 42, 70 | same |
| `check-data.yml` | 17, 24 | same |
| `check-quality.yml` | 17, 24, 31, 38, 45 | same |
| `check-security.yml` | 17, 40 | same |
| `check-test.yml` | 21, 42, 55 | same |
| `curate-wiki.yml` | 27 | same |
| `outpost-determinism-probe.yml` | 20 | same |
| `package-macos.yml` | 43 | same |
| `publish-npm.yml` | 21 | same |
| `publish-skills.yml` | 135 | same |
| `website.yml` | 33 | same |
| `eval-guide.yml` | 108 | bootstrap; 165 `forwardimpact/harness@` → `forwardimpact/gemba-harness@`; 183 `forwardimpact/wiki@` → `forwardimpact/gemba-wiki@` |
| `kata-dispatch.yml` | 140 | bootstrap; 166 harness; 201 wiki |
| `eval-wiki.yml` | 20 | bootstrap; 24 `forwardimpact/benchmark@` → `forwardimpact/gemba-benchmark@` |
| `eval-jidoka.yml` | 20 | `forwardimpact/benchmark/.github/workflows/benchmark.yml@` → `forwardimpact/gemba-benchmark/.github/workflows/benchmark.yml@` |
| `eval-kata.yml` | 21 | same reusable-workflow repoint |

Verify: `rg -n 'forwardimpact/(benchmark|bootstrap|harness|wiki)[@/]'
.github/workflows/` returns nothing.

## Step 2: Repoint the Kata and Jidoka action internals

The three actions keep their own names. Only their internal references move.

Files modified:

| File | Lines | Change |
| ---- | ----- | ------ |
| `products/kata/actions/kata-agent/action.yml` | 163 | comment `forwardimpact/wiki below pushes …` → `forwardimpact/gemba-wiki below pushes …` |
| | 165 | `forwardimpact/bootstrap@a5d9098…` → `forwardimpact/gemba-bootstrap@a5d9098…` |
| | 182, 229, 241 | `forwardimpact/wiki@v1` → `forwardimpact/gemba-wiki@v1` |
| | 190 | `forwardimpact/harness@f1943c6…` → `forwardimpact/gemba-harness@f1943c6…` |
| `products/kata/actions/kata-interview/action.yml` | 129 | bootstrap SHA pin |
| | 184 | harness SHA pin |
| | 226 | `forwardimpact/wiki@v1` |
| `products/jidoka/actions/jidoka/README.md` | 21 | `[forwardimpact/bootstrap](https://github.com/forwardimpact/bootstrap)` → `[forwardimpact/gemba-bootstrap](https://github.com/forwardimpact/gemba-bootstrap)` |
| `products/jidoka/actions/jidoka/action.yml` | 11 | prose `forwardimpact/bootstrap already bootstrapped …` → `forwardimpact/gemba-bootstrap already bootstrapped …` |

Two comments in the same two Kata files name the bootstrap action by the
retired `fit-` name. Rename them in the same pass:

| File:line | Old | New |
| --------- | --- | --- |
| `products/kata/actions/kata-agent/action.yml:161` | `# fit-bootstrap handles Bun + cached deps …` | `# gemba-bootstrap handles Bun + cached deps …` |
| `products/kata/actions/kata-interview/action.yml:125` | `# fit-bootstrap installs the pre-compiled CLIs …` | `# gemba-bootstrap installs the pre-compiled CLIs …` |

Leave `kata-agent/README.md:5` and `kata-interview/README.md:13` unchanged.
Their `fit-harness` text names the `@forwardimpact/libharness` npm package, not
an action. That rename is separate work.

Verify: `rg -n 'forwardimpact/(benchmark|bootstrap|harness|wiki)\b|fit-bootstrap'
products/kata/actions/ products/jidoka/actions/` returns nothing.

## Step 3: Repoint the repo-local installer paths

Files modified:

- `justfile`
- `.github/workflows/publish-binaries.yml`
- `.github/actions/split-and-push/action.yml`
- `.claude/settings.json`
- `scripts/bootstrap.sh`

| File:line | Old | New |
| --------- | --- | --- |
| `justfile:36` | `bash products/gemba/actions/bootstrap/fit-install.sh` | `bash products/gemba/actions/gemba-bootstrap/fit-install.sh` |
| `publish-binaries.yml:139` | `sparse-checkout: products/gemba/actions/bootstrap/fit-install.sh` | `sparse-checkout: products/gemba/actions/gemba-bootstrap/fit-install.sh` |
| `publish-binaries.yml:148` | `src/products/gemba/actions/bootstrap/fit-install.sh` | `src/products/gemba/actions/gemba-bootstrap/fit-install.sh` |
| `split-and-push/action.yml:14` | docstring example `products/gemba/actions/wiki.` | `products/gemba/actions/gemba-wiki.` |
| `split-and-push/action.yml:19` | docstring example `e.g. wiki.` | `e.g. gemba-wiki.` |
| `.claude/settings.json:23` | `bash products/gemba/actions/bootstrap/fit-install.sh --soft` | `bash products/gemba/actions/gemba-bootstrap/fit-install.sh --soft` |
| `scripts/bootstrap.sh:6` | comment `fit-bootstrap action rebases before …` | `gemba-bootstrap action rebases before …` |

`.claude/settings.json` is outside the `Edit()` allow-list. Write it with the
selfedit path from a non-`main` branch:

```sh
sed 's|actions/bootstrap/fit-install.sh|actions/gemba-bootstrap/fit-install.sh|' \
  .claude/settings.json > /tmp/settings.json
bunx gemba-selfedit .claude/settings.json < /tmp/settings.json
```

Read the temporary file before the second command. `sed` must change exactly
one line.

Verify: `rg -n --hidden -g '!.git/**' -g '!specs/**'
'products/gemba/actions/(benchmark|bootstrap|harness|wiki)\b'` returns only
`.github/CLAUDE.md:64`, which part 04 owns.
