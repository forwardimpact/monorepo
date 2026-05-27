# Plan 0730 — Dependabot ↔ `.github/actions/` directory sync

## Approach

Replace the five hand-maintained `directories:` entries in
`.github/dependabot.yml` with a single `/.github/actions/*` glob (lever A from
the design), and add `scripts/check-dependabot.mjs` as the verification runtime
that asserts the coverage invariant on every PR. The script is wired into both
the local `bun run context` chain and a dedicated job in
`.github/workflows/check-security.yml`, so the merge gate fails when filesystem
and scan set diverge.

## Libraries used

`yaml` (parse).

## Steps

### Step 1 — Add `yaml` to root devDependencies

Intent: declare the YAML parser explicitly at the root workspace so the script
imports an owned dependency. (Six workspace packages already declare
`yaml@^2.8.3` directly; the pin matches.)

| Action | File           |
| ------ | -------------- |
| modify | `package.json` |
| modify | `bun.lock`     |

Edit `devDependencies` from:

```json
"devDependencies": {
  "@biomejs/biome": "2.4.14",
  "@playwright/test": "^1.59.1",
  "acorn": "^8.16.0",
  "serve": "^14.2.6"
}
```

to:

```json
"devDependencies": {
  "@biomejs/biome": "2.4.14",
  "@playwright/test": "^1.59.1",
  "acorn": "^8.16.0",
  "serve": "^14.2.6",
  "yaml": "^2.8.3"
}
```

Run `bun install` to refresh `bun.lock` (auto-generated; the modify entry
tracks the regen). Single-version resolution stays intact.

Verification: `grep '"yaml":' package.json` shows the new entry; `bun install`
exits 0; defer functional verification to Step 2.

### Step 2 — Create `scripts/check-dependabot.mjs`

Intent: assert the coverage invariant from the design end-to-end, fail loudly
on drift, exit 0 otherwise.

| Action | File                           |
| ------ | ------------------------------ |
| create | `scripts/check-dependabot.mjs` |

Behaviour, in order. Both sets are computed in **canonical full-path form**
(e.g., `/.github/actions/audit`) so all set comparisons use identical element
types.

1. **Read & parse.** Resolve repo root via
   `new URL("..", import.meta.url).pathname` (matches existing
   `check-instructions.mjs` / `check-libmock.mjs`). Read
   `.github/dependabot.yml` and `yaml.parse` it.
2. **Locate ecosystem.** Find the `updates[]` entry where
   `package-ecosystem === "github-actions"`; extract its `directories` array.
   Fail with a clear message if either is missing or empty.
3. **Classify entries.** Walk the raw `directories` array, classify each:
   - **Literal** (no `*`): keep verbatim.
   - **Glob `<prefix>/*`** (single trailing `*`, no other glob chars): mark
     for expansion.
   - **Anything else** (`**`, mid-segment `/foo*`, multiple `*`, leading
     `*`): record an `unsupported pattern: <entry>` violation. Continue
     processing — do not exit. (Accumulation: see Step 6.)
4. **Compute scan set** (canonical full paths). For every filesystem read in
   this step, convert the YAML-form path (e.g., `/.github/actions`) to a
   real path via `path.join(repoRoot, entry.replace(/^\//, ""))`:
   - Each literal entry: include verbatim in the scan set (canonical form).
   - Each glob `<prefix>/*`: read the prefix via
     `readdirSync(realPrefix, { withFileTypes: true })`. Wrap in try/catch:
     ENOENT (e.g., a typo in the prefix) → empty expansion (let Check A
     surface the resulting coverage gap rather than crashing). Other errors
     re-throw. For each direct child `<D>` that is a directory AND contains
     `action.yml` or `action.yaml`, add `<prefix>/<D>` to the scan set.
     Subdirectories without a manifest are skipped — matches Dependabot's
     effective scan: it walks the path, finds no manifest, no PR is opened.
5. **Compute filesystem set** (canonical full paths). Read
   `path.join(repoRoot, ".github/actions")`. If missing (ENOENT) or empty,
   the set is empty. Otherwise:
   `{ "/.github/actions/<D>" : <D> is a directory under .github/actions/ ∧
   (action.yml ∨ action.yaml exists inside) }`. Non-directory entries under
   `.github/actions/` are skipped silently.
6. **Invariant checks** (accumulate violations across all checks; one diff
   section printed per failed check; exit 1 at the end if any violation,
   exit 0 otherwise). Each check defends against a distinct regression:
   - **A. coverage** — `filesystem set ⊆ scan set`. Print "uncovered
     action directories". *Defends against glob-prefix breakage* (e.g.,
     someone changes `/.github/actions/*` → `/.github/workflows/*`, or
     removes the glob entirely): under those regressions the expansion
     no longer covers the action dirs and Check A fires. Tautological in
     the post-change state when the glob's prefix matches the action
     root — that is by design; the post-change state is the safe state.
   - **B. literal-entries-not-stale** — every literal entry under
     `/.github/actions/` (not the `/` root) must reference an existing
     action directory. Print "dangling literal scan entries". *Defends
     against future literal regressions* (e.g., someone re-adds a
     literal `/.github/actions/foo` without checking the dir exists).
     Glob expansions are excluded from this check by Step 4's
     construction.
   - **C. workflow root preserved** — `/` appears literally in the raw
     pre-classification `directories` array (string compare). Print
     "missing workflow root literal" on failure. *Defends against
     accidental removal of `/`* (criterion 5).
   - **D. no unsupported patterns** — the violation list from Step 3 is
     empty. Print each unsupported pattern. *Defends against authors
     reaching for richer glob shapes* (`**`, mid-segment globs) that
     diverge from Dependabot's expander.

