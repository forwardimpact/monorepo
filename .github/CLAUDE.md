# Workflows & Actions

This file covers GitHub Actions workflows (`workflows/`) and local composite
actions (`actions/`) they use.

## Third-party actions

<!-- enum:sibling-composite-actions:count -->
Seven composite actions live under `products/{gemba,jidoka,kata}/actions/`,
published to `forwardimpact/` siblings, SHA-pinned (`# v1`) on `uses:` lines:
<!-- /enum -->

| Action (`@v1`) | Purpose |
|---|---|
| [gemba-bootstrap](https://github.com/forwardimpact/gemba-bootstrap) | FIT CI environment: Bun, cached deps/workspace, wiki checkout, `bootstrap.sh` |
| [gemba-wiki](https://github.com/forwardimpact/gemba-wiki) | Runs a `gemba-wiki` agent-memory command (push/pull/audit). Mints a fresh App token first |
| [gemba-benchmark](https://github.com/forwardimpact/gemba-benchmark) | Coding-agent benchmarks |
| [gemba-harness](https://github.com/forwardimpact/gemba-harness) | Runs agent tasks |
| [kata-agent](https://github.com/forwardimpact/kata-agent) | Full Kata run (auth, checkout, gemba-bootstrap, gemba-harness, gemba-wiki) |
| [kata-interview](https://github.com/forwardimpact/kata-interview) | Runs JTBD switching interviews |
| [jidoka](https://github.com/forwardimpact/jidoka) | Jidoka checks (instructions, jtbd, invariants). Stops the line on drift |

Every workflow calls `gemba-bootstrap@v1` for the environment. `kata-agent`
delegates to gemba-bootstrap/gemba-harness/gemba-wiki internally. `gemba-bootstrap` only **checks
out** the wiki (given a `token`). Its App token expires after an hour, so
agent runs push memory with `gemba-wiki@v1` as an `always()` step. Change and tag a
sibling's interface before the consumer.

### Edit a published action

Each action's **canonical source lives in this monorepo**, beside its owner
unit (or `.github/actions/` for CI glue). Edit it there.
`publish-actions.yml` mirrors each home to its sibling `main` as a non-force
subtree split, so the sibling is always a projection. Review an external PR on
the sibling. **Never merge it there.** Replay it into the home with
`just action-pullback`. The next publish republishes it.

Consumption is unchanged. A weekly Dependabot SHA-bump PR
(`.github/dependabot.yml`) carries a published change to consumers. A `v1`
move does not. A wider standing token scope needs security-engineer review.

This SHA-pin policy governs workflow `uses:` only. The sibling governs its own
internal `uses:` (e.g. `kata-agent`'s call to `gemba-bootstrap@v1`).

### Move a sibling's `v1` tag

`v1` exists only for external consumers. Monorepo consumption stays
SHA-pinned. A release cut moves `v1` to the new `v1.x.y` commit on the
sibling's `main`. It is **not** forward-only, because subtree-split re-seeds
orphan old commits. The only guard is a tagged release commit on `main`, never
off-`main`.

### `IS_SANDBOX` for headless agents

The SDK refuses bypass-permissions mode (every Agent-SDK action) under `uid 0`
unless `IS_SANDBOX` marks the process sandboxed. Runners may be root. So
`gemba-harness`, `gemba-benchmark`, `gemba-wiki`, and `kata-agent` set `IS_SANDBOX=1` on their
agent-spawn step (`gemba-bootstrap` spawns no agent). The SDK forwards the parent
env, so the action environment is enough. Keep it out of `libharness` so it
stays an environment decision. Without it the agent exits 1 with no output.

## Environment bootstrap

`products/gemba/actions/gemba-bootstrap/fit-install.sh` is the single bootstrap
path. It installs external tools and pinned, SHA-verified `fit-*`/`gemba-*`
binaries into `$HOME/.local`. It sits beside the `gemba-bootstrap` action and
travels with the subtree split. `publish-binaries.yml` publishes it on
`gear@v*` for `curl | bash` bootstrap. A blocked download falls back to
`apt`/`npm` registries.

## Local composite actions

Workflow jobs read as a sequence of `uses:` steps. Inline bash walls do
**not** belong. A composite action under `actions/` holds any reused step, any
step over a few lines, and any self-contained logic unit (resolve, build,
sign, notarize, smoke, publish). The workflow invokes it by name.
Workflows orchestrate. Actions implement. This keeps critical release logic
lintable and reviewable in one place. Pass secrets as `inputs:` (composite
actions cannot read `secrets.*`).

Reference them as `./.github/actions/<name>`:

| Action | Purpose |
|---|---|
| `audit` | `npm audit` and gitleaks secret scans |
| `macos-signing` | Import Developer ID certs into a temp keychain |
| `notarize` | Notarize and staple a `.app`/`.pkg` with the notary API |
| `resolve-package` | npm name + workspace dir from a `<pkg>@v*` tag |
| `npm-smoke` | Pack, install, and run a package in isolation |
| `npm-launcher-smoke` | Pre-publish: stamp, pack, assert the launcher resolves |
| `npm-publish` | Idempotent, ownership-checked npm publish |

**Path resolution:** `uses: ./path` inside a composite action resolves against
`$GITHUB_WORKSPACE` (the caller's checkout). It never resolves against the
action's own dir. So workflows use `./.github/actions/<name>`. A published
composite action that reaches its own subdir must use the full
`{owner}/{repo}/{path}@{ref}` form (e.g.
`forwardimpact/gemba-bootstrap/sub-action@v1`), never `./sub`.

## macOS code signing & notarization

`publish-binaries.yml`'s `package` job signs release bundles with a Developer
ID identity and notarizes them. Signing secrets live in the **`macos-signing`
GitHub Environment, never as repo/org secrets**. Only jobs with
`environment: macos-signing` can read them, so `kata-*` agents cannot. A gate
controls signing. With no secrets, builds fall back to ad-hoc and notarize
steps skip. Setup, secrets, and threat model:
[`actions/macos-signing/README.md`](actions/macos-signing/README.md).

## Matrix workflows and trace artifacts

When a matrix runs the same action, pass `case` to avoid artifact-name
collisions (see `kata-shift.yml`):

```yaml
case: ${{ matrix.agent.name }}
```
