# `kata-skills` task family

Task family for `fit-benchmark` targeting the `forwardimpact/kata-skills`
skill pack. Runs on manual dispatch, weekly schedule, and path-filtered PRs.

## Tasks

| Task | Skill exercised | Grading |
| --- | --- | --- |
| `write-feature-spec` | `kata-spec` | Structural rubric (six checks) + judge verdict |

## Staging

`scripts/stage-family.sh --regime in-repo|published` produces the `.claude/`
tree and `apm.lock.yaml`.

| Regime | Source | Trigger |
| --- | --- | --- |
| `in-repo` | Monorepo `.claude/skills/kata-*` | `pull_request` |
| `published` | `forwardimpact/kata-skills` git repo | `workflow_dispatch`, `schedule` |
