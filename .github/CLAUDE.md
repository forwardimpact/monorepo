# Workflows & Actions

Covers GitHub Actions workflows (`workflows/`) and the local composite
actions (`actions/`) they consume.

## Third-party actions

Five actions are published under `forwardimpact/` — sibling repos this
monorepo maintains, SHA-pinned with a `# v1` marker on `uses:` lines:

| Action (`@v1`) | Purpose |
|---|---|
| [fit-bootstrap](https://github.com/forwardimpact/fit-bootstrap) | FIT CI environment: Bun, cached deps/workspace, wiki checkout, `bootstrap.sh` |
| [fit-wiki](https://github.com/forwardimpact/fit-wiki) | Run a `fit-wiki` agent-memory command (push/pull/audit); mints a fresh App token first |
| [fit-benchmark](https://github.com/forwardimpact/fit-benchmark) | Coding-agent benchmarks |
| [fit-eval](https://github.com/forwardimpact/fit-eval) | Agent task execution |
| [kata-agent](https://github.com/forwardimpact/kata-agent) | Full Kata run (auth, checkout, fit-bootstrap, fit-eval, fit-wiki) |

Every workflow calls `fit-bootstrap@v1` for the environment; `kata-agent`
delegates to bootstrap/eval/wiki internally. `fit-bootstrap` only **checks
out** the wiki (given a `token`); its App token expires after an hour, so agent
runs push memory with `fit-wiki@v1` as an `always()` step (which mints a fresh
token). Change a sibling's interface — and tag it — before the consumer.

### Editing a published action

`uses:` lines pin an immutable SHA; the `# v1` marker is advisory and never
affects resolution. Edits land via an append-only patch tag on the sibling,
then a Dependabot SHA-bump PR — moving `v1` is never how a change reaches here:

```sh
gh repo clone forwardimpact/fit-eval tmp/fit-eval
gh api repos/forwardimpact/fit-eval/tags --jq '.[].name'  # next unused patch
git tag v1.0.<N> && git push origin main v1.0.<N>          # append-only
```

`.github/dependabot.yml` opens the SHA-bump PR on its weekly sweep; merge
through branch protection.

Sibling writes need rights on the sibling. The `kata-agent-team` App covers
this monorepo only (least privilege), so sibling writes fail 401/403 **by
design** — changing that boundary needs security-engineer review; for
agent-driven edits, file an Issue with the diff. This pinning policy governs
workflow `uses:` only; a sibling's internal `uses:` (e.g. `kata-agent`'s call
to `fit-bootstrap@v1`) is governed solely by the sibling repo.

### Moving a sibling's `v1` tag

Monorepo consumption stays SHA-pinned; `v1` exists only for external
consumers. A human with tag rights may move `v1` only to an existing `v1.x.y`
release commit — reachable from the sibling's `main` and a descendant of
`v1`'s current target. Never backward, untagged, or off-`main`; any other move
is a compromise indicator.

### `IS_SANDBOX` for headless agents

Bypass-permissions mode (every Agent-SDK action) is refused under `uid 0`
unless the process is marked sandboxed, and runners may be root. So `fit-eval`,
`fit-benchmark`, `fit-wiki`, and `kata-agent` set `IS_SANDBOX=1` on their
agent-spawning step (`fit-bootstrap` spawns no agent). The SDK forwards the
parent env, so setting it on the action environment suffices — kept out of
`libeval` so it stays an environment decision. Without it the agent exits 1
with no output.

## Local composite actions

Under `actions/`, referenced as `./.github/actions/<name>`:

| Action | Purpose |
|---|---|
| `audit` | `npm audit` + gitleaks secret scanning |
| `coaligned-check` | `bunx coaligned` checks (instructions, jtbd) |
| `macos-signing` | Import Developer ID certs into a temp keychain for codesign/productbuild |

**Path resolution:** `uses: ./path` inside a composite action resolves against
`$GITHUB_WORKSPACE` (the caller's checkout), not the action's own dir. So
workflows use `./.github/actions/<name>`, but a published composite action
reaching its own subdir must use the full `{owner}/{repo}/{path}@{ref}` form
(e.g. `forwardimpact/fit-bootstrap/sub-action@v1`), never `./sub`.

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
