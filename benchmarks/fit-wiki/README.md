# `fit-wiki` task family

Task family for `fit-benchmark` targeting the `fit-wiki` CLI. Validates
that an agent can resolve wiki audit findings by editing markdown files.

## Tasks

| Task | Skill exercised | Grading |
| --- | --- | --- |
| `cli-fix` | wiki audit fix | Gates: seeded summary and memory sections intact (anti-tamper). Scored: audit passes after the fix. Judge verdict |

## Dependencies

No skill pack dependencies. The agent uses `fit-wiki audit` to discover
findings and edits wiki files directly.
