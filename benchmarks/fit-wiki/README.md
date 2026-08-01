# `fit-wiki` task family

Task family for `fit-benchmark`. It targets the `fit-wiki` CLI. It checks that
an agent can edit markdown files to resolve wiki audit findings.

## Tasks

| Task | Skill exercised | Grading |
| --- | --- | --- |
| `cli-fix` | wiki audit fix | Gates: seeded summary and memory sections intact (anti-tamper). Scored: audit passes after the fix. Judge verdict |

## Dependencies

No skill pack dependencies. The agent uses `fit-wiki audit` to discover
findings. It then edits the wiki files directly.
