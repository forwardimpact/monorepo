# Condition Template

Conditions are time-bound organizational states that affect multiple entities.
They can be **auto-created** by the librarian agent when cross-cutting patterns
are detected, or manually created by the user. Lifecycle: active → resolved.

```markdown
# {Condition Name}

## Info
**Status:** {active|resolved}
**Since:** {YYYY-MM-DD}
**Resolved:** {YYYY-MM-DD or —}
**Trigger:** {What caused this condition}
**Blocker:** {Who/what must act for this to resolve}
**Resolution signal:** {What would indicate this condition has ended}

## Affects
{Priorities, Projects, Roles, and People impacted by this condition}
- [[Priorities/{Priority}]] — {how it's affected}
- [[Projects/{Project}]] — {how it's affected}
- [[Roles/{Role}]] — {how it's affected}

## Agent implications
{How agents should modify their behavior while this condition is active}
- **recruiter:** {e.g. "Hold offers. Continue interviews. Contractor route viable."}
- **postman:** {e.g. "Don't flag recruitment emails as urgent."}
- **chief-of-staff:** {e.g. "Surface in every briefing until resolved."}
- **head-hunter:** {e.g. "Continue scouting but note freeze in prospect notes."}

## Activity
- **{YYYY-MM-DD}** ({source}): {Update — new information, escalation, progress toward resolution}

## Key facts
{substantive facts only — leave empty if none}
```
