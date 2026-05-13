# Workflows

## Third-party actions

Three composite actions are published as standalone repos under `forwardimpact/`
and referenced by tag:

| Action | Repo | Purpose |
|---|---|---|
| `forwardimpact/fit-benchmark@v1` | [fit-benchmark](https://github.com/forwardimpact/fit-benchmark) | Coding-agent benchmarks via `fit-benchmark` CLI |
| `forwardimpact/fit-eval@v1` | [fit-eval](https://github.com/forwardimpact/fit-eval) | Agent task execution via `fit-eval` CLI |
| `forwardimpact/kata-agent@v1` | [kata-agent](https://github.com/forwardimpact/kata-agent) | Full Kata workflow (auth, checkout, bootstrap, eval) |

`kata-agent` delegates to `fit-eval@v1` internally. When changing the `fit-eval`
interface, update and tag `fit-eval` first.

### Editing an action

Clone into `tmp/` (gitignored), edit, commit, force-move the `v1` tag, push:

```sh
gh repo clone forwardimpact/fit-eval tmp/fit-eval
# edit tmp/fit-eval/action.yml
cd tmp/fit-eval
git add -A && git commit -m "fix: description"
git tag -f v1
git push origin main && git push origin v1 --force
```

### Matrix workflows and trace artifacts

When a workflow runs the same action across a matrix, pass `case` to avoid
artifact name collisions. Example from `agent-team.yml`:

```yaml
case: ${{ matrix.agent.name }}
```

## Local actions

`bootstrap`, `post-run`, `audit`, and `coaligned-check` remain local under
`.github/actions/` and are referenced via relative paths.
