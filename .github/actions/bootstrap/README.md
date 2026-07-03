# FIT Bootstrap

Opinionated FIT environment bootstrap for GitHub Actions. Sets up Bun,
restores a single environment cache (CLI tools in `~/.local` plus
`node_modules` and `generated`), installs anything missing, optionally
checks out the wiki, and runs `./scripts/bootstrap.sh`.

Single source of truth for the FIT CI environment. The monorepo's local
`bootstrap` action and every FIT sibling action (e.g. `kata-agent`) call
this one — version-pinned at `@v1` — so they never drift.

## Usage

```yaml
- uses: actions/checkout@v4
- uses: forwardimpact/bootstrap@v1
  with:
    token: ${{ steps.ci-app.outputs.token }}   # optional, enables wiki checkout
    app-slug: kata-agent-team                   # optional, sets git identity
    app-id: ${{ secrets.KATA_APP_ID }}          # optional, sets git identity
```

Cold-cache runtime is ~3 minutes; warm-cache is ~15-20 seconds.

## Prerequisites

The action **bundles its own installer** (`fit-install.sh`, the canonical
source of truth, co-located here so it travels with the subtree split) and
runs it via `$GITHUB_ACTION_PATH`, so the consumer repo needs no install
script of its own. The installer puts the
pinned external tools (`apm`, `just`, `gh`, `rg`, `gitleaks`) and any
requested `fit-*` binaries (see the `clis` input) on `PATH`.

The consumer repo must still follow FIT conventions:

- `scripts/bootstrap.sh` — invoked after the environment is ready. Receives
  `BOOTSTRAP_WORKSPACE_CACHE_HIT={true|false}` so it can skip install/codegen
  on a warm cache. Handles wiki init/pull when a `token:` is provided. The
  action rebases onto `origin/main` itself (before the cache key), so this
  script does not sync.
- `bun.lock` — its hash is part of the cache key.

## Inputs

| Input         | Required | Default    | Description                                                                              |
| ------------- | -------- | ---------- | ---------------------------------------------------------------------------------------- |
| `token`       | No       | `""`       | GitHub token with read access to the wiki. When provided, the wiki is checked out into `./wiki`. Pushing back is the caller's job — see [`forwardimpact/wiki@v1`](https://github.com/forwardimpact/wiki). |
| `app-slug`    | No       | `""`       | GitHub App slug for git identity (e.g. `kata-agent-team`).                              |
| `app-id`      | No       | `""`       | GitHub App ID for the git identity email.                                                |
| `bun-version` | No       | `"1.3.11"` | Bun version to install.                                                                  |
| `clis`        | No       | `""`       | Space-separated `fit-*` CLIs to install as pinned, SHA-verified pre-compiled binaries on `PATH` (e.g. `fit-wiki fit-harness fit-trace`). Empty installs only the external tools. |

## Caching

One **environment cache** holds both the CLI tools and the workspace, so the
critical path makes a single `actions/cache` restore:

- **Paths** — the tool paths the bundled `fit-install.sh --paths` declares
  (each tool's lib dir + bin symlink, plus any requested `fit-*` binary, which
  keeps unrelated `~/.local` tooling out of the cache), plus `node_modules`,
  `generated`, and `libraries/*/src/generated`.
- **Key** — `env-v3-<os>-<hash>`, where the hash covers everything on a
  hashFiles-visible path that changes what gets generated: `bun.lock`,
  `**/*.proto`, and the `libcodegen` sources. The action rebases the workspace
  onto `origin/main` *before* hashing, so the key reflects the tree
  `scripts/bootstrap.sh` actually runs against — a feature branch caught behind
  a release commit lands on the same key as a fresh build of main, not a stale
  snapshot.
- **Version prefix** — bump `env-vN` (v2 → v3 → …) when the cached layout or
  the bundled installer's tool versions change in a way the hash can't see (the
  installer lives in the action, off any hashFiles-visible path); v3 marks the
  move to the bundled `fit-install.sh`.

The cache is **exact-key-restore-only**: there is no `restore-keys` prefix
fallback. On an exact-key hit `cache-hit` is `'true'` and the action skips
install and codegen — `generated` and its **relative**
`libraries/*/src/generated` symlinks restore intact. (Relative links survive
`actions/cache` extraction; the old absolute ones did not, which is why
codegen used to re-run on every warm cache.) On any other key, no files are
restored, `cache-hit` is `'false'`, and `scripts/bootstrap.sh` runs
`bun install` + `just codegen` against an empty tree, resolving the lockfile
from scratch. Dropping the prefix fallback closes a cross-cycle poisoning loop
where a partial restore under a different lockfile's key survived the install
and saved back under the new key; see
[monorepo spec 1580](https://github.com/forwardimpact/monorepo/blob/main/specs/1580-fit-bootstrap-workspace-cache-integrity/spec.md)
for the rationale.

## Wiki

When `token` is provided, the wiki is checked out into `./wiki` before
`scripts/bootstrap.sh` runs, so agents can read and write agent memory
during the job. When `token` is empty, the checkout is skipped — the
action is safe to use in jobs that don't need the wiki (e.g. pure CI
checks).

Pushing the wiki back is **not** this action's job. The token minted at
job start expires after one hour, so a cleanup-time push fails on long
agent runs. Push with [`forwardimpact/wiki@v1`](https://github.com/forwardimpact/wiki)
as an `always()` step after the agent — it mints a fresh token first.
