# Entity Extraction Signals

Reference for `hyprnote-process` Steps 3 and 4. Combine `_memo.md` and
`_summary.md` (prefer the summary when both exist).

## People

Look for names in:

- Memo text ("chat with Sarah Chen", "interview with David Kim").
- Summary bullets ("the user will serve as the senior engineer", "Alex from the
  platform team").
- `_meta.json` participants.

For each: resolve against the knowledge index (Step 0); extract role,
organization, relationship to the user; note what was discussed.

## Organizations

Explicit mentions ("Acme Corp"), or inferred from people's roles or the
surrounding context.

## Projects

Explicit project names ("Customer Portal", "Q2 Migration") or described
initiatives ("the hiring pipeline", "the product launch").

## Topics

Recurring themes ("AI coding agents", "interview process", "architecture
decisions"). Only create a Topic note when the subject spans multiple meetings
or is strategically important.

## Self-exclusion

Never create or update a note for the user — match against name, email, or
`@domain` from `~/.cache/fit/outpost/state/identity.md`.

## Interview sessions (special case)

If the title or memo indicates "interview with {Name}", the interviewee is a
**candidate** — create or update their note in `knowledge/Candidates/` (using
the candidate brief template from `req-track`), **not** in `knowledge/People/`.

## Content signals

### Decisions

"decided", "agreed", "plan to", "established", "will serve as".

### Commitments / action items

"will share", "plans to", "needs to", "to be created", "will upload". Extract
owner, action, deadline (if any), status (default `open`).

### Key facts

Specific numbers (headcount, budget, timeline), preferences ("non-traditional
backgrounds"), process details (interview stages, evaluation criteria),
strategic context (market trends, competitive landscape). Skip filler.

### Activity summary

One line per session per entity:

```markdown
- **2026-02-14** (meeting): Discussed hiring pipeline. 11 internal
  candidates, plan to shortlist to 6-7. [[People/Sarah Chen]] managing
  the team.
```

### Interview notes (for candidates)

Add to the candidate's `## Notes` section: impressions, technical assessment,
strengths and concerns, any interview scoring or decisions.

## Linking rules

Use absolute paths everywhere: `[[People/Name]]`, `[[Organizations/Name]]`,
`[[Projects/Name]]`, `[[Goals/Goal Name]]`, `[[Priorities/Priority Name]]`.

When meeting content references an existing Goal or Priority, follow the linking
rules in `extract-entities` Step 7c — update progress and add backlinks, but
**never** auto-create Goal or Priority notes.
