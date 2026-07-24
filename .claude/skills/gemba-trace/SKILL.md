---
name: gemba-trace
description: >
  See exactly what an agent did and whether a change improved outcomes.
  Use when an agent workflow failed and you need to understand why.
  Use when you want to measure token usage, cost, and efficiency across
  runs. Use when you study agent behavior patterns from NDJSON traces.
---

# Trace Analysis

Download agent execution traces from GitHub Actions, query them with structured
commands, and analyze agent behavior systematically. `gemba-trace` reads NDJSON
trace files directly — raw combined envelope traces and split per-participant
lanes alike — through a query interface purpose-built for understanding what an
agent did, why, and what happened as a result.

## When to Use

- **Understand what an agent did** — `overview`, `timeline`, `stats`,
  `tool-calls`.
- **Debug agent failures** — `errors`, `search`, `filter`.
- **Download traces from CI** — `runs`, then `download <run-id>`.

Cross-trace verbs take their file(s) through `--file` (repeat it or pass a
quoted glob). They print text by default. Add `--format json` for the
machine-parseable envelope. `tool`, `turn`, `batch`, `search`, and `compare`
take their file(s) as positionals.

## CLI Reference

Install and run with npm:

```sh
npx gemba-trace runs [pattern]                # list workflow runs (default pattern: kata|agent|eval|benchmark)
npx gemba-trace find <run-id> <key>           # resolve one lane by key: filename, case, or participant; ambiguous keys list candidates
npx gemba-trace download <run-id>             # extract the artifact's .ndjson members into /tmp/trace-<run-id>/
```

Verbs read the downloaded `.ndjson` files directly (`structured.json`
appears only for single-member artifacts). Once you have a trace file,
query it:

### Navigation

| Command                    | Purpose                                   |
| -------------------------- | ----------------------------------------- |
| `overview --file <file>`   | Metadata, summary, turn count, tool usage |
| `timeline --file <file>`   | Compact one-line-per-turn overview        |
| `count --file <file>`      | Number of turns                           |
| `head --file <file> --lines N` | First N turns (default 10)            |
| `tail --file <file> --lines N` | Last N turns (default 10)             |
| `batch <file> <from> <to>` | Turns in range [from, to)                 |
| `turn <file> <index>`      | Single turn by index                      |
| `init --file <file>`       | Full system/init event                    |

### Search and Filter

| Command                          | Purpose                                               |
| -------------------------------- | ----------------------------------------------------- |
| `search <file> <pattern>`        | Regex search across all content                       |
| `filter --file <file> --role <role>` | Filter by role (system, user, assistant, tool_result) |
| `filter --file <file> --tool <name>` | Filter by tool name                               |
| `filter --file <file> --error`   | Error tool results only                               |

Search options: `--limit N` (max results), `--context N` (turns around the
match), `--full` (full content blocks in match descriptions).

### Analysis

| Command                          | Purpose                                          |
| -------------------------------- | ------------------------------------------------ |
| `stats --file <file>`            | Token/cost totals (summed over all result events) + per-API-message breakdown |
| `stats --file <file> --by-tool`  | Per-tool token attribution and cost share        |
| `stats --file <file> --summary`  | Totals only (suppress the per-turn array)         |
| `tools --file <file>`            | Tool usage frequency (descending)                |
| `tool <file> <name>`             | All turns that involve a specific tool           |
| `tool-calls --file <file>`       | One record per tool_use, paired with its result  |
| `commands --file <file> [--match <regex>]` | One record per Bash command            |
| `paths --file <file> [--prefix <p>]` | Distinct Read/Edit/Write paths, freq-sorted   |
| `compare <file-a> <file-b>`      | Side-by-side comparison of two traces            |
| `errors --file <file>`           | All tool results with isError=true               |
| `reasoning --file <file>`        | Agent reasoning text only                        |
| `split <file> --mode <mode>`     | Split combined trace into per-source files       |

`tool`, `tools`, and `tool-calls` are adjacent on purpose. `tool <name>` lists
every turn for one tool. `tools` ranks tools by frequency. `tool-calls` emits
one record per `tool_use` block paired with its `tool_result`.

Reasoning options: `--from N` and `--to N` to limit turn range.

Multi-file: cross-trace verbs (`overview`, `count`, `head`, `tail`, `tools`,
`errors`, `reasoning`, `timeline`, `stats`, `init`, `filter`, `tool-calls`,
`commands`, `paths`) accept several files through repeated `--file` or a quoted
glob. With more than one resolved file, each record carries its source
basename. A single file (or a glob that resolves to one) carries no prefix.

