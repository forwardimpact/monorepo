# Grounded Theory Analysis Report Template

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
