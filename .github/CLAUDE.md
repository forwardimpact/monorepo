# Workflows & Actions

Covers GitHub Actions workflows (`workflows/`) and the local composite
actions (`actions/`) they consume.

## Third-party actions

Five composite actions are published under `forwardimpact/` and
SHA-pinned with a `# v1` marker on workflow `uses:` lines — sibling
repos this monorepo maintains, not external dependencies:

| Action | Repo | Purpose |
|---|---|---|
| `forwardimpact/fit-bootstrap@v1` | [fit-bootstrap](https://github.com/forwardimpact/fit-bootstrap) | Single source of truth for the FIT CI environment (Bun, cached deps, cached workspace, wiki checkout, `./scripts/bootstrap.sh`) |
| `forwardimpact/fit-wiki@v1` | [fit-wiki](https://github.com/forwardimpact/fit-wiki) | Run a `fit-wiki` agent-memory command (push, pull, audit), minting a fresh App token first |
| `forwardimpact/fit-benchmark@v1` | [fit-benchmark](https://github.com/forwardimpact/fit-benchmark) | Coding-agent benchmarks via `fit-benchmark` CLI |
| `forwardimpact/fit-eval@v1` | [fit-eval](https://github.com/forwardimpact/fit-eval) | Agent task execution via `fit-eval` CLI |
| `forwardimpact/kata-agent@v1` | [kata-agent](https://github.com/forwardimpact/kata-agent) | Full Kata workflow (auth, checkout, `fit-bootstrap`, `fit-eval`, `fit-wiki`) |

`kata-agent` delegates to `fit-bootstrap@v1`, `fit-eval@v1`, and
`fit-wiki@v1` internally; every workflow calls `fit-bootstrap@v1`
directly for the CI environment, and the agent workflows call
`fit-wiki@v1` to push memory back after the run. When changing any
interface, update and tag the sibling first.

`fit-bootstrap` only **checks out** the wiki (when given a `token`).
The start-of-job App token expires after one hour, so long
agent runs push with `fit-wiki@v1` as an `always()` step after the agent,
which mints a fresh token first.

### Editing a published action

Workflow `uses:` lines target an immutable SHA with a `# v1` marker.
Edits land via append-only patch tag + Dependabot SHA-bump PR — moving
`v1` is never how a change reaches this repo:

```sh
gh repo clone forwardimpact/fit-eval tmp/fit-eval
# edit, commit, tag the next unused patch (start v1.0.0):
gh api repos/forwardimpact/fit-eval/tags --jq '.[].name'
git tag v1.0.<N>            # append-only
git push origin main && git push origin v1.0.<N>
```

`.github/dependabot.yml` runs `github-actions` weekly and opens a
SHA-bump PR on the next sweep; merge through branch protection. The
`# v1` marker is advisory and never affects resolution.

Sibling pushes need rights on the sibling. The `kata-agent-team` App
installation deliberately covers this monorepo only (least privilege):
sibling writes fail 401/403 by design, not misconfiguration
([#1549](https://github.com/forwardimpact/monorepo/issues/1549) runs
240 and 255). Changing that boundary is a security decision requiring
security-engineer review. For agent-driven edits, file an Issue with
the diff.

**Scope.** This pinning policy governs workflow `uses:` references to
sibling actions; sibling-internal references (a sibling's calls inside
its own `action.yml`, including `kata-agent`'s call to
`forwardimpact/fit-bootstrap@v1`) are governed — and durably closed —
only by the sibling repos.

### Moving a sibling's `v1` tag

Monorepo consumption stays SHA-pinned regardless; `v1` exists solely
for external consumers. On any sibling, a human with tag rights may
move `v1` only to the commit of an existing `v1.x.y` release tag —
reachable from the sibling's `main`, a descendant of `v1`'s current
target, recorded in that release's notes. Never untagged, never
backward, never off-`main`. Any other `v1` move is a compromise
indicator.

### `IS_SANDBOX` for headless agents

Every published action that drives the Claude Agent SDK runs it in
**bypass-permissions** mode, which Claude Code refuses under `uid 0` unless
the process is marked sandboxed. Runners may run as root, so each such action
sets `IS_SANDBOX=1` on the agent-spawning step:

- `fit-eval` — the `Run fit-eval` step.
- `fit-benchmark` — the `Run benchmark` step.
- `fit-wiki` — the `Run fit-wiki command` step (`fit-wiki fix` is an agent run).
- `kata-agent` — the `Assess and Act` step.

(`fit-bootstrap` spawns no agent.) The SDK forwards the parent
environment, so setting it on the action's environment is sufficient —
deliberately **not** hard-coded in `libeval` so the value stays an environment
decision. Without it the agent exits 1 with no NDJSON output before its
first turn.

## Local composite actions

Live under `actions/`. Workflows reference them via the workspace path
`./.github/actions/<name>`.

| Action | Purpose |
|---|---|
| `audit` | Dependency `npm audit` + gitleaks secret scanning |
| `coaligned-check` | Run `bunx coaligned` checks (instructions, jtbd) |

The environment-bootstrap action is `forwardimpact/fit-bootstrap@v1`,
called directly by workflows; no local wrapper exists.

### Composite-action path resolution

`uses: ./path` inside a composite action's steps is resolved by GitHub
against `$GITHUB_WORKSPACE` (the caller's checkout), **not** against the
action's own directory. Two consequences:

- **Workflows** reference these local actions as
  `./.github/actions/<name>` — the path they have at the workspace root.
- **A published composite action** cannot reach into its own subdirectory
  with `./sub` (the caller does not have it). Use the full repo form
  `{owner}/{repo}/{path}@{ref}` instead — e.g.
  `forwardimpact/fit-bootstrap/sub-action@v1` references the action's
  own `sub-action/` subdirectory at the same tag.

## Matrix workflows and trace artifacts

When a matrix runs the same action, pass `case` to avoid artifact name
collisions. Example from `kata-shift.yml`:

```yaml
case: ${{ matrix.agent.name }}
```
