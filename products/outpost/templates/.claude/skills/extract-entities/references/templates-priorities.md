# Priority Templates

Priorities are **never auto-created** by `extract-entities`. They are set
deliberately by the user. This template is for manual creation only —
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

## Actions
{Concrete, time-bound actions that ladder to this priority. Targets live inline
here — there is no separate Goals entity.}

## Projects
- [[Projects/{Project}]] — {relationship}

## Key facts
{substantive facts only — leave empty if none}
```
