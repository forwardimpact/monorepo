# Anarlog Session Files

Reference for `anarlog-process` Step 1. Each session lives at
`~/Library/Application Support/anarlog/sessions/{uuid}/`.

## `_meta.json`

```json
{
  "created_at": "2026-02-16T13:01:59.187Z",
  "id": "7888363f-4cc6-4987-8470-92f386e5bdfc",
  "participants": [],
  "title": "Director-Level Hiring Pipeline",
  "user_id": "00000000-0000-0000-0000-000000000000"
}
```

Use: session date (from `created_at`), title, participants (often empty —
Anarlog doesn't reliably populate this).

## `_memo.md`

YAML frontmatter (`id`, `session_id`) plus the user's markdown notes:

```markdown
---
id: 213e0f78-a66a-468d-b8e5-bc3fbbe04bf4
session_id: 213e0f78-a66a-468d-b8e5-bc3fbbe04bf4
---

Chat with Sarah about the product roadmap.
```

High-signal — every name and observation is intentional.

## `_summary.md` (optional)

YAML frontmatter (`id`, `position`, `session_id`, `title`) plus an AI-generated
summary — typically the richest source:

```markdown
---
id: 152d9bc9-0cdc-4fb2-9916-cb7670f3a6df
position: 1
session_id: 213e0f78-a66a-468d-b8e5-bc3fbbe04bf4
title: Summary
---

# Product Roadmap Review

- Both speakers reviewed the Q2 roadmap priorities...
```

## `transcript.json` (disambiguation only)

```json
{
  "transcripts": [{
    "words": [
      {"channel": 0, "text": "Hello", "start_ms": 0, "end_ms": 500},
      {"channel": 1, "text": "Hi", "start_ms": 600, "end_ms": 900}
    ]
  }]
}
```

**Do not extract entities from the full transcript** — too noisy. Consult it
only to disambiguate a name from the memo or summary, confirm who said what
(channel 0 = user, channel 1 = other speaker), or find context around a specific
topic or decision.

## Skip rules

A session is skipped when **all** of:

- `_memo.md` body is empty or only `&nbsp;` / whitespace.
- No `_summary.md` exists.
- Title is empty or generic ("Hello", "Welcome to Anarlog", "Test").

Process a session if it has **either** a substantive memo **or** a
`_summary.md`.
