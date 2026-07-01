---
name: anarlog-follow
description: >
  Follow a live Anarlog session in real-time, coaching the user through a
  meeting or interview. Understands context from the session title, knowledge
  base, and candidate pipeline. Provides talking points, flags gaps in
  coverage, and suggests follow-up questions as the conversation unfolds.
  Use when the user asks to follow, shadow, or coach them through a live meeting.
---

# Anarlog Follow

Follow a live Anarlog recording, read the transcript as it grows, and coach the
user through the meeting in real time. Gather knowledge-base context once before
the session, then poll the transcript and provide actionable nudges as new
content appears.

## Trigger

- The user asks to follow, shadow, or coach them through a live meeting.
- "Follow my meeting", "coach me", "shadow this call".
- The user starts a Anarlog recording and wants real-time support.

## Prerequisites

- Anarlog installed; sessions at
  `~/Library/Application Support/anarlog/sessions/`.
- An active or about-to-start session.
- Knowledge base populated (attendee / candidate context).

## Inputs

- Live `transcript.json` (growing during the session).
- `Knowledge/People/`, `Knowledge/Candidates/{Name}/{brief,screening,panel}.md`,
  `Knowledge/Roles/`, `Knowledge/Organizations/`, `Knowledge/Projects/`.
- `~/.cache/fit/outpost/apple_calendar/*.json` for context.

## Outputs

- Real-time coaching messages printed to the user.
- **No files are written.** This skill is purely advisory.

<do_confirm_checklist goal="Verify the follow session was useful and read-only">

- [ ] Active session detected and confirmed with the user.
- [ ] Meeting type classified from the title.
- [ ] Knowledge-base context gathered for all attendees.
- [ ] For interviews: standard expectations and screening focus areas loaded.
- [ ] Coaching nudges were actionable and concise (1–3 lines each).
- [ ] Coverage gaps tracked and surfaced before the meeting ended.
- [ ] End-of-meeting detected; debrief provided.
- [ ] Next steps offered (`req-assess` / `anarlog-process`); user decided
      whether to run them.
- [ ] No files were modified during the session.

</do_confirm_checklist>

## Procedure

### Phase 1 — Detect and connect

#### 1. Find the active session

```bash
node .claude/skills/anarlog-follow/scripts/follow.mjs --detect
```

Returns the most recently modified session, whether it's live, and its title. If
nothing has been modified in the last 5 minutes, warn the user and ask whether
to follow a specific session. If multiple sessions could be active, confirm with
the user.

#### 2. Read session metadata

```bash
node .claude/skills/anarlog-follow/scripts/follow.mjs <session-id> --meta
```

Capture **title**, **created_at**, **participants**.

#### 3. Classify the meeting type

Title pattern → type → coaching focus:
[references/meeting-types.md](references/meeting-types.md). The type drives
Phase 2 context loading and Phase 3 dimensions.

### Phase 2 — Gather context (once)

#### 4. Resolve attendees

Extract names from title and participant list. For each:

```bash
rg -l "{name}" Knowledge/People/
rg -l "{name}" Knowledge/Candidates/
```

Read matching notes for role, organization, history, open items, prior
interactions.

#### 5. Load type-specific context

**Interviews:** read `Knowledge/Candidates/{Name}/{brief,screening,panel}.md`,
look up the `Req` field's matching `Knowledge/Roles/*.md` file (check the
`**Status:**` field for context), and load standard expectations:

```bash
bunx fit-pathway job {discipline} {level} --track={track}
```

**General meetings:** read attendee People notes plus referenced
Project/Organization notes. Check open tasks: `rg "{name}" Knowledge/Tasks/`.

#### 6. Build the coaching brief

Synthesize gathered context into the pre-meeting brief format in
[references/coaching.md](references/coaching.md#pre-meeting-brief-format) and
print it to the user.

### Phase 3 — Follow loop

#### 7. Read new transcript content

First read (no `--after`):

```bash
node .claude/skills/anarlog-follow/scripts/follow.mjs <session-id>
```

Subsequent reads (pass the last word ID):

```bash
node .claude/skills/anarlog-follow/scripts/follow.mjs <session-id> --after <last-word-id>
```

Returns JSON with grouped text segments, channel labels, and the next last-word
ID.

#### 8. Analyze new content

Track the dimensions in
[references/coaching.md](references/coaching.md#dimensions-to-track) — interview
vs. general — and apply the [principles](references/coaching.md#principles) and
[constraints](references/coaching.md#constraints).

#### 9. Provide coaching

Output only when actionable. Use the
[coaching output formats](references/coaching.md#coaching-output-formats). Keep
each nudge 1–3 lines.

#### 10. Detect meeting end

Watch for: farewells ("bye", "take care", "have a good day"), wrap-up phrases
("that's all", "let's wrap", "I'll let you go"), or final thank-yous with no
substantive follow-up. When detected, move to Phase 4.

#### 11. Loop cadence

**Do not use `sleep` or timed loops.** After each coaching output, read the next
batch immediately — natural cadence emerges from read/analyze/output. On two
consecutive empty reads, ask the user whether the meeting has ended.

### Phase 4 — Wrap-up

#### 12–13. Debrief

Use the appropriate template in [references/debrief.md](references/debrief.md) —
interview vs. general.

#### 14. Offer next steps

Offer (don't ask) the follow-ups in
[references/debrief.md](references/debrief.md#next-step-offers-step-14).
