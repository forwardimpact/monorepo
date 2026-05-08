---
name: fit-trace
description: >
  Download, query, and analyze agent execution traces. Use when investigating
  agent behavior, debugging workflow failures, or studying how agents use
  tools — covers CLI commands, analysis method, and worked examples.
---

# Trace Analysis

Download agent execution traces from GitHub Actions, query them with structured
commands, and analyze agent behavior systematically. `fit-trace` turns raw trace
artifacts into structured JSON and provides a query interface purpose-built for
understanding what an agent did, why, and what happened as a result.

## When to Use

- Investigating why an agent workflow failed or produced unexpected results
- Understanding how an agent used its tools during a run
- Measuring token usage, cost, and efficiency across runs
- Debugging errors in tool calls or agent reasoning
- Studying agent behavior patterns over time

## CLI Reference

Install and run via npm:

```sh
npx fit-trace runs [pattern]                # list recent workflow runs
npx fit-trace download <run-id>             # download trace → /tmp/trace-<run-id>/structured.json
```

Once you have a structured trace file, query it:

### Navigation

| Command                    | Purpose                                   |
| -------------------------- | ----------------------------------------- |
| `overview <file>`          | Metadata, summary, turn count, tool usage |
| `timeline <file>`          | Compact one-line-per-turn overview        |
| `count <file>`             | Number of turns                           |
| `head <file> [N]`          | First N turns (default 10)                |
| `tail <file> [N]`          | Last N turns (default 10)                 |
| `batch <file> <from> <to>` | Turns in range [from, to)                 |
| `turn <file> <index>`      | Single turn by index                      |
| `init <file>`              | Full system/init event                    |

### Search and Filter

| Command                       | Purpose                                               |
| ----------------------------- | ----------------------------------------------------- |
| `search <file> <pattern>`     | Regex search across all content                       |
| `filter <file> --role <role>` | Filter by role (system, user, assistant, tool_result) |
| `filter <file> --tool <name>` | Filter by tool name                                   |
| `filter <file> --error`       | Error tool results only                               |

Search options: `--limit N` (max results), `--context N` (surrounding turns),
`--full` (full content blocks in match descriptions).

### Analysis

| Command                      | Purpose                                    |
| ---------------------------- | ------------------------------------------ |
| `stats <file>`               | Token usage and cost breakdown             |
| `tools <file>`               | Tool usage frequency (descending)          |
| `tool <file> <name>`         | All turns involving a specific tool        |
| `errors <file>`              | All tool results with isError=true         |
| `reasoning <file>`           | Agent reasoning text only                  |
| `split <file> --mode <mode>` | Split combined trace into per-source files |

Reasoning options: `--from N` and `--to N` to limit turn range.

Split modes: `run`, `supervise`, or `facilitate`. Produces files named
`trace--<case>--<participant>.<role>.ndjson` (e.g.,
`trace--default--agent.agent.ndjson`,
`trace--default--facilitator.facilitator.ndjson`,
`trace--demo--security-engineer.agent.ndjson`). Pass `--case <id>` to embed a
case identifier (defaults to `default`) and `--output-dir` to control where
files are written.

### Global Options

| Flag           | Purpose                                                |
| -------------- | ------------------------------------------------------ |
| `--signatures` | Include thinking.signature blobs (stripped by default) |
| `--json`       | Output help as JSON                                    |

### Run Listing Options

| Flag                  | Purpose                              |
| --------------------- | ------------------------------------ |
| `--lookback <d>`      | How far back to search (default: 7d) |
| `--repo <owner/repo>` | GitHub repo override                 |

---

## Typical Workflow

```sh
npx fit-trace runs                          # find the run you want
npx fit-trace download 24497273755          # download and structure the trace
npx fit-trace split /tmp/trace-24497273755/structured.json --mode=facilitate
npx fit-trace overview /tmp/trace-24497273755/structured.json
npx fit-trace timeline /tmp/trace-24497273755/structured.json
npx fit-trace errors /tmp/trace-24497273755/structured.json
npx fit-trace search /tmp/trace-24497273755/structured.json 'permission denied' --context 1
```

Start with `overview` and `timeline` to orient, then drill into specific areas
with `search`, `filter`, `tool`, and `errors`.

---

## Analysis Method

Trace analysis works best as qualitative research, not checklist verification.
**Grounded theory** is the recommended approach: let findings emerge from the
data rather than testing a hypothesis.

### Core Principles

1. **Begin with no hypothesis.** Read the trace before forming opinions about
   what went wrong.
2. **Use the trace's own language.** Label observations with terms from the
   actual output — error messages, tool names, status codes — not abstract
   categories you bring to the analysis.
3. **Write memos as you go.** Short notes on why something surprised you, or
   connections between observations. Memos written during analysis are far more
   valuable than retrospective summaries.
4. **Read the full trace.** Skimming produces shallow findings. Every turn, tool
   call, and result matters — agents often fail because of subtle interactions
   between steps that look fine in isolation.
5. **Seek a central explanation, not a bug list.** The most useful analysis
   output is a theory that connects multiple observations, not an itemized list
   of issues.

### From Observations to Findings

As you read the trace, assign short labels (codes) to meaningful events. Group
related codes into categories by asking: what caused this, what happened, what
was the context, how did the agent react, and what were the consequences?

Look for: causal chains, repeated patterns, contrasts (same operation succeeded
in one context but failed in another), and temporal patterns (early vs. late
behavior).

The strongest findings are **grounded** (traceable to specific turns),
**testable** (future traces can confirm or refute them), and **actionable**
(they imply a concrete change).

### What to Measure

- **Token usage** — `stats` breaks down input vs. output tokens and cost.
- **Retry counts** — search for repeated identical tool calls.
- **Wasted turns** — turns that produced no useful progress.
- **Error recovery** — did the agent diagnose and adapt, or retry blindly?
- **Intent vs. execution** — compare `reasoning` output to actual tool calls.

---

## Documentation

- [Analyze Traces](https://www.forwardimpact.team/docs/libraries/prove-changes/trace-analysis/index.md)
  — The full method walkthrough with worked examples (an eval that failed, a
  multi-agent session that stalled).
- [Run an Eval](https://www.forwardimpact.team/docs/libraries/prove-changes/run-eval/index.md)
  — How `fit-eval supervise` produces the traces this skill analyzes.
- [Prove Agent Changes](https://www.forwardimpact.team/docs/libraries/prove-changes/index.md)
  — End-to-end workflow including multi-agent collaboration; `split` is the
  bridge into per-source trace files.
