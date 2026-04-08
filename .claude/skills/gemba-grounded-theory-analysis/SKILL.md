---
name: gemba-grounded-theory-analysis
description: >
  Analyze Claude Code execution traces using grounded theory methodology.
  Extract patterns from raw trace data without preconceived categories, then
  build up themes through open coding, axial coding, and selective coding. Use
  when studying agent behaviour from workflow trace artifacts.
phase: Study
---

# Grounded Theory Analysis for Agent Traces

Analyze Claude Code execution traces using grounded theory methodology adapted
from Strauss & Corbin. Treat trace data as qualitative text: start with raw
observations, build codes from the data's own language, relate codes through a
paradigm model, and converge on a core category that explains the central
phenomenon. The output is a substantive theory of what happened and why — not a
list of bugs.

## When to Use

- After downloading trace artifacts from agent workflow runs
- When investigating why a workflow partially failed or behaved unexpectedly
- When looking for efficiency improvements across multiple runs
- As part of an improvement coaching cycle

## Input

The primary input is a structured trace produced by `fit-eval`:

```sh
bunx fit-eval output --format=json < trace.ndjson > structured.json
```

The structured trace contains **metadata** (session ID, model, tools, permission
mode), **turns** (assistant messages + tool calls/results), and a **summary**
(outcome, cost, duration, tokens).

When the structured trace lacks detail, refer back to the raw NDJSON.

### Handling Large Traces

Use `scripts/trace-queries.sh` to extract sections from large traces:

```sh
bash .claude/skills/gemba-grounded-theory-analysis/scripts/trace-queries.sh structured.json overview
bash .claude/skills/gemba-grounded-theory-analysis/scripts/trace-queries.sh structured.json batch 0 20
bash .claude/skills/gemba-grounded-theory-analysis/scripts/trace-queries.sh structured.json errors
bash .claude/skills/gemba-grounded-theory-analysis/scripts/trace-queries.sh structured.json tools
```

Commands: `overview`, `count`, `batch N M`, `tail N`, `errors`, `tools`.

## Process

### Phase 1: Open Coding

Read through the trace sequentially, turn by turn. For each meaningful unit (a
tool call, a decision point, a failure, a recovery), assign a **code** — a short
label that captures what happened in the data's own terms.

**Use in-vivo codes** — labels drawn from the trace's own language (error
messages, command names, the agent's reasoning text). Do not use pre-defined
categories. Let codes emerge from the data.

Focus on: what the agent did, what happened, how the agent reacted, and what the
agent said (reasoning text between tool calls reveals intent).

**Write memos** as you code. A memo is a short analytical note recording your
thinking — why a code surprised you, a tentative connection between codes, or a
question the data raises. Memos are the engine of theory development.

See `references/examples.md` for worked open coding and memo examples.

### Phase 2: Axial Coding

Relate codes using the **paradigm model**:

```
Causal conditions → Phenomenon → Context → Actions/Interactions → Consequences
```

Group related codes into **categories**. For each category, fill in all five
paradigm elements: what triggered it, what it is, what context shaped it, what
was done, and what resulted.

Look for relationships across categories: causal chains, repeated patterns,
contrasts (same operation succeeded/failed in different contexts), and temporal
patterns (early vs. late in session).

See `references/examples.md` for a worked axial coding example.

### Phase 3: Selective Coding

Identify the **core category** — the single central phenomenon that integrates
the most categories and explains the most variance. All other categories should
relate to it.

The core category is not the biggest bug or the most expensive failure. It is
the conceptual thread that connects the most findings. Ask: which category do
others orbit around? What is the "story" this trace tells?

From the core category, derive **theoretical propositions** — testable
statements about agent behaviour. Each proposition must be **grounded**
(traceable to specific turns), **testable** (future traces can confirm/refute),
and **actionable** (implies a concrete change).

See `references/examples.md` for a worked selective coding example.

### Phase 4: Cross-Trace Patterns

When analyzing multiple traces, apply **constant comparison** against prior
analyses. Track trends (costs, success rates), divergence (same workflow,
different behaviour), and **theoretical saturation** — when new traces stop
producing new codes, state it explicitly.

## Output

Use the report template in `references/report-template.md`. Structure the report
as a grounded theory analysis, not an incident report.

## Analysis Principles

- **Let the data speak.** Do not start with a hypothesis. Read, code, then find
  patterns.
- **Write memos constantly.** Analysis without memos is just sorting.
- **Use in-vivo codes.** Preserve the data's own language. "403 forbidden", not
  "authorization failure".
- **Apply the paradigm model.** Incomplete paradigms indicate incomplete
  analysis.
- **Seek the core category.** The goal is a theory, not a list.
- **Quote, don't paraphrase.** Exact error messages, commands, token counts.
- **Distinguish symptoms from causes.** The paradigm model forces you to trace
  causal conditions.
- **Count what matters.** Token usage, retry counts, wasted turns, cost.
- **Compare to intent.** Read the skill docs, compare to actual execution.
- **Recognize saturation.** More data past saturation adds noise, not insight.
- **Maintain traceability.** Proposition → category → code → turn number.
