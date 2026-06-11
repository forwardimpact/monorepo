# Metrics — Release Merge

Record per KATA.md § Metrics. Append one row per metric per run to
`wiki/metrics/kata-release-merge/{YYYY}.csv`.

| Metric                     | Unit  | Description                                                                                                    | Data source                                                                |
| -------------------------- | ----- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| prs_merged                 | count | PRs merged this run                                                                                            | Run actions                                                                |
| approvals_recorded_per_run | count | Inbound human approval signals — `<phase>:approved` label-add events + APPROVED review events — observed in `[prev_run_start, current_run_start)`. These signals feed `wiki/STATUS.md` via `kata-dispatch`. | `gh api repos/{owner}/{repo}/issues/<n>/timeline` + `.../pulls/<n>/reviews` |

Backlog (`gh pr list`) is queried, not recorded.

## Collection

Capture the current run's start once, then the previous completed `agent-team`
run's start (which is the most recent completed run, since this run is
in-progress and excluded by `--status=completed`):

```sh
current_run_start=$(date -u +%FT%TZ)
prev_run_start=$(gh run list --workflow=kata-shift.yml --status=completed \
  --limit 1 --json startedAt --jq '.[0].startedAt // empty')
# First-ever recording: fall back to current_run_start - 8h (an
# approximate scheduled-run gap).
[ -z "$prev_run_start" ] && prev_run_start=$(date -u -d "$current_run_start - 8 hours" +%FT%TZ)
```

Window: `[prev_run_start, current_run_start)` (half-open).

Cohort: every PR seen in SKILL.md Step 1 (open phase PRs) plus every phase PR
merged this run (Step 8). The cohort undercounts approvals on PRs merged in a
prior run still within the window — accepted at boundaries; the storyboard
meeting reads run-over-run, not per-PR.

For each cohort PR, fetch label-add events and APPROVED reviews:

```sh
gh api repos/{owner}/{repo}/issues/<n>/timeline --paginate \
  --jq '.[] | select(.event=="labeled" and (.label.name|test("^(spec|design|plan):approved$"))) | {ts: .created_at}'

gh api repos/{owner}/{repo}/pulls/<n>/reviews --paginate \
  --jq '.[] | select(.state=="APPROVED") | {ts: .submitted_at}'
```

Filter events to `ts ∈ [prev_run_start, current_run_start)` and sum across all
cohort PRs to `approvals_recorded_per_run` (no per-event de-dup — record the
raw count).

CSV row schema (mirror existing `prs_merged` rows):
`run_ts,metric,unit,value,note` — where `note="window=[<prev>,<curr>)"`. Zero is
recorded as `0`. If any per-PR call fails (rate limit, scope), skip that PR and
append `;api_errors=N` to `note`; a blanket failure records `0` with non-empty
`api_errors=` so producer health is visible at the next storyboard meeting.

GNU `date -u -d` syntax assumes the GitHub-hosted Ubuntu runner; macOS BSD
`date` rejects it — run this skill from CI, not a local shell.
