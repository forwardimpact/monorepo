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

- Anarlog installed. Meetings live in its local SQLite database (`app.db`).
  Read them only through Anarlog's typed, read-only interfaces. Prefer the
  **Anarlog MCP tools** (`list_meetings`, `get_meeting`,
  `get_meeting_transcript`) when the MCP server is connected. Fall back to the
  **`anarlog` CLI with `--json`** otherwise. Never `grep`, crawl `sessions/`,
  or query SQLite directly. See Anarlog's own `AGENTS.md`
  (`~/Library/Application Support/anarlog/AGENTS.md`).
- An active or about-to-start session.
- A populated knowledge base (attendee / candidate context).

## Inputs

- The live meeting transcript, via `get_meeting_transcript` (MCP) or
  `anarlog --json meetings transcript <id>` (CLI). See
  [references/sessions.md](references/sessions.md) for both interfaces.
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

No interface exposes a "recording now" signal. The only liveness signal is the
most recently written `audio.mp3` on disk. This is the one deliberate
filesystem read in this skill. All content reads go through Anarlog's
interfaces. The session directory name **is** the meeting ID:

```bash
find "$HOME/Library/Application Support/anarlog/sessions" -maxdepth 2 \
  -name "audio.mp3" -exec stat -f "%m %N" {} \; | sort -rn | head -5
```

Take the top result's parent directory name as the candidate meeting ID. If
its mtime is more than 5 minutes old, warn the user. Ask whether to follow a
specific meeting. If more than one session could be active, confirm with the
user.

#### 2. Read meeting metadata

MCP: `get_meeting({ meeting_id })`. CLI fallback:

```bash
anarlog --json meetings get <meeting-id>
```

Capture **title**, **created_at**, **participants** from `data`.

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

MCP: `get_meeting_transcript({ meeting_id, offset, limit: 500 })`. CLI
fallback:

```bash
anarlog --json meetings transcript <meeting-id> --offset <offset> --limit 500
```

First read: `offset` = 0. Each later read: `offset` = the `pagination.total`
from the previous read. That fetches only the words added since then. When a
page comes back full and `next_offset < pagination.total`, keep paging with
`next_offset` until you catch up. Track `total` across reads. It is your next
offset.

`data.words` is a flat array of `{ channel, text, start_ms, end_ms }`. Group
consecutive words into segments yourself. Start a new segment on a channel
change or a >3s gap between one word's `end_ms` and the next word's
`start_ms`. Channel `0` = user. Channel `1`+ = guest(s) (a heuristic, per
Anarlog's own docs).

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
