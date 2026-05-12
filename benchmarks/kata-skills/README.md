# `kata-skills` task family

Task family for `fit-benchmark` targeting the `forwardimpact/kata-skills`
skill pack. Runs on manual dispatch, weekly schedule, and path-filtered PRs.

## Tasks

| Task | Skill exercised | Grading |
| --- | --- | --- |
| `write-feature-spec` | `kata-spec` | Structural rubric (six checks) + judge verdict |

## Dependencies

Declared in `apm.yml`. `fit-benchmark run` calls `apm install --target claude`
automatically before each run — no manual staging step required.