CLI shape: no flags, no args. Shebang `#!/usr/bin/env node`. ESM imports:
`node:fs`, `node:path`, `yaml`. Invocation is `bun scripts/check-dependabot.mjs`.

Verification (run after Step 3 lands the glob; all in throw-away worktrees,
no commits):

1. **Positive baseline:** from the post-Step-3 tree, `bun
   scripts/check-dependabot.mjs` exits 0.
2. **Add/rename/delete replays** (`git worktree add
   ../tmp-730-{add,rename,delete}`): introduce
   `.github/actions/_canary/action.yml`; rename `audit/` →
   `audit-renamed/`; delete `post-run/`. The script must exit 0 in all
   three (the glob auto-tracks).
3. **Negative — Check B (dangling literal):** add literal
   `/.github/actions/_does_not_exist` to `.github/dependabot.yml`'s
   `directories` list. Script exits 1, prints "dangling literal scan
   entries".
4. **Negative — Check D (unsupported pattern):** add
   `/.github/actions/**` to the `directories` list. Script exits 1, prints
   "unsupported pattern: /.github/actions/**".
5. **Negative — Check A (coverage gap):** replace the glob with
   `/.github/actoins/*` (typo). Script exits 1, prints "uncovered action
   directories" listing all five existing action dirs.
6. **Negative — Check C (root removed):** delete the `/` entry. Script
   exits 1, prints "missing workflow root literal".

Discard worktrees after each negative case (`git worktree remove`).

### Step 3 — Replace per-directory entries with the glob

Intent: collapse the five literal action-directory entries to a single glob
plus the existing root entry.

| Action | File                     |
| ------ | ------------------------ |
| modify | `.github/dependabot.yml` |

Before:

```yaml
    directories:
      - /
      - /.github/actions/audit
      - /.github/actions/bootstrap
      - /.github/actions/kata-action-agent
      - /.github/actions/kata-action-eval
      - /.github/actions/post-run
```

After:

```yaml
    directories:
      - /
      - /.github/actions/*
```

No other field changes.

Verification: `bun scripts/check-dependabot.mjs` exits 0. Filesystem set =
{`/.github/actions/audit`, `/.github/actions/bootstrap`,
`/.github/actions/kata-action-agent`, `/.github/actions/kata-action-eval`,
`/.github/actions/post-run`}. Scan set after expansion = same five paths
(no other subdirs have `action.yml`). `/` preserved as literal.

### Step 4 — Wire into the `context` chain

Intent: include the check in the local `bun run check` flow so contributors
see drift before pushing.

| Action | File           |
| ------ | -------------- |
| modify | `package.json` |

Two edits:

- Append a new row `"context:check-dependabot": "bun
  scripts/check-dependabot.mjs"` immediately after the existing
  `context:check-jtbd` row (end of the script-row block, before the
  `context:fix` row). Existing `context:check-*` keys are in chain-invocation
  order, not alphabetical — match that.
- Append `&& bun run context:check-dependabot` to the end of the `"context"`
  script's command string.

Verification: `bun run context:check-dependabot` exits 0 standalone; `bun run
context` exits 0 end-to-end (this also exercises the chain append).

### Step 5 — Add a CI gate job to `check-security.yml`

Intent: enforce the invariant in the merge-gate workflow per the design's
component 3.

| Action | File                                   |
| ------ | -------------------------------------- |
| modify | `.github/workflows/check-security.yml` |

Add a third job `dependabot-coverage` after `secret-scanning`:

```yaml
  dependabot-coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      - uses: ./.github/actions/bootstrap
      - run: bun scripts/check-dependabot.mjs
```

`bootstrap` runs `./scripts/bootstrap.sh` → `just install` → `bun install
--frozen-lockfile`, which installs root devDeps including `yaml@2.8.3`
(verified at plan time). Steps 1 and 5 ship in the same PR, so CI runs
against a tree where the lockfile already lists `yaml`; no order-of-
operations risk. No `setup-node` step is needed: invocation is `bun`, not
`node`. Use the same checkout SHA-pin already pinned in this file.
Workflow-level `contents: read` permission already covers the new job.

Verification: the new `dependabot-coverage` job appears under the `Security`
workflow run on PR #728 and shows `success`. Spec criteria 2–4 are exercised
by the Step 2 worktree replays, not by CI; the CI gate is the structural
prevention mechanism, not the replay test.

## Risks

| Risk                                                                                                              | Mitigation in this plan                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependabot's server-side glob expander differs from the `<prefix>/*` shape the script implements in Step 2.       | The script's `action.yml`-pre-filter aligns its scan set with Dependabot's *meaningful* scan (paths Dependabot would actually open a PR against), so harmless expansion divergence is masked. Run `gh api` once after merge to confirm a PR-opening directory is reachable. |
| Action directory exists with neither `action.yml` nor `action.yaml` (incomplete commit, mid-rename half-state).   | The script silently excludes such directories from both sets — by design, mirroring Dependabot's actual behaviour. The half-state cannot trigger a CI failure; the missing manifest will.     |

## Execution

Single trusted agent (`staff-engineer`) executes Steps 1–5 sequentially in one
PR — each step depends on the previous. No decomposition (~120 lines of net
change across **five files**: `package.json`, `bun.lock`, `.github/dependabot.yml`,
`scripts/check-dependabot.mjs`, `.github/workflows/check-security.yml`). The
implementer must complete Step 2's positive-baseline, negative-path drift, and
all three add/rename/delete replays after Step 3 lands and before opening the
implementation PR; record outcomes in the PR description.

— Staff Engineer 🛠️
