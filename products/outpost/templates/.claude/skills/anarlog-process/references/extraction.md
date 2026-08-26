# Entity Extraction Signals

Reference for `anarlog-process` Steps 3 and 4. Combine the meeting's note and
summary (prefer the summary when both exist).

## People

Look for names in:

- Note text ("chat with Sarah Chen", "interview with David Kim").
- Summary bullets ("the user will serve as the senior engineer", "Alex from the
  platform team").
- The meeting's `participants` (from `meetings get`) — a hint only. Confirm
  each person from the note or summary text.

For each name, resolve it against the knowledge index (Step 0). Extract the
role, the organization, and the relationship to the user. Note what they
discussed.

## Organizations

Look for explicit mentions ("Acme Corp"). Also infer an organization from a
person's role or from the context.

## Projects

Look for explicit project names ("Customer Portal", "Q2 Migration"). Also look
for initiatives that the text describes ("the hiring pipeline", "the product
launch").

## Topics

Look for themes that repeat ("AI coding agents", "interview process",
"architecture decisions"). Only create a Topic note when the subject spans
multiple meetings or is strategically important.

## Self-exclusion

Never create or update a note for the user. Match against the name, the email,
or the `@domain` from `~/.cache/fit/outpost/state/identity.md`.

## Interview sessions (special case)

If the title or the note says "interview with {Name}", the interviewee is a
**candidate**. Create or update their note in `Knowledge/Candidates/` with the
candidate brief template from `req-track`. **Never** write it in
`Knowledge/People/`.

Also write the full transcript to
`Knowledge/Candidates/{Name}/transcript-{date}.md` (SKILL.md Steps 2 and 5).
This is the input `req-assess` waits on to move the candidate to Stage 2. It
is separate from the extraction above: persist the transcript file verbatim
and never mine it for entities.

## Content signals

### Decisions

"decided", "agreed", "plan to", "established", "will serve as".

### Commitments / action items

"will share", "plans to", "needs to", "to be created", "will upload". Extract
the owner, the action, the deadline (if any), and the status (default `open`).

### Key facts

Look for specific numbers (headcount, budget, timeline) and preferences
("non-traditional backgrounds"). Look for process details (interview stages,
evaluation criteria) and strategic context (market trends, competitive
landscape). Skip filler.

### Activity summary

One line per session per entity:

```markdown
- **2026-02-14** (meeting): Discussed hiring pipeline. 11 internal
  candidates, plan to shortlist to 6-7. [[People/Sarah Chen]] managing
  the team.
```

### Interview notes (for candidates)

Add these to the candidate's `## Notes` section: impressions, the technical
assessment, strengths and concerns, and any interview scores or decisions.

## Linking rules

Use absolute paths everywhere: `[[People/Name]]`, `[[Organizations/Name]]`,
`[[Projects/Name]]`, `[[Priorities/Priority Name]]`.

When meeting content references an existing Priority, follow the linking
rules in `extract-entities` Step 7c. Update the progress and add the backlinks.
**Never** auto-create Priority notes.
