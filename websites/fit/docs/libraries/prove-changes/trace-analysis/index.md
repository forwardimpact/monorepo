---
title: Analyze Traces
description: See exactly what an agent did and why — download traces, query turns, filter by tool or error, and measure token cost.
---

You need to see exactly what the agent did so you can debug failures and
verify improvements. `gemba-trace` reads the NDJSON traces that
`gemba-harness` produces. It gives you structured queries over every turn,
tool call, and result.

## Prerequisites

- Node.js 22+
- A trace file, either the `--output` from a `gemba-harness` run or a file you
  download from CI with `gemba-trace download`

## Get the trace

Local runs already produce a trace at the `--output` path. For CI runs, list
recent workflow runs and download:

```sh
npx gemba-trace runs                        # list recent workflow runs
npx gemba-trace download 24497273755        # downloads to /tmp/trace-24497273755/
```

The download extracts the artifact zip
(`trace--<case>--<participant>.<role>.ndjson` files plus the combined
`trace--<case>.raw.ndjson`). It then derives a `structured.json` from the
first NDJSON file. Both NDJSON files and `structured.json` work as input to
every query command below.

## Orient with the overview

Start with the bird's-eye view before you drill into individual turns.
Analysis verbs take their trace files through `--file`. They print
human-readable text by default. Add `--format json` for the machine-parseable
envelope:

```sh
npx gemba-trace overview --file /tmp/trace-24497273755/structured.json --format json
```

```json
{
  "summary": { "result": "success", "totalCostUsd": 0.42, "numTurns": 18 },
  "turnCount": 34,
  "tools": [{ "tool": "Bash", "count": 12 }, { "tool": "Read", "count": 8 }],
  "taskPrompt": "Refactor src/utils/format.js so that formatDate and formatCurrency share..."
}
```

The `timeline` command shows the shape of the session at a glance. It prints
one line per assistant turn, with the tools used and the token counts:

```sh
npx gemba-trace timeline --file /tmp/trace-24497273755/structured.json
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
npx gemba-trace errors --file /tmp/trace-24497273755/structured.json
```

Each result includes the turn index, the `toolUseId` that links it back to the
assistant turn that made the call, and the error content.

## Filter by tool or role

See every turn where the agent used a specific tool. The output holds both
the `tool_use` request and its `tool_result` response:

```sh
npx gemba-trace tool /tmp/trace-24497273755/structured.json Bash
```

`tool` takes the trace file as a positional (it pins a single trace plus a
tool name). Or use `filter` for structural queries by role, tool name, or
error status:

```sh
npx gemba-trace filter --file /tmp/trace-24497273755/structured.json --tool Edit
npx gemba-trace filter --file /tmp/trace-24497273755/structured.json --error
npx gemba-trace filter --file /tmp/trace-24497273755/structured.json --role user
```

## Search across the trace

Search all turn content with a regex pattern (`search` is single-file, so the
file is a positional):

```sh
npx gemba-trace search /tmp/trace-24497273755/structured.json 'permission denied' --context 1
```

`--context 1` includes one turn on each side of every match.
`--limit 10` caps the number of results. `--full` emits the complete content
block instead of a short excerpt.

## Read the agent's reasoning

The text blocks in assistant turns show what the agent said it would do. The
tool calls show what it actually did. Extract just the text blocks:

```sh
npx gemba-trace reasoning --file /tmp/trace-24497273755/structured.json --from 5 --to 15
```

```json
[
  { "index": 5, "text": "I'll extract the shared locale helper..." },
  { "index": 9, "text": "Tests pass. Now adding coverage for de-DE..." }
]
```

Compare `reasoning` output to actual `tool` calls to find mismatches between
intent and execution.

## Measure token usage and cost

