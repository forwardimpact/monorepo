# `fit-wiki` task family

Task family for `fit-benchmark` targeting the `fit-wiki` CLI. Validates
that an agent can resolve wiki audit findings by editing markdown files.

## Tasks

| Task | Skill exercised | Grading |
| --- | --- | --- |
| `cli-fix` | wiki audit fix | Audit passes after fix + judge verdict |

## Dependencies

No skill pack dependencies. The agent uses `fit-wiki audit` to discover
findings and edits wiki files directly.
