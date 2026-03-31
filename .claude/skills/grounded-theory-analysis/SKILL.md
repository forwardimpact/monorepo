---
name: grounded-theory-analysis
description: >
  Analyze Claude Code execution traces using grounded theory methodology.
  Extract patterns from raw trace data without preconceived categories, then
  build up themes through open coding, axial coding, and selective coding. Use
  when studying agent behaviour from workflow trace artifacts.
---

# Grounded Theory Analysis for Agent Traces

Analyze Claude Code execution traces to discover patterns, failures, and
improvement opportunities. The method is adapted from grounded theory: start
with raw data, build codes from observations, group codes into themes, and
derive actionable findings — never impose categories before examining the data.

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

## Process

### Phase 1: Open Coding

Read through the trace sequentially. For each turn, create a **code** — a short
label describing what happened. Do not use pre-defined categories. Let the codes
emerge from the data.

Focus on:

- **What the agent did** — Which tools it called, what commands it ran, what
  files it read or wrote
- **What happened** — Success, failure, partial success, unexpected output
- **How the agent reacted** — Did it retry? Change approach? Escalate? Give up?
- **What the agent said** — Reasoning text between tool calls reveals intent and
  decision-making

Example codes from a real trace:

```
turn-03: auth-check-passed        — gh auth status succeeded
turn-07: branch-behind-main       — PR detected as 11 commits behind
turn-12: rebase-succeeded         — git rebase origin/main completed
turn-13: push-permission-denied   — git push returned 403
turn-14: retry-with-auth-setup    — agent ran gh auth setup-git
turn-15: duplicate-auth-header    — push failed with 400 (two credentials)
turn-16: retry-failed-again       — same error on second attempt
turn-17: graceful-degradation     — agent commented on PR with manual instructions
```

### Phase 2: Axial Coding

Group related codes into **categories**. Look for relationships:

- **Causal chains** — A leads to B leads to C (permission denied → retry →
  duplicate header → failure)
- **Repeated patterns** — The same code appears across multiple turns or
  multiple traces
- **Contrasts** — The same operation succeeded in one context but failed in
  another (why?)
- **Temporal patterns** — Things that happen early vs. late in a session,
  patterns in tool call ordering

Example categories:

```
CREDENTIAL_MISMATCH
  - push-permission-denied (turn 13)
  - retry-with-auth-setup (turn 14)
  - duplicate-auth-header (turn 15)
  Root: checkout token differs from GH_TOKEN

SUCCESSFUL_WORKTREE_PUSH
  - worktree-push-succeeded (turns 20, 25, 30)
  Contrast: main-repo push failed, worktree pushes succeeded

WASTED_RETRIES
  - retry-failed-again (turn 16)
  - second-auth-reconfigure (turn 17)
  Pattern: agent retried identical failing operation 3 times
```

### Phase 3: Selective Coding

Identify the **core themes** — the central findings that explain the most
important patterns in the data. Each theme should be:

- **Grounded** — directly traceable to specific turns in the trace
- **Actionable** — implies a concrete change to workflow, skill, or
  infrastructure
- **Evidenced** — includes token counts, error messages, or timing data

For each theme, determine:

1. **What happened** — factual description with turn references
2. **Why it happened** — root cause analysis based on trace evidence
3. **Impact** — cost in tokens, time, or failed outcomes
4. **Recommendation** — specific change to prevent recurrence

### Phase 4: Cross-Trace Patterns (when analyzing multiple traces)

When analyzing traces from multiple workflow runs:

- **Compare** — Do the same categories appear across traces?
- **Trend** — Are costs increasing, decreasing, or stable?
- **Divergence** — Did the same workflow behave differently across runs? Why?
- **Saturation** — When new traces stop producing new codes, the analysis is
  complete for this cycle

## Output Format

Structure findings as:

```markdown
## Trace Analysis: <workflow-name> (Run <run-id>)

### Summary
- **Outcome**: <success|partial|failure>
- **Cost**: $X.XX | **Turns**: NN | **Duration**: Xm Xs
- **Tokens**: NNN,NNN in / NN,NNN out

### Codes (sequential)
| Turn | Code                     | Detail                              |
| ---- | ------------------------ | ----------------------------------- |
| 3    | auth-check-passed        | gh auth status → logged in          |
| 13   | push-permission-denied   | git push → 403 github-actions[bot]  |

### Categories
#### CATEGORY_NAME
- Codes: turn-13, turn-14, turn-15
- Root cause: ...
- Impact: ...

### Themes
#### 1. Theme Name
- **What**: ...
- **Why**: ...
- **Impact**: ...
- **Recommendation**: trivial fix | spec needed | observation
- **Evidence**: turn NN — `<quoted error or command>`
```

## Analysis Principles

- **Let the data speak.** Do not start with a hypothesis. Read the trace, create
  codes, then look for patterns. Preconceived categories cause you to miss
  unexpected findings.
- **Quote, don't paraphrase.** When citing evidence, use exact error messages,
  command text, or token counts from the trace. Approximate language weakens
  findings.
- **Distinguish symptoms from causes.** A "permission denied" error is a
  symptom. The cause might be a missing workflow permission, a misconfigured
  token, or a branch protection rule. Follow the causal chain.
- **Count what matters.** Token usage, retry counts, wasted turns, and cost are
  objective measures. Use them to prioritize findings.
- **Compare to intent.** Read the agent's skill documentation to understand what
  it was supposed to do, then compare to what it actually did. Gaps between
  intent and execution are findings.
- **Recognize saturation.** When analyzing multiple traces, stop when new traces
  stop producing new codes. More data past saturation adds noise, not insight.
