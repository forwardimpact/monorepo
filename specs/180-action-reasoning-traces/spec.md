# 180: Action Reasoning Traces

## Problem

The Claude GitHub Action runs autonomous tasks (security audits, Dependabot
triage) on a schedule, but all output is ephemeral — it prints to the workflow
log and vanishes. There is no structured record of what the agent reasoned
about, which tools it called, how many tokens it consumed, or what it cost.

Without persistent traces, there is no foundation for continuous improvement.
Teams cannot answer: "Is the security audit finding real issues?", "Is the agent
getting more efficient over time?", or "What did it actually do last Tuesday?"

## Why

- **No observability.** Workflow logs are unstructured text that scrolls off
  screen. Searching for what the agent did requires re-reading raw logs.
- **No cost tracking.** Claude API usage per workflow run is invisible. There is
  no way to track spending trends or catch runaway sessions.
- **No improvement loop.** Continuous improvement requires data. Without
  structured traces, there is nothing to analyze, compare, or learn from.
- **Multiple workflows ahead.** Security audit and Dependabot triage exist
  today. Code review, release notes, and other agent workflows will follow. The
  trace infrastructure must exist before they arrive.

## What

Three deliverables:

1. **`libtrace` library** (`libraries/libtrace/`) — a Node.js package with CLI
   (`fit-trace`) that processes Claude Code's `--output-format stream-json`
   NDJSON output. Two modes:
   - `--output-format text` — human-readable summary for workflow logs
   - `--output-format json` — structured trace document (metadata, turns,
     summary) for offline analysis
2. **Enhanced Claude action** (`.github/actions/claude/action.yml`) — captures
   raw stream-json output, prints readable text to the log via `fit-trace`, and
   uploads the raw NDJSON as a workflow artifact.
3. **Workspace registration** — `libtrace` added to the monorepo workspace so it
   is available after `npm ci` in CI.

## Scope

### In scope

- New library: `libraries/libtrace/` with `TraceCollector` class and `fit-trace`
  CLI
- Modified action: `.github/actions/claude/action.yml` with stream-json capture,
  text logging, and artifact upload
- Modified root `package.json` to register the workspace
- Unit tests for `TraceCollector`

### Out of scope

- Changes to workflow files (`security-audit.yml`, `dependabot-triage.yml`) —
  the action handles everything internally
- Dashboards, trend analysis, or cost reporting tools — those consume the traces
  later
- Changes to the `security-specialist` agent or any skills
- Extended thinking / reasoning token capture (not supported by Claude Code CLI
  in stream-json mode)

## Artifact Strategy

The raw Claude stream-json NDJSON is the permanent artifact. It preserves every
event with full fidelity — no information loss. Analysis tools (including
`fit-trace --output-format json`) can process these artifacts offline without
needing to re-run workflows.

The `fit-trace --output-format json` structured trace format exists for offline
analysis but is not used in the action itself. This separation means analysis
tools can evolve independently without affecting the artifact pipeline.

## Operational Model

| Concern            | Approach                                                 |
| ------------------ | -------------------------------------------------------- |
| Artifact format    | Raw NDJSON (`.ndjson`)                                   |
| Artifact retention | GitHub default (90 days)                                 |
| Workflow log       | Human-readable text via `fit-trace --output-format text` |
| Offline analysis   | `fit-trace --output-format json` on downloaded artifacts |
| Cost visibility    | `result` event in NDJSON contains `total_cost_usd`       |
