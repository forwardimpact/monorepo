# Workflows & Actions

Covers both GitHub Actions workflows (`workflows/`) and the local composite
actions (`actions/`) they consume.

## Third-party actions

Four composite actions are published as standalone repos under
`forwardimpact/` and referenced by tag — sibling repos this monorepo
maintains, not external dependencies:

| Action | Repo | Purpose |
|---|---|---|
| `forwardimpact/fit-bootstrap@v1` | [fit-bootstrap](https://github.com/forwardimpact/fit-bootstrap) | Single source of truth for the FIT CI environment (Bun + cached deps + cached workspace + wiki sync + `./scripts/bootstrap.sh`) |
| `forwardimpact/fit-benchmark@v1` | [fit-benchmark](https://github.com/forwardimpact/fit-benchmark) | Coding-agent benchmarks via `fit-benchmark` CLI |
| `forwardimpact/fit-eval@v1` | [fit-eval](https://github.com/forwardimpact/fit-eval) | Agent task execution via `fit-eval` CLI |
| `forwardimpact/kata-agent@v1` | [kata-agent](https://github.com/forwardimpact/kata-agent) | Full Kata workflow (auth + checkout + `fit-bootstrap` + `fit-eval`) |

`kata-agent` delegates to `fit-bootstrap@v1` and `fit-eval@v1`
internally; every workflow in this repo calls
`forwardimpact/fit-bootstrap@v1` directly for the CI environment.
When changing either interface, update and tag the sibling first.

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
  `{owner}/{repo}/{path}@{ref}` instead — e.g.
  `forwardimpact/fit-bootstrap/post-run@v1` references the action's own
  `post-run/` subdirectory at the same tag.

## Matrix workflows and trace artifacts

When a workflow runs the same action across a matrix, pass `case` to avoid
artifact name collisions. Example from `kata-shift.yml`:

```yaml
case: ${{ matrix.agent.name }}
```