```sh
npx gemba-trace stats --file /tmp/trace-24497273755/structured.json --format json
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

The totals are the sum over **all** result events in the trace. A supervised
or facilitated session carries one result event per invocation. If you read
only the last one, you undercount the session cost. The `perTurn` breakdown is
one row per API message. Its `outputTokens` comes from a snapshot of the
stream, so it is a lower bound. It is not the final count. Every figure names
its population. A trace with no result event still reports per-message totals.
It marks cost and duration unavailable instead of a misleading `0`.

`stats --by-tool` attributes token usage and a cost-share fraction to each
tool. The fractions sum to 1.0. Turns that made no tool call land in the
`(no-tool)` bucket. `stats --summary` prints the totals block only. Both views
report the same result-event totals, so their per-bucket token sums match the
un-flagged `stats` totals.

Track these numbers across runs over time. A single trace is a snapshot. A
series shows whether the changes land.

## Split multi-agent traces

For supervised or facilitated runs, split the combined trace into per-source
files. Then you can see what each agent saw independently:

```sh
npx gemba-trace split /tmp/trace-24497273755/structured.json --mode=facilitate --case=demo
```

This produces files in the same directory. The names follow the
`trace--<case>--<participant>.<role>.ndjson` convention:
`trace--demo--facilitator.facilitator.ndjson` and one
`trace--demo--<participant>.agent.ndjson` per participant. Each file works as
input to every query command above.

For supervised runs, use `--mode=supervise` to get
`trace--<case>--agent.agent.ndjson` and
`trace--<case>--supervisor.supervisor.ndjson`. `--case` defaults to `default`.
Matrix workflows pass the case id, so per-shard artifacts stay isolated.

## Navigate individual turns

When you need to inspect a specific moment in the trace:

```sh
npx gemba-trace turn /tmp/trace-24497273755/structured.json 8
npx gemba-trace batch /tmp/trace-24497273755/structured.json 5 10
npx gemba-trace head --file /tmp/trace-24497273755/structured.json --lines 5
npx gemba-trace tail --file /tmp/trace-24497273755/structured.json --lines 5
```

`turn` and `batch` are single-file (positional). `batch` returns turns in the
half-open range `[from, to)`. `head` and `tail` are cross-trace (`--file`).
They take their count through `--lines`, which defaults to 10.

## Aggregate without writing wrappers

Three verbs answer the questions that used to need a script. `tool-calls`
emits one record per `tool_use` block. It pairs each block with its
`tool_result` by `toolUseId`. Orphaned calls show `(no result)`, and
`tool-calls` never drops them:

```sh
npx gemba-trace tool-calls --file /tmp/trace-24497273755/structured.json
```

`commands` lists every Bash command (filter with `--match <regex>`). `paths`
gives a frequency-sorted list of the distinct `Read`/`Edit`/`Write` file paths
(filter with `--prefix`):

```sh
npx gemba-trace commands --file /tmp/trace-24497273755/structured.json --match '^git'
npx gemba-trace paths --file /tmp/trace-24497273755/structured.json --prefix /app
```

These sit next to `tool` (every turn for one tool) and `tools` (frequency
across all tools). Reach for `tool-calls` when you want one record that holds
both the use and the result.

## Compare two traces

`compare` puts two traces side by side. It reports turn count, distinct tools,
paths touched, cost, and a per-tool delta. The header shows the case name and
the participant for each side:

```sh
npx gemba-trace compare trace--demo--agent.agent.ndjson trace--demo--supervisor.supervisor.ndjson
```

Identical traces emit zero deltas. An empty trace emits zeroed counters with
an `(empty)` marker, and it does not error. `compare` takes its two files as
positionals. It does not take `--file`.

## Analyse several traces at once

Cross-trace verbs accept more than one trace. Repeat `--file`, or pass a quoted
glob the verb expands itself:

```sh
npx gemba-trace paths --file 'traces/*.ndjson' --prefix /app
npx gemba-trace tool-calls --file run-a.ndjson --file run-b.ndjson
```

With more than one resolved file, every record carries its source. Then you
can tell the traces apart. Per-record verbs prefix each line with
`<basename>:` (`grep -H` convention). The aggregators (`paths`, `tools`) carry
a `sources` array in `--format json`. A single resolved file carries no source
prefix. A glob that matches exactly one file counts as a single file. Source
attribution is the file's **basename**, so two traces with the same basename
in different directories collide. Rename them, or run from inside one
directory to keep them distinct.

## What to look for

When you debug a failure, use this sequence:

1. `overview` — see whether the run succeeded or failed, and how many turns it
   took.
2. `errors` — see which tool calls failed.
3. `tool <name>` on the tool that failed — see what input the agent sent.
4. `reasoning` around those turns — see whether the agent understood the
   error.
5. `search` for the error message — see whether it appeared earlier than you
   expected.

When you verify an improvement, compare `stats` across before-and-after runs.
Fewer retries, lower token usage, and shorter duration are the signals that a
profile or prompt change improved outcomes.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../run-eval -->

</div>
