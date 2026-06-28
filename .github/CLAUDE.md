# Workflows & Actions

Covers GitHub Actions workflows (`workflows/`) and local composite
actions (`actions/`) they consume.

## Third-party actions

<!-- enum:sibling-composite-actions:count -->Five<!-- /enum --> composite
actions are co-located in this monorepo and published to `forwardimpact/`
siblings, SHA-pinned with a `# v1` marker on `uses:` lines:

| Action (`@v1`) | Purpose |
|---|---|
| [bootstrap](https://github.com/forwardimpact/bootstrap) | FIT CI environment: Bun, cached deps/workspace, wiki checkout, `bootstrap.sh` |
| [wiki](https://github.com/forwardimpact/wiki) | Run a `fit-wiki` agent-memory command (push/pull/audit); mints a fresh App token first |
| [benchmark](https://github.com/forwardimpact/benchmark) | Coding-agent benchmarks |
| [harness](https://github.com/forwardimpact/harness) | Agent task execution |
| [kata-agent](https://github.com/forwardimpact/kata-agent) | Full Kata run (auth, checkout, bootstrap, harness, wiki) |

Every workflow calls `bootstrap@v1` for the environment; `kata-agent`
delegates to bootstrap/harness/wiki internally. `bootstrap` only **checks
out** the wiki (given a `token`); its App token expires after an hour, so agent
runs push memory with `wiki@v1` as an `always()` step. Change a sibling's
interface — and tag it — before the consumer.

### Editing a published action

Each action's **canonical source lives in this monorepo**, beside its owning
unit (or `.github/actions/` for CI glue) — edit it there. `publish-actions.yml`
mirrors each home to its sibling `main` as a non-force subtree split, so the
sibling is always a projection. An external PR is reviewed on the sibling but
**never merged there** — replay it into the home with `just action-pullback`;
the next publish republishes it.

Consumption is unchanged: a published change reaches consumers via a Dependabot
SHA-bump PR (`.github/dependabot.yml`, weekly), not by moving `v1`. Widening a
standing token scope needs security-engineer review.

This pinning policy governs workflow `uses:` only; a sibling's internal `uses:`
(e.g. `kata-agent`'s call to `bootstrap@v1`) is governed by the sibling.

### Moving a sibling's `v1` tag

Monorepo consumption stays SHA-pinned; `v1` exists only for external
consumers. A human with tag rights may move `v1` only to an existing `v1.x.y`
release commit — reachable from the sibling's `main` and a descendant of
`v1`'s current target. Never backward, untagged, or off-`main`; any other move
is a compromise indicator.

### `IS_SANDBOX` for headless agents

Bypass-permissions mode (every Agent-SDK action) is refused under `uid 0` unless
the process is marked sandboxed, and runners may be root. So `harness`,
`benchmark`, `wiki`, and `kata-agent` set `IS_SANDBOX=1` on their
agent-spawning step (`bootstrap` spawns no agent). The SDK forwards the
parent env, so setting it on the action environment suffices — kept out of
`libharness` so it stays an environment decision. Without it the agent exits 1
with no output.

## Environment bootstrap

`scripts/fit-install.sh` is the single bootstrap path — it installs the
external tools and pinned, SHA-verified `fit-*` binaries into `$HOME/.local`.
`publish-binaries.yml` publishes it on `gear@v*` with the gear CLI binaries
(`fit-wiki` included) for one-line `curl | bash` bootstrap. A missing binary
fails hard — no `bunx`/`npx` fallback.

## Local composite actions

Workflow jobs read as a sequence of `uses:` steps — **not** walls of inline
bash. Any step that is reused, exceeds a few lines, or is a self-contained unit
of logic (resolve, build, sign, notarize, smoke, publish) lives as a composite
action under `actions/` and is invoked by name. Workflows orchestrate; actions
implement — keeping critical release logic lintable and reviewable in one place.
Pass secrets as `inputs:` (composite actions cannot read `secrets.*`).

Referenced as `./.github/actions/<name>`:

| Action | Purpose |
|---|---|
| `audit` | `npm audit` + gitleaks secret scanning |
| `coaligned-check` | `coaligned` checks (instructions, jtbd, invariants) |
| `macos-signing` | Import Developer ID certs into a temp keychain |
| `notarize` | Notarize + staple a `.app`/`.pkg` via the notary API |
| `resolve-package` | npm name + workspace dir from a `<pkg>@v*` tag |
| `npm-smoke` | Pack, install, and run a package in isolation |
| `npm-launcher-smoke` | Stamp, pack, assert launcher resolution pre-publish |
| `npm-publish` | Idempotent, ownership-checked npm publish |

**Path resolution:** `uses: ./path` inside a composite action resolves against
`$GITHUB_WORKSPACE` (the caller's checkout), not the action's own dir. So
workflows use `./.github/actions/<name>`, but a published composite action
reaching its own subdir must use the full `{owner}/{repo}/{path}@{ref}` form
(e.g. `forwardimpact/bootstrap/sub-action@v1`), never `./sub`.

## macOS code signing & notarization

`publish-binaries.yml`'s `package` job signs release bundles with a Developer
ID identity and notarizes them. Signing secrets live in the **`macos-signing`
GitHub Environment, never as repo/org secrets** — only jobs declaring
`environment: macos-signing` can read them, so `kata-*` agents cannot. Signing
is gated: with no secrets, builds fall back to ad-hoc and notarize steps skip.
Setup, secrets, and threat model:
[`actions/macos-signing/README.md`](actions/macos-signing/README.md).

## Matrix workflows and trace artifacts

When a matrix runs the same action, pass `case` to avoid artifact-name
collisions (see `kata-shift.yml`):

```yaml
case: ${{ matrix.agent.name }}
```
