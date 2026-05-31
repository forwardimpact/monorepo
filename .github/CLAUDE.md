# Workflows & Actions

Covers both GitHub Actions workflows (`workflows/`) and the local composite
actions (`actions/`) they consume.

## Third-party actions

Five composite actions are published as standalone repos under
`forwardimpact/` and referenced by tag — sibling repos this monorepo
maintains, not external dependencies:

| Action | Repo | Purpose |
|---|---|---|
| `forwardimpact/fit-bootstrap@v1` | [fit-bootstrap](https://github.com/forwardimpact/fit-bootstrap) | Single source of truth for the FIT CI environment (Bun + cached deps + cached workspace + wiki checkout + `./scripts/bootstrap.sh`) |
| `forwardimpact/fit-wiki@v1` | [fit-wiki](https://github.com/forwardimpact/fit-wiki) | Run a `fit-wiki` agent-memory command (push, pull, audit), minting a fresh GitHub App token first |
| `forwardimpact/fit-benchmark@v1` | [fit-benchmark](https://github.com/forwardimpact/fit-benchmark) | Coding-agent benchmarks via `fit-benchmark` CLI |
| `forwardimpact/fit-eval@v1` | [fit-eval](https://github.com/forwardimpact/fit-eval) | Agent task execution via `fit-eval` CLI |
| `forwardimpact/kata-agent@v1` | [kata-agent](https://github.com/forwardimpact/kata-agent) | Full Kata workflow (auth + checkout + `fit-bootstrap` + `fit-eval` + `fit-wiki`) |

`kata-agent` delegates to `fit-bootstrap@v1`, `fit-eval@v1`, and
`fit-wiki@v1` internally; every workflow in this repo calls
`forwardimpact/fit-bootstrap@v1` directly for the CI environment, and
the agent workflows call `forwardimpact/fit-wiki@v1` to push memory back
after the run. When changing any interface, update and tag the sibling
first.

`fit-bootstrap` only **checks out** the wiki (when given a `token`); it no
longer pushes. The start-of-job App token expires after one hour, so a
cleanup-time push fails on long agent runs — push with `fit-wiki@v1` as an
`always()` step after the agent, which mints a fresh token first.

### Editing a published action

Clone into `tmp/` (gitignored), edit, commit, force-move the `v1` tag, push:

```sh
gh repo clone forwardimpact/fit-eval tmp/fit-eval
# edit tmp/fit-eval/action.yml
cd tmp/fit-eval
git add -A && git commit -m "fix: description"
git tag -f v1
git push origin main && git push origin v1 --force
```

`GITHUB_TOKEN` in this environment has push rights to every sibling repo
under `forwardimpact/*`; no extra auth setup is needed.

### `IS_SANDBOX` for headless agents

Every published action that drives the Claude Agent SDK runs it in
**bypass-permissions** mode (`--dangerously-skip-permissions`), which Claude
Code refuses under `uid 0` unless the process is marked sandboxed. CI runners
and agent containers may run as root, so each such action sets `IS_SANDBOX=1`
on the step that spawns the agent:

- `fit-eval` — the `Run fit-eval` step (all modes).
- `fit-benchmark` — the `Run benchmark` step (the agent-under-test).
- `fit-wiki` — the `Run fit-wiki command` step (`fit-wiki fix` is an agent run).
- `kata-agent` — the `Assess and Act` step, explicit alongside the `fit-eval@v1`
  it wraps.

(`fit-bootstrap` spawns no agent and needs nothing.) The SDK forwards the
parent process environment to the spawned Claude Code process, so setting it on
the action's environment is sufficient; this is deliberately **not** hard-coded
in `libeval` so the value stays an environment decision. Without it the agent
exits 1 with no NDJSON output before its first turn — the same failure mode any
`fit-eval`-derived command (e.g. `fit-wiki fix`) hits when run as root in an
environment that has not set the flag.

## Local composite actions

Live under `actions/`. Workflows reference them via the full workspace path
`./.github/actions/<name>`.

| Action | Purpose |
|---|---|
| `audit` | Dependency `npm audit` + gitleaks secret scanning |
| `coaligned-check` | Run `bunx coaligned` checks (instructions, jtbd) |

The environment-bootstrap action lives in
`forwardimpact/fit-bootstrap@v1` and is called directly by every
workflow that needs it; there is no local wrapper.

### Composite-action path resolution

`uses: ./path` inside a composite action's steps is resolved by GitHub
against `$GITHUB_WORKSPACE` (the caller's checkout), **not** against the
action's own directory. Two consequences:

- **Workflows** reference these local actions as
  `./.github/actions/<name>` — the path they have at the workspace root.
- **A published composite action** cannot reach into its own subdirectory
  with `./sub` (the caller does not have it). Use the full repo form
  `{owner}/{repo}/{path}@{ref}` instead — e.g. a hypothetical
  `forwardimpact/fit-bootstrap/sub-action@v1` would reference the action's
  own `sub-action/` subdirectory at the same tag.

## Matrix workflows and trace artifacts

When a workflow runs the same action across a matrix, pass `case` to avoid
artifact name collisions. Example from `kata-shift.yml`:

```yaml
case: ${{ matrix.agent.name }}
```
