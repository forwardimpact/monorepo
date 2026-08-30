# Priority Templates

`extract-entities` **never auto-creates** Priorities. The user sets them
deliberately. Use this template only for a note you write by hand.
`extract-entities` and `anarlog-process` only **link to** and **update progress
on** existing notes.

## Priorities

```markdown
---
type: priority
created: {YYYY-MM-DD}
updated: {YYYY-MM-DD}
---

# {Priority Name}

## About
{2-3 sentences: what this strategic direction means and why it matters}

**Status:** {active|paused|retired}
**Owner:** [[3-Team/People/{Person}]]
**Set:** {YYYY-MM-DD}

## What this means
{Bullet list of concrete implications — what does pursuing this priority look like?}

## Actions
{Concrete, time-bound actions that ladder to this priority. Targets live inline
here — there is no separate Goals entity.}

## Projects
- [[3-Team/Projects/{Project}]] — {relationship}

## Key facts
{substantive facts only — leave empty if none}
```
