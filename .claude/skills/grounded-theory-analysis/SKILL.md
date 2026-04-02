---
name: grounded-theory-analysis
description: >
  Analyze Claude Code execution traces using grounded theory methodology.
  Extract patterns from raw trace data without preconceived categories, then
  build up themes through open coding, axial coding, and selective coding. Use
  when studying agent behaviour from workflow trace artifacts.
---

# Grounded Theory Analysis for Agent Traces

Analyze Claude Code execution traces using grounded theory methodology adapted
from Strauss & Corbin. The method treats trace data as qualitative text: start
with raw observations, build codes from the data's own language, relate codes
through a paradigm model, and converge on a core category that explains the
central phenomenon. The output is a substantive theory of what happened and why
— not a list of bugs.

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

The structured trace contains:

- **metadata** — session ID, model, tools available, permission mode
- **turns** — sequence of assistant messages (text + tool calls) and tool
  results
- **summary** — outcome, cost, duration, token usage

When the structured trace lacks detail, refer back to the raw NDJSON for the
full event stream.

### Handling Large Traces

Structured traces often exceed file size limits (256KB). Use `jq` to extract
sections:

```sh
# Extract metadata and summary
jq '.metadata, .summary' structured.json

# Count turns
jq '.turns | length' structured.json

# Read turns in batches
jq '.turns[0:20]' structured.json   # First 20 turns
jq '.turns[50:70]' structured.json  # Turns 50-70
jq '.turns[-10:]' structured.json   # Last 10 turns

# Find errors
jq '.turns[] | select(.role == "tool_result" and .isError == true) | {index, content: .content[0:200]}' structured.json

# Count tool usage
jq '[.turns[] | select(.role == "assistant") | .content[] | select(.type == "tool_use") | .name] | group_by(.) | map({tool: .[0], count: length}) | sort_by(-.count)' structured.json
```

## Process

### Phase 1: Open Coding

Read through the trace sequentially, turn by turn. For each meaningful unit (a
tool call, a decision point, a failure, a recovery), assign a **code** — a short
label that captures what happened in the data's own terms.

**Use in-vivo codes** — labels drawn from the trace's own language (error
messages, command names, the agent's reasoning text). In-vivo codes preserve the
data's meaning and resist analyst bias.

Do not use pre-defined categories. Let codes emerge from the data.

Focus on:

- **What the agent did** — Which tools it called, what commands it ran, what
  files it read or wrote
- **What happened** — Success, failure, partial success, unexpected output
- **How the agent reacted** — Did it retry? Change approach? Escalate? Give up?
- **What the agent said** — Reasoning text between tool calls reveals intent and
  decision-making

Example codes from a real trace:

```
turn-03: "logged in to github.com"   — gh auth status succeeded
turn-07: "11 commits behind"         — PR detected as stale
turn-12: rebase-completed            — git rebase origin/main succeeded
turn-13: "403 forbidden"             — git push returned permission denied
turn-14: setup-git-retry             — agent ran gh auth setup-git
turn-15: "two credentials supplied"  — push failed with duplicate auth header
turn-16: identical-retry             — same push command, same error
turn-17: commented-manual-steps      — agent commented on PR with manual instructions
```

**Write memos** as you code. A memo is a short analytical note recording your
thinking — why a code surprised you, a tentative connection between codes, or a
question the data raises. Memos are the engine of theory development; they
capture emerging ideas before they're lost. Write them inline as you encounter
them, not as an afterthought.

Example memo:

