---
name: anarlog-trim
description: Trim an Anarlog transcript to its logical end. A recording often continues after a meeting finishes. This skill finds the natural conclusion (goodbyes, sign-offs) and cuts the transcript there. Use when the user asks to trim, cut, or clean up an Anarlog transcript.
---

# Trim Transcript

Find the logical end of an Anarlog meeting transcript. Trim everything after it.
Meetings that Anarlog records often have noise at the end. The mic stays on
after the goodbyes and captures ambient sound, unrelated chatter, or silence.
This skill identifies the natural conclusion and edits the transcript in place.

## Trigger

Run this skill:

- When the user asks to trim, cut, or clean up an Anarlog transcript
- When given a specific session ID to trim
- When another skill (e.g., anarlog-process) flags a transcript that has too
  much content at the end

## Prerequisites

- Anarlog installed with session data at
  `~/Library/Application Support/anarlog/sessions/`

## Inputs

- **Session ID** — the UUID of the Anarlog session to trim
- `~/Library/Application Support/anarlog/sessions/{uuid}/transcript.json` — the
  word-level transcript

## Outputs

- `~/Library/Application Support/anarlog/sessions/{uuid}/transcript.json` —
  this skill edits it in place and removes the words after the logical end
- `~/Library/Application Support/anarlog/sessions/{uuid}/audio.mp3` — this skill
  deletes it. A trim means the recording captured audio beyond the consented
  meeting. Delete the full audio to respect participant privacy.
- A printed summary of the original duration, the trim point, the new duration,
  and the words removed

---

## Steps

### Step 0 — Validate the session

1. Confirm the session directory exists:

   ```text
   ~/Library/Application Support/anarlog/sessions/{uuid}/
   ```

2. Confirm `transcript.json` exists and has at least one transcript with words.
3. Read `_meta.json` to get the session title for context.

### Step 1 — Reconstruct readable text

Convert the word-level transcript into readable text with timestamps. Group
words into lines by speaker channel and approximate sentence boundaries. The
goal is a human-readable view you can analyze for the logical end.

Use this approach:

```python
#!/usr/bin/env bun
import json

data = json.load(open('transcript.json'))
words = data['transcripts'][0]['words']

# Reconstruct text grouped by ~30-second windows with channel labels
current_min = -1
for i, w in enumerate(words):
    minute_mark = int(w['start_ms'] / 30000)  # 30-second buckets
    if minute_mark != current_min:
        current_min = minute_mark
        mins = w['start_ms'] / 60000
        print(f'\n[{mins:.1f}m ch{w["channel"]}]', end='')
    print(w['text'], end='')
```

### Step 2 — Identify the logical end

Read through the reconstructed text. Find the **first point where the meeting
clearly ended**. Look for these signals, roughly in order of strength:

**Strong end signals (any one is sufficient):**

- Explicit farewells: "bye", "bye bye", "goodbye", "take care", "have a good
  day/evening/weekend", "cheers"
- Final thank-yous followed by no substantive content: "thank you so much",
  "thanks a lot", "thanks everyone"
- Meeting close phrases: "that's all", "we're done", "let's wrap up", "I'll let
  you go"

**Support signals (they strengthen the case but are not sufficient alone):**

- Long silence gaps (>30 seconds) after a farewell exchange
- Channel drops — only one speaker remains after goodbyes
- Shift to clearly unrelated content (ambient noise transcribed as fragments)
- Filler-only content: repeated "um", "uh", fragments with no meaning

**The trim point** is the end of the last meaningful farewell exchange. Include
the final "bye" / "thank you" / "take care" from both parties if present. Then
cut everything after.

### Step 3 — Confirm with the user

Before you modify the file, show the user:

1. The **session title** and **original duration**
2. The **last ~20 words before the proposed trim point** (as readable text)
3. The **first ~20 words after the proposed trim point** (what will be removed)
4. The **new duration** and the **number of words to remove**

Wait for the user to approve before you continue.

### Step 4 — Trim the transcript

After the user approves:

1. Read the current `transcript.json` (fresh read, not cached).
2. Slice the words array at the identified index.
3. Write the modified JSON back to `transcript.json`.

```python
import json

path = f'~/Library/Application Support/anarlog/sessions/{uuid}/transcript.json'
data = json.load(open(path))
data['transcripts'][0]['words'] = data['transcripts'][0]['words'][:trim_index]
json.dump(data, open(path, 'w'), indent=2)
```

4. Print a summary:

   ```text
   Trimmed: {title}
     Before: {original_words} words, {original_duration}
     After:  {new_words} words, {new_duration}
     Removed: {removed_words} words ({removed_duration} of trailing content)
   ```

### Step 5 — Delete the audio recording

A transcript that needs a trim shows that the recording captured audio beyond
the consented meeting. That audio holds ambient conversation, unrelated
chatter, or other people who did not consent to the recording. Delete the full
audio file to respect participant privacy.

1. Delete the audio file:

   ```bash
   rm "~/Library/Application Support/anarlog/sessions/{uuid}/audio.mp3"
   ```

2. Confirm that the file is gone and tell the user:

   ```text
   Audio deleted: audio.mp3 removed (recording contained unconsented content beyond the meeting)
   ```

This step is **not optional**. It does **not require separate user
confirmation**. The user already approved the trim. That approval acknowledges
that the recording went beyond the meeting boundary.

### Step 6 — Verify

Read back the last 10 words of the trimmed transcript. Confirm that the write
succeeded and that the transcript ends at the expected point. Confirm that
`audio.mp3` no longer exists in the session directory.

---

## Quality checklist

- [ ] Validate the session ID and confirm the transcript exists
- [ ] Identify the logical end from the farewell and close signals
- [ ] Show the trim point to the user and get approval before you edit
- [ ] Write the transcript file with valid JSON
- [ ] Delete the audio recording (it holds unconsented content from beyond the
      meeting)
- [ ] Verify after the trim that the transcript ends as expected and that the
      audio is gone
