# Content Extraction

Reference for `extract-entities` Step 6 (extract content) and Step 7 (detect
state changes).

## Decisions

Signals: "We decided…", "We agreed…", "Let's go with…", "Approved", "Confirmed".

## Commitments

Signals: "I'll…", "We'll…", "Can you…", "Please send…", "By Friday".

Extract owner, action, deadline (if mentioned), status (`open`).

## Key facts — substantive only

Specific numbers (budget, team size, timeline), preferences, work style,
background, technical requirements, what people discussed or proposed.

**Never include:** meta-commentary about missing data, placeholder text, or
data-quality observations. If no key facts exist, leave the section empty.

## Open items — commitments only

```markdown
- [ ] Send API documentation — by Friday
- [ ] Schedule follow-up call with CTO
```

**Never include:** "find their email", "add their role", "research company
background".

## Activity — one line per source

```markdown
- **2025-01-15** (meeting): Kickoff for [[Projects/Acme Integration]]. [[People/David Kim]] needs API access.
```

Always use canonical names with absolute paths (`[[People/Name]]`,
`[[Organizations/Name]]`).

## Summary — relationship over method

Write 2–3 sentences that answer: "Who is this person and why do I know them?"

- **Good:** "VP Engineering at [[Organizations/Acme Corp]] leading the
  [[Projects/Acme Integration]] pilot."
- **Bad:** "Attendee on the scheduled meeting (Aug 12, 2024)."

## State-change tables

### Project status

| Signal                                | New status |
| ------------------------------------- | ---------- |
| "approved" / "signed" / "green light" | active     |
| "on hold" / "pausing" / "delayed"     | on hold    |
| "cancelled" / "not proceeding"        | cancelled  |
| "launched" / "completed" / "shipped"  | completed  |
| "exploring" / "considering"           | planning   |

### Open-item resolution

| Signal                       | Action          |
| ---------------------------- | --------------- |
| "Here's the X you requested" | Mark X complete |
| "I've sent the X"            | Mark X complete |
| "X is done" / "X is ready"   | Mark X complete |

Change `- [ ]` → `- [x]` with completion date.

### Role / title

- New title in email signature.
- "I've been promoted to…".
- Different role than what's in the note.

### Relationship

- "I've joined [New Company]".
- "We signed the contract" → prospect → customer.
- New email domain for a known person.

## Conservatism

Only apply clear, unambiguous state changes. If you are uncertain, add to
activity but don't change fields.

Log changes inline:

```markdown
- **2025-01-20** (email): Leadership approved pilot. [Status → active]
```

## Duplicate check (Step 8)

Before you write:

- Look at the Activity section for an existing entry on this date from this
  source.
- Compare key facts, then skip duplicates.
- Don't add the same open item twice.
- If new info contradicts the existing info, keep both with
  "(needs clarification)".
