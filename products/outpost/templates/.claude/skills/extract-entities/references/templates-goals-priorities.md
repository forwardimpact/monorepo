# Goal and Priority Templates

Goals and Priorities are **never auto-created** by `extract-entities`. They are
set deliberately by the user. These templates are for manual creation only —
`extract-entities` and `anarlog-process` only **link to** and **update progress
on** existing notes.

## Priorities

```markdown
# {Priority Name}

## About
{2-3 sentences: what this strategic direction means and why it matters}

**Status:** {active|paused|retired}
**Owner:** [[People/{Person}]]
**Set:** {YYYY-MM-DD}

## What this means
{Bullet list of concrete implications — what does pursuing this priority look like?}

## Goals
{Time-bound targets that ladder to this priority — backlinks to knowledge/Goals/}

## Projects
- [[Projects/{Project}]] — {relationship}

## Key facts
{substantive facts only — leave empty if none}
```

## Goals

```markdown
# {Goal Name}

## Info
**Priority:** [[Priorities/{Priority}]]
**Status:** {on track|at risk|off track|achieved|abandoned}
**Owner:** [[People/{Person}]]
**Target date:** {YYYY-MM-DD}
**Set:** {YYYY-MM-DD}

## Outcome
{1-2 sentences: what measurable success looks like}

## Blockers
{Active Conditions that impede this goal — link to knowledge/Conditions/}
- [[Conditions/{Condition}]] — {impact on this goal}

## Projects
- [[Projects/{Project}]] — {how it contributes}

## Progress
- **{YYYY-MM-DD}**: {Update on progress toward the outcome}

## Key facts
{substantive facts only — leave empty if none}

## Risks
{known risks to achieving this goal — leave empty if none}
```
