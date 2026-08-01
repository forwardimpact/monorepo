---
name: anarlog-follow
description: >
  Follow a live Anarlog session in real-time and coach the user through a
  meeting or interview. Understands context from the session title, knowledge
  base, and candidate pipeline. Provides talking points, flags gaps in
  coverage, and suggests follow-up questions as the conversation unfolds.
  Use when the user asks to follow, shadow, or coach them through a live meeting.
---

# Anarlog Follow

Follow a live Anarlog recording. Read the transcript as it grows. Coach the user
through the meeting in real time. Gather knowledge-base context once before the
session. Then poll the transcript. Provide actionable nudges as new content
appears.

## Trigger

- The user asks to follow, shadow, or coach them through a live meeting.
- "Follow my meeting", "coach me", "shadow this call".
- The user starts an Anarlog recording and wants real-time support.

## Prerequisites

- Anarlog installed. Sessions live at
  `~/Library/Application Support/anarlog/sessions/`.
- An active or about-to-start session.
- A populated knowledge base (attendee / candidate context).

## Inputs

- Live `transcript.json` (it grows during the session).
- `Knowledge/People/`, `Knowledge/Candidates/{Name}/{brief,screening,panel}.md`,
  `Knowledge/Roles/`, `Knowledge/Organizations/`, `Knowledge/Projects/`.
- `~/.cache/fit/outpost/apple_calendar/*.json` for context.

## Outputs

- This skill prints real-time coaching messages to the user.
- **This skill writes no files.** It only advises.

<do_confirm_checklist goal="Verify the follow session was useful and read-only">

- [ ] Detect the active session and confirm it with the user.
- [ ] Classify the meeting type from the title.
- [ ] Gather knowledge-base context for all attendees.
- [ ] For interviews, load the standard expectations and the focus areas from
      screening.
- [ ] Keep each coaching nudge actionable and concise (1–3 lines).
- [ ] Track the coverage gaps. Surface them before the meeting ends.
- [ ] Detect the end of the meeting. Debrief the user.
- [ ] Offer the next steps (`req-assess` / `anarlog-process`). Let the user
      decide whether to run them.
- [ ] Modify no file during the session.

</do_confirm_checklist>

## Procedure

### Phase 1 — Detect and connect

#### 1. Find the active session

```bash
node .claude/skills/anarlog-follow/scripts/follow.mjs --detect
```

The script returns the most recently modified session, whether it is live, and
its title. If nothing changed in the last 5 minutes, warn the user. Ask whether
to follow a specific session. If more than one session could be active, confirm
with the user.

#### 2. Read session metadata

```bash
node .claude/skills/anarlog-follow/scripts/follow.mjs <session-id> --meta
```

Capture **title**, **created_at**, **participants**.

#### 3. Classify the meeting type

[references/meeting-types.md](references/meeting-types.md) maps the title
pattern → type → coaching focus. The type drives the context you load in
Phase 2 and the dimensions you track in Phase 3.

### Phase 2 — Gather context (once)

#### 4. Resolve attendees

Extract the names from the title and the participant list. For each name:

```bash
rg -l "{name}" Knowledge/People/
rg -l "{name}" Knowledge/Candidates/
```

Read each note you find for role, organization, history, open items, and prior
interactions.

#### 5. Load type-specific context

**Interviews:** read `Knowledge/Candidates/{Name}/{brief,screening,panel}.md`.
Look up the `Req` field's matching `Knowledge/Roles/*.md` file. Check its
`**Status:**` field for context. Then load the standard expectations:

```bash
bunx fit-pathway job {discipline} {level} --track={track}
```

**General meetings:** read attendee People notes plus referenced
Project/Organization notes. Check open tasks: `rg "{name}" Knowledge/Tasks/`.

#### 6. Build the coaching brief

Synthesize the gathered context into the pre-meeting brief format in
[references/coaching.md](references/coaching.md#pre-meeting-brief-format). Print
it to the user.

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

The script returns JSON with grouped text segments, channel labels, and the next
last-word ID.

#### 8. Analyze new content

Track the interview dimensions or the general dimensions in
[references/coaching.md](references/coaching.md#dimensions-to-track). Apply the
[principles](references/coaching.md#principles) and the
[constraints](references/coaching.md#constraints).

#### 9. Provide coaching

Output only when the nudge is actionable. Use the
[coaching output formats](references/coaching.md#coaching-output-formats). Keep
each nudge 1–3 lines.

#### 10. Detect meeting end

Watch for farewells ("bye", "take care", "have a good day"). Watch for wrap-up
phrases ("that's all", "let's wrap", "I'll let you go"). Watch for final
thank-yous with no substantive follow-up. When you detect one, move to Phase 4.

#### 11. Loop cadence

**Do not use `sleep` or timed loops.** After each coaching output, read the next
batch immediately. A natural cadence emerges from read/analyze/output. After two
consecutive empty reads, ask the user whether the meeting ended.

### Phase 4 — Wrap-up

#### 12–13. Debrief

Pick the interview template or the general template in
[references/debrief.md](references/debrief.md).

#### 14. Offer next steps

Offer (don't ask) the follow-ups in
[references/debrief.md](references/debrief.md#next-step-offers-step-14).
