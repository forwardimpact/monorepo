---
title: Analyze Traces
description: See exactly what an agent did and why — download traces, query turns, filter by tool or error, and measure token cost.
---

You need to see exactly what the agent did so you can debug failures and verify
improvements. `fit-trace` reads the NDJSON traces produced by `fit-eval` and
gives you structured queries over every turn, tool call, and result.

## Prerequisites

- Node.js 18+
- A trace file -- either `--output` from a `fit-eval` run, or downloaded from CI
  with `fit-trace download`

## Get the trace

Local runs already produce a trace at the `--output` path. For CI runs, list
recent workflow runs and download:

```sh
npx fit-trace runs                        # list recent workflow runs
npx fit-trace download 24497273755        # downloads to /tmp/trace-24497273755/
```

The download extracts the artifact zip (`trace--<case>--<participant>.<role>.ndjson`
files plus the combined `trace--<case>.raw.ndjson`) and produces a
`structured.json` derived from the first NDJSON file. Both NDJSON files and
`structured.json` work as input to every query command below.

## Orient with the overview

Start with the bird's-eye view before drilling into individual turns:

```sh
npx fit-trace overview /tmp/trace-24497273755/structured.json
```

```json
{
  "summary": { "result": "success", "totalCostUsd": 0.42, "numTurns": 18 },
  "turnCount": 34,
  "tools": [{ "tool": "Bash", "count": 12 }, { "tool": "Read", "count": 8 }],
  "taskPrompt": "Refactor src/utils/format.js so that formatDate and formatCurrency share..."
}
```

The `timeline` command shows the shape of the session at a glance -- one line
per assistant turn with tools used and token counts:

```sh
npx fit-trace timeline /tmp/trace-24497273755/structured.json
```

```text
[1]  Read                           in:12.3K out:0.8K    Let me read the current implementation...
[3]  Bash                           in:13.1K out:1.2K    Running the existing tests first...
[5]  Edit                           in:14.0K out:2.1K    I'll extract the shared locale helper...
[7]  Bash                           in:15.2K out:0.4K    Running tests to verify the refactor...
```

## Find errors

List every tool result where the agent's tool call failed:

```sh
npx fit-trace errors /tmp/trace-24497273755/structured.json
```

Each result includes the turn index, the `toolUseId` that links it back to the
assistant turn that made the call, and the error content.

## Filter by tool or role

See every turn where the agent used a specific tool, including both the
`tool_use` request and its `tool_result` response:

```sh
npx fit-trace tool /tmp/trace-24497273755/structured.json Bash
```

Or use `filter` for structural queries -- by role, tool name, or error status:

```sh
npx fit-trace filter /tmp/trace-24497273755/structured.json --tool Edit
npx fit-trace filter /tmp/trace-24497273755/structured.json --error
npx fit-trace filter /tmp/trace-24497273755/structured.json --role user
```

## Search across the trace

Search all turn content with a regex pattern:

```sh
npx fit-trace search /tmp/trace-24497273755/structured.json 'permission denied' --context 1
```

`--context 1` includes one surrounding turn on each side of every match.
`--limit 10` caps the number of results. `--full` emits the complete content
block instead of a short excerpt.

## Read the agent's reasoning

Extract just the text blocks from assistant turns to see what the agent said it
would do (as distinct from what its tool calls actually did):

```sh
npx fit-trace reasoning /tmp/trace-24497273755/structured.json --from 5 --to 15
```

```json
[
  { "index": 5, "text": "I'll extract the shared locale helper..." },
  { "index": 9, "text": "Tests pass. Now adding coverage for de-DE..." }
]
```

Comparing `reasoning` output to actual `tool` calls reveals mismatches between
intent and execution.

## Measure token usage and cost

```sh
npx fit-trace stats /tmp/trace-24497273755/structured.json
```

```json
{
  "totals": {
    "inputTokens": 142800, "outputTokens": 18400,
    "totalCostUsd": 0.42, "durationMs": 94200,
    "durationLabel": "cumulative invocation time",
    "resultEventTurns": 18, "population": "result-event-sum"
  },
  "perTurn": [{ "messageId": "msg_01", "inputTokens": 12300, "outputTokens": 800, "population": "api-message", ... }]
}
```

The totals are the sum over **all** result events in the trace — a supervised or
facilitated session carries one per invocation, and reading only the last one
undercounts session cost. The `perTurn` breakdown is one row per API message
(its `outputTokens` is a streaming-snapshot lower bound, not the final count),
and every figure names its population. A trace with no result event still
reports per-message totals, with cost and duration marked unavailable rather
than a misleading `0`.

Track these numbers across runs over time. A single trace is a snapshot; a
series shows whether changes are landing.

## Split multi-agent traces

For supervised or facilitated runs, split the combined trace into per-source
files so you can see what each agent saw independently:

```sh
npx fit-trace split /tmp/trace-24497273755/structured.json --mode=facilitate --case=demo
```

This produces files in the same directory following the
`trace--<case>--<participant>.<role>.ndjson` convention:
`trace--demo--facilitator.facilitator.ndjson` and one
`trace--demo--<participant>.agent.ndjson` per participant. Each file works as
input to every query command above.

For supervised runs, use `--mode=supervise` to get
`trace--<case>--agent.agent.ndjson` and
`trace--<case>--supervisor.supervisor.ndjson`. `--case` defaults to `default`;
matrix workflows pass the case id so per-shard artifacts stay isolated.

## Navigate individual turns

When you need to inspect a specific moment in the trace:

```sh
npx fit-trace turn /tmp/trace-24497273755/structured.json 8
npx fit-trace batch /tmp/trace-24497273755/structured.json 5 10
npx fit-trace head /tmp/trace-24497273755/structured.json 5
npx fit-trace tail /tmp/trace-24497273755/structured.json 5
```

`batch` returns turns in the half-open range `[from, to)`. `head` and `tail`
default to 10 turns when no count is given.

## What to look for

When debugging a failure, a useful sequence is:

1. `overview` -- did the run succeed or fail? How many turns?
2. `errors` -- which tool calls failed?
3. `tool <name>` on the failing tool -- what input did the agent send?
4. `reasoning` around those turns -- did the agent understand the error?
5. `search` for the error message -- did it appear earlier than expected?

When verifying an improvement, compare `stats` across before-and-after runs.
Fewer retries, lower token usage, and shorter duration are the signals that a
profile or prompt change improved outcomes.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../run-eval -->

</div>