Split modes: `run`, `supervise`, or `facilitate`. `split` produces files with
the name `trace--<case>--<participant>.<role>.ndjson` (e.g.
`trace--default--agent.agent.ndjson`). Pass `--case <id>` to embed a case
identifier (defaults to `default`). Pass `--output-dir` to control where
`split` writes the files.

### Global Options

| Flag                  | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| `--format <text\|json>` | Command output format (default `text`)               |
| `--signatures`        | Include thinking.signature blobs (stripped by default) |
| `--json`              | Output **help** as JSON. For command output use `--format json` |

### Run Listing Options

| Flag                  | Purpose                              |
| --------------------- | ------------------------------------ |
| `--lookback <d>`      | How far back to search (default: 7d) |
| `--repo <owner/repo>` | GitHub repo override                 |

---

## Typical Workflow

```sh
npx gemba-trace runs                          # find the run you want (kata, agent, eval, and benchmark runs by default)
npx gemba-trace download 24497273755          # extract the artifact's .ndjson members into /tmp/trace-24497273755/
npx gemba-trace split /tmp/trace-24497273755/trace--default.raw.ndjson --mode=facilitate
npx gemba-trace overview --file /tmp/trace-24497273755/trace--default--agent.agent.ndjson
npx gemba-trace timeline --file /tmp/trace-24497273755/trace--default--agent.agent.ndjson
npx gemba-trace errors --file /tmp/trace-24497273755/trace--default--agent.agent.ndjson
npx gemba-trace search /tmp/trace-24497273755/trace--default--agent.agent.ndjson 'permission denied' --context 1
```

Every downloaded `.ndjson` member is native verb input; eval artifacts
extract nested per cell (`runs/<taskId>/<runIndex>/trace--*`). Start with
`overview` and `timeline` to orient, then drill in with `search`, `filter`,
`tool`, `tool-calls`, and `errors`. To aggregate across several traces,
repeat `--file` or pass a quoted glob.

---

## Analysis Method

Trace analysis works best as qualitative research. Do not treat it as
checklist verification. **Grounded theory** is the recommended approach. Let
findings emerge from the data. Do not test a hypothesis.

### Core Principles

1. **Begin with no hypothesis.** Read the trace before you form opinions about
   what went wrong.
2. **Use the trace's own language.** Label observations with terms from the
   actual output (error messages, tool names, status codes). Do not use
   abstract categories you bring to the analysis.
3. **Write memos as you go.** Write short notes on why something surprised you,
   or on connections between observations. Memos written during analysis are
   far more valuable than retrospective summaries.
4. **Read the full trace.** A skim produces shallow findings. Every turn, tool
   call, and result matters. Agents often fail because of subtle interactions
   between steps that look fine in isolation.
5. **Seek a central explanation.** Do not produce a bug list. The most useful
   analysis output is a theory that connects multiple observations. An itemized
   list of issues is weaker.

### From Observations to Findings

As you read the trace, assign short labels (codes) to meaningful events. Group
related codes into categories. Ask what caused this, what happened, what the
context was, how the agent reacted, and what the consequences were.

Look for: causal chains, repeated patterns, contrasts (same operation succeeded
in one context but failed in another), and temporal patterns (early vs. late).

The strongest findings are **grounded** (traceable to specific turns),
**testable** (future traces can confirm or refute them), and **actionable**
(they imply a concrete change).

### What to Measure

- **Token usage** — `stats` totals sum over **all** result events (the last one
  alone undercounts). Each total names its population. A trace with no result
  event falls back to per-message totals (cost and duration unavailable).
- **Retry counts** — search for repeated identical tool calls.
- **Wasted turns** — turns that produced no useful progress.
- **Error recovery** — check whether the agent diagnosed and adapted, or
  retried blindly.
- **Intent vs. execution** — compare `reasoning` output to actual tool calls.

---

## Documentation

- [Analyze Traces](https://www.forwardimpact.team/docs/libraries/prove-changes/trace-analysis/index.md)
  — The full method walkthrough with worked examples (an eval that failed, a
  multi-agent session that stalled).
- [Run an Eval](https://www.forwardimpact.team/docs/libraries/prove-changes/run-eval/index.md)
  — How `gemba-harness supervise` produces the traces this skill analyzes.
- [Prove Agent Changes](https://www.forwardimpact.team/docs/libraries/prove-changes/index.md)
  — End-to-end workflow that also covers multi-agent collaboration. `split` is
  the bridge into per-source trace files.
