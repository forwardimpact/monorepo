# Metrics — Release Merge

Record per KATA.md § Metrics. Append one row per metric per run.

| Metric                       | Unit  | Description                                                                                                  | Data source                                  |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| prs_merged                   | count | PRs merged this run                                                                                          | Run actions                                  |
| approvals_recorded_per_run   | count | `<phase>:approved` label-add events + APPROVED review events observed in `[prev_run_start, current_run_start)` | `gh api repos/{owner}/{repo}/issues/<n>/timeline` + `.../pulls/<n>/reviews`         |

Backlog (`gh pr list`) is queried, not recorded.

`prev_run_start` is the `startedAt` of the previous completed `agent-team`
workflow run, fetched with `gh run list --workflow=agent-team.yml`. First-ever
recording falls back to `current_run_start - 8h` (median schedule gap of the
03:00/12:00/20:00 UTC cadence). Cohort: all open phase PRs surveyed in
SKILL.md Step 1 plus any phase PR merged within the window (Step 8).
`plan:implemented` is a state label, excluded. See
[`coordination-protocol.md` § Measurement-system changes](../../../agents/references/coordination-protocol.md#measurement-system-changes).
