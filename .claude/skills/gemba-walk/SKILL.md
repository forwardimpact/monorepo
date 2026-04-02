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
categorize findings, and produce a structured report. Depth over breadth: a
thorough walk of one run yields better findings than a shallow scan of many.

## When to Use

- During a coaching cycle to analyze a single agent workflow run
- When investigating a specific workflow failure or unexpected behaviour
- When auditing trust boundaries in external merge workflows

## Process

### 1. Select a Run

If a specific workflow name, run ID, or URL is provided, use that run.

Otherwise, select a run using memory-informed rotation:

1. **Read memory** — Read all files in the memory directory. From your own
   entries, extract the workflow name and run ID from each previous cycle.

2. **Discover available runs** — use the discovery script which finds all
   workflows whose name contains "Gemba" (all agent workflows use this prefix):

   ```sh
   bash .claude/skills/gemba-walk/scripts/find-runs.sh [lookback]
   ```

   The `lookback` argument controls how far back to search (default: `7d` —
   covers a full weekly cycle). Use `14d` for a broader window or `24h` to
   focus on recent runs. The script returns JSON objects sorted newest-first
   with `workflow`, `run_id`, `status`, `conclusion`, `created_at`, `branch`,
   and `url` fields.

3. **Avoid duplicates** — Skip any run ID already analyzed (per memory).

4. **Rotate across agents** — Prefer the agent whose workflow you have analyzed
   least recently, ensuring all agents receive attention over time.

5. **Prefer failures** — Among eligible runs, prefer non-success conclusions
   (failure, cancelled) as they yield more actionable findings.

Announce which run you selected and why before proceeding.

### 2. Download and Process the Trace

Every workflow run uploads trace artifacts with consistent names:

- **`combined-trace`** — Full interleaved agent + supervisor trace (supervised
  runs only). **Prefer this** — it gives the most holistic view.
- **`agent-trace`** — Agent events only (all runs). In supervised runs the
  events are unwrapped to match the format of a regular run.
- **`supervisor-trace`** — Supervisor events only (supervised runs only).

For supervised runs, download the combined trace:

```sh
gh run download <run-id> --name combined-trace --dir /tmp/trace-<run-id>
bunx fit-eval output --format=json < /tmp/trace-<run-id>/trace.ndjson > /tmp/trace-<run-id>/structured.json
```

For non-supervised runs (which only have `agent-trace`):

```sh
gh run download <run-id> --name agent-trace --dir /tmp/trace-<run-id>
bunx fit-eval output --format=json < /tmp/trace-<run-id>/trace.ndjson > /tmp/trace-<run-id>/structured.json
```

Download `agent-trace` or `supervisor-trace` separately when you need to isolate
one side of the conversation.

Keep the raw NDJSON available for detailed inspection when the structured summary
is insufficient.

If the selected run has no trace artifacts, pick a different run and note why
you moved on.

### 3. Observe the Work

Apply the `grounded-theory-analysis` skill to the trace. Read it **in full** —
every turn, every tool call, every result. Do not skim or sample.

Look for:

- **Errors** — Tool calls that returned errors, commands that failed, permission
  denials, network failures
- **Workarounds** — Places where the agent retried, changed approach, or worked
  around an obstacle — these indicate infrastructure gaps
- **Wasted effort** — Cancelled tool calls, redundant operations, dead-end
  exploration that could have been avoided with better context
- **Skill gaps** — Tasks the agent attempted but its skill documentation didn't
  cover, or instructions that were ambiguous
- **Pattern violations** — Agent behaviour that diverged from skill
  instructions, indicating unclear or incomplete skill definitions
- **Cost efficiency** — Token usage relative to task complexity, opportunities
  to reduce turns or use cheaper models for subtasks
- **Decision quality** — Were the agent's choices correct? Did it prioritize the
  right things? Did it miss something obvious?

Spend time on this step. Read the agent's reasoning text between tool calls to
understand its intent. Compare what it did to what its skill says it should do.
Follow causal chains to root causes.

#### Trust audit (product-backlog traces)

The product-backlog workflow is the **sole external merge point** in the CI
system — the only place where contributions from outside the agent system enter
the codebase. All other workflows operate on trusted sources.

For every PR that was merged in a product-backlog trace, verify:

1. The trace contains a `gh api repos/{owner}/{repo}/contributors` call (or
   equivalent) that retrieved the top contributors list.
2. The PR author's login was compared against that list before the merge.
3. No merge was executed without both checks visible in the trace.

A missing trust verification on any merged PR is a **high-severity finding**.

### 4. Categorize Findings

Classify each finding:

| Category        | Criteria                                               | Action         |
| --------------- | ------------------------------------------------------ | -------------- |
| **Trivial fix** | Root cause is clear, fix is mechanical, low risk       | Implement + PR |
| **Improvement** | Pattern requires design, touches multiple files/skills | Write spec     |
| **Observation** | Interesting but not actionable yet, or needs more data | Note in report |

### 5. Report

Produce the full grounded theory analysis report as defined in the
`grounded-theory-analysis` skill. Prefix it with the run selection context:

```
**Selection reason**: <why this run was chosen — rotation, failure preference,
or specific request>
```

Then include the complete report: trace overview, memos, open codes, categories
with paradigm models, core category with propositions, actionable findings, and
saturation notes.
