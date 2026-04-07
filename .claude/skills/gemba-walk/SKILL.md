---
name: gemba-walk
description: >
  Walk the gemba of an agent workflow run. Select a trace, download it, observe
  the work as it actually happened, apply grounded theory analysis, and produce
  a structured findings report. "Go see, ask why, show respect."
---

# Gemba Walk for Agent Workflows

Go to where the work happens — the execution trace of a CI agent workflow run —
and observe it firsthand. Select one run, download its trace, study every turn,
categorize findings, and produce a structured report. Depth over breadth.

## When to Use

- During a coaching cycle to analyze a single agent workflow run
- When investigating a specific workflow failure or unexpected behaviour
- When auditing trust boundaries in external merge workflows

## Process

### 1. Select a Run

If a specific workflow name, run ID, or URL is provided, use that run.

Otherwise, select a run using memory-informed rotation:

1. **Read memory** — Per the agent profile, read your summary, the current
   week's log, and teammates' summaries. Extract workflow names and run IDs from
   previous cycles.

2. **Discover available runs**:

   ```sh
   bash .claude/skills/gemba-walk/scripts/find-runs.sh [lookback]
   ```

   Default lookback is `7d`. Use `14d` for broader window, `24h` for recent
   only. Returns JSON sorted newest-first with `workflow`, `run_id`, `status`,
   `conclusion`, `created_at`, `branch`, and `url` fields.

3. **Avoid duplicates** — Skip run IDs already analyzed (per memory).

4. **Rotate across agents** — Prefer the least-recently analyzed workflow.

5. **Prefer failures** — Among eligible runs, prefer non-success conclusions.

Announce which run you selected and why before proceeding.

### 2. Download and Process the Trace

Artifact names:

- **`combined-trace`** — Full interleaved agent + supervisor (supervised runs).
  **Prefer this.**
- **`agent-trace`** — Agent events only (all runs).
- **`supervisor-trace`** — Supervisor events only (supervised runs).

```sh
# Supervised runs:
gh run download <run-id> --name combined-trace --dir /tmp/trace-<run-id>
# Non-supervised runs:
gh run download <run-id> --name agent-trace --dir /tmp/trace-<run-id>
# Then process:
bunx fit-eval output --format=json < /tmp/trace-<run-id>/trace.ndjson > /tmp/trace-<run-id>/structured.json
```

If no trace artifacts exist, pick a different run and note why.

### 3. Observe the Work

Apply the `grounded-theory-analysis` skill to the trace. Read it **in full** —
every turn, every tool call, every result.

#### Trust audit (product-backlog traces)

The product-backlog workflow is the **sole external merge point**. For every
merged PR, verify the trace contains a contributor list lookup and that the PR
author was checked against it before merge. Missing trust verification is a
**high-severity finding**.

### 4. Categorize Findings

| Category        | Criteria                                        | Action         |
| --------------- | ----------------------------------------------- | -------------- |
| **Trivial fix** | Root cause clear, fix mechanical, low risk      | Implement + PR |
| **Improvement** | Pattern requires design, touches multiple files | Write spec     |
| **Observation** | Not actionable yet, or needs more data          | Note in report |

### 5. Report

Produce the full grounded theory analysis report as defined in the
`grounded-theory-analysis` skill. Prefix with run selection context.
