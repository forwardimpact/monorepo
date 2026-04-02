#!/usr/bin/env bash
# Find recent GitHub Actions workflow runs whose workflow name contains "Gemba"
# (case-insensitive). Returns structured JSON for each matching run.
#
# Usage: find-runs.sh [lookback]
#
#   lookback  How far back to search (gh duration format, e.g. 7d, 14d, 24h).
#             Default: 7d — covers a full weekly cycle of all agent workflows.
#
# Requires: gh (GitHub CLI) authenticated with repo access.
#
# Output: One JSON object per run, sorted newest-first:
#   { workflow, run_id, status, conclusion, created_at, branch, url }

set -euo pipefail

lookback="${1:-7d}"

# Calculate the cutoff date from the lookback duration.
# Supports formats: Nd (days), Nh (hours), Nw (weeks).
parse_cutoff() {
  local val="${1%?}"    # strip last char
  local unit="${1: -1}" # last char
  case "$unit" in
    d) date -u -d "$val days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
       || date -u -v-"${val}d" +%Y-%m-%dT%H:%M:%SZ ;;
    h) date -u -d "$val hours ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
       || date -u -v-"${val}H" +%Y-%m-%dT%H:%M:%SZ ;;
    w) date -u -d "$((val * 7)) days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
       || date -u -v-"$((val * 7))d" +%Y-%m-%dT%H:%M:%SZ ;;
    *) echo "Error: unsupported duration unit '$unit' (use d, h, or w)" >&2; exit 1 ;;
  esac
}

cutoff=$(parse_cutoff "$lookback")

# List all workflow runs since the cutoff, filter to those whose workflow name
# contains "gemba" (case-insensitive), and emit structured JSON.
gh run list \
  --limit 200 \
  --json databaseId,workflowName,status,conclusion,createdAt,headBranch,url \
  --jq "
    [.[] | select(
      (.createdAt >= \"$cutoff\") and
      (.workflowName | ascii_downcase | contains(\"gemba\"))
    )]
    | sort_by(.createdAt) | reverse
    | .[]
    | {
        workflow: .workflowName,
        run_id: .databaseId,
        status: .status,
        conclusion: .conclusion,
        created_at: .createdAt,
        branch: .headBranch,
        url: .url
      }
  "