> **Memo (turn 15):** The agent received a clear error message ("two credentials
> supplied") but did not investigate _which_ two credentials were in play. It
> retried the same operation instead. This suggests the agent's error-handling
> repertoire is limited to retry — it lacks a "diagnose credential conflict"
> skill. Compare to turn 12 where it successfully recovered from a different
> error by changing approach. What distinguishes recoverable from
> non-recoverable errors in the agent's behaviour?

### Phase 2: Axial Coding

Relate codes to each other using the **paradigm model** — a structured way of
asking how categories connect:

```
Causal conditions  →  Phenomenon  →  Context  →  Actions/Interactions  →  Consequences
(what triggered it)   (what is it)   (where)     (what was done)          (what resulted)
```

Group related codes into **categories**. For each category, fill in the
paradigm:

- **Causal conditions** — What triggered this pattern? (a missing permission, a
  stale branch, an ambiguous skill instruction)
- **Phenomenon** — What is the core event or pattern? Name it.
- **Context** — What environmental conditions shaped it? (CI environment, token
  type, workflow permissions, time pressure)
- **Actions/Interactions** — What did the agent do in response? What strategies
  did it use?
- **Consequences** — What was the outcome? (wasted tokens, failed task,
  successful workaround, degraded output)

Example:

```
Category: CREDENTIAL_CONFLICT_LOOP

Causal conditions:
  - Checkout token (GITHUB_TOKEN) configured git credentials at clone time
  - GH_TOKEN (App installation token) set separately for API calls
  - Agent invoked `gh auth setup-git`, adding a second credential

Phenomenon:
  - Git push fails because two credential helpers supply conflicting tokens

Context:
  - Happens only when pushing to the main repo (not worktrees)
  - Worktree pushes use a fresh clone with a single credential

Actions/Interactions:
  - Agent retried the push 3 times with the same configuration (turn 14–16)
  - Agent did not inspect git credential config
  - Agent fell back to commenting on the PR (turn 17)

Consequences:
  - 3 wasted turns (≈4,200 tokens)
  - PR left un-pushed; manual intervention required
  - Agent's fallback preserved the PR from being abandoned entirely
```

Look for relationships across categories:

- **Causal chains** — A leads to B leads to C
- **Repeated patterns** — The same phenomenon across different contexts
- **Contrasts** — The same operation succeeded in one context but failed in
  another
- **Temporal patterns** — Things that happen early vs. late in a session

### Phase 3: Selective Coding

Identify the **core category** — the single central phenomenon that integrates
the most categories and explains the most variance in the trace. All other
categories should relate to it.

The core category is not the biggest bug or the most expensive failure. It is
the conceptual thread that, when pulled, connects the most findings. Ask:

- Which category do other categories orbit around?
- If I could change one thing about this system, which category would that
  address?
- What is the "story" this trace tells?

From the core category, derive **theoretical propositions** — testable
statements about agent behaviour:

```
Core category: INADEQUATE ERROR DIAGNOSIS

Propositions:
1. When the agent encounters an error it has not seen before, it defaults to
   retrying the same operation rather than investigating the error's cause.
2. The agent's recovery success rate correlates with whether the error message
   maps to a known pattern in its skill documentation.
3. Adding diagnostic steps to skill error-handling sections would reduce wasted
   retry turns by an estimated 40-60% for credential-related failures.
```

Each proposition must be:

- **Grounded** — traceable to specific codes, categories, and turn numbers
- **Testable** — future traces can confirm or refute it
- **Actionable** — implies a concrete change to skills, workflows, or
  infrastructure

### Phase 4: Cross-Trace Patterns (when analyzing multiple traces)

When analyzing traces from multiple workflow runs:

- **Constant comparison** — Compare new codes and categories against those from
  previous traces. Does the same core category appear? Do propositions hold?
- **Trend** — Are costs increasing, decreasing, or stable?
- **Divergence** — Did the same workflow behave differently across runs? Why?
- **Theoretical saturation** — When new traces stop producing new codes or
  categories, the theory is saturated for this phenomenon. State this
  explicitly: "After N traces, no new codes emerged for [category]. Analysis is
  saturated." More data past saturation adds noise, not insight.

## Output: The Analysis Report

Structure the report as a grounded theory analysis, not an incident report.

```markdown
## Grounded Theory Analysis: <workflow-name> (Run <run-id>)

### Trace Overview
| Field     | Value                              |
| --------- | ---------------------------------- |
| Workflow  | <name>                             |
| Run ID    | <id>                               |
| Date      | <date>                             |
| Outcome   | <success / partial / failure>      |
| Cost      | $X.XX                              |
| Turns     | NN                                 |
| Tokens    | NNN,NNN in / NN,NNN out            |
| Duration  | Xm Xs                              |

### Memos

> **Memo (turn NN):** <Analytical reflection — what surprised you, what
> connection you noticed, what question the data raises.>

> **Memo (turn NN):** ...

<Include all memos written during open coding. These are the analytical
backbone of the report — they show how the theory developed.>

### Open Codes

| Turn | In-Vivo Code                  | Detail                              |
| ---- | ----------------------------- | ----------------------------------- |
| 3    | "logged in to github.com"     | gh auth status → authenticated      |
| 13   | "403 forbidden"               | git push → permission denied        |
| 15   | "two credentials supplied"    | duplicate auth header on push       |

<List all codes assigned during Phase 1. Use the data's own language for
in-vivo codes. Include enough codes to support the categories — not every
turn needs a code, but every significant event does.>

### Categories (Axial Coding)

#### CATEGORY_NAME
- **Causal conditions**: <what triggered this pattern>
- **Phenomenon**: <the core event, named>
- **Context**: <environmental factors>
- **Actions/Interactions**: <what the agent did>
- **Consequences**: <what resulted — with token counts, turn numbers>
- **Codes**: turn-NN, turn-NN, turn-NN

#### CATEGORY_NAME
...

### Core Category & Propositions (Selective Coding)

**Core category: <NAME>**

<One paragraph explaining the core category — the central phenomenon that
integrates the most categories. Explain why this category, not another, is
the core. Reference the categories it connects.>

**Propositions:**

1. <Testable statement about agent behaviour, grounded in specific turns.>
2. <Testable statement...>
3. <Testable statement...>

### Actionable Findings

<Translate propositions into concrete actions. Each finding traces back
to a proposition, which traces to categories, which trace to codes, which
trace to specific turns. This traceability chain is the report's integrity.>

| # | Proposition | Category | Finding                           | Action            |
| - | ----------- | -------- | --------------------------------- | ----------------- |
| 1 | P1          | CRED_... | Agent lacks credential diagnostic | Spec: skill update |
| 2 | P3          | WASTE_.. | 3 identical retries, no backoff   | Fix: add retry cap |
| 3 | —           | —        | High token usage in triage phase  | Observe            |

### Saturation Notes

<State whether this analysis reached saturation or whether more traces are
needed. If prior analyses exist, note whether the same core category
appeared and whether propositions held or were revised.>
```

## Analysis Principles

- **Let the data speak.** Do not start with a hypothesis. Read the trace, create
  codes, then look for patterns. Preconceived categories cause you to miss
  unexpected findings.
- **Write memos constantly.** Memos capture your evolving understanding. A
  grounded theory analysis without memos is just sorting — the memos are where
  theory happens.
- **Use in-vivo codes.** Preserve the data's own language. When the trace says
  "403 forbidden", code it as "403 forbidden", not "authorization failure".
  Analyst-imposed labels obscure what actually happened.
- **Apply the paradigm model.** Every category should answer: what caused it,
  what is it, what context shaped it, what was done, and what resulted.
  Incomplete paradigms indicate incomplete analysis.
- **Seek the core category.** The goal is not a list of findings — it is a
  theory. The core category is the conceptual center that makes sense of
  everything else. If your analysis has no core category, you stopped at axial
  coding.
- **Quote, don't paraphrase.** When citing evidence, use exact error messages,
  command text, or token counts from the trace. Approximate language weakens
  findings.
- **Distinguish symptoms from causes.** A "permission denied" error is a
  symptom. The cause might be a missing workflow permission, a misconfigured
  token, or a branch protection rule. The paradigm model forces you to trace
  causal conditions.
- **Count what matters.** Token usage, retry counts, wasted turns, and cost are
  objective measures. Use them to ground propositions in evidence.
- **Compare to intent.** Read the agent's skill documentation to understand what
  it was supposed to do, then compare to what it actually did. Gaps between
  intent and execution are findings.
- **Recognize saturation.** When new traces stop producing new codes, state it.
  More data past saturation adds noise, not insight.
- **Maintain traceability.** Every proposition traces to categories, every
  category to codes, every code to a turn number. If you cannot trace a finding
  back to the data, it is speculation, not grounded theory.
