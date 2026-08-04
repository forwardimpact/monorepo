# Anarlog Meeting Data

Reference for `anarlog-follow` Phases 1 and 3. Anarlog stores meetings in a
local SQLite database (`~/Library/Application Support/anarlog/app.db`). Read
them through Anarlog's typed, read-only interfaces. Its own `AGENTS.md`
(`~/Library/Application Support/anarlog/AGENTS.md`) is explicit:

> Use Anarlog's typed, read-only interfaces for meeting data. Do not use
> `find`, `grep`, `rg`, filesystem crawling, or direct SQLite queries.

**Prefer the MCP tools** when the `anarlog` MCP server is connected. **Fall
back to the CLI** (`anarlog --json ...`) otherwise. Never guess a meeting ID.
Phase 1 resolves it from the freshest `audio.mp3` on disk (the one signal
neither interface exposes). Every other read goes through one of the two
interfaces below.

## `get_meeting` / `meetings get <id>`

MCP: `get_meeting({ meeting_id })`. CLI:
`anarlog --json meetings get <meeting-id>`.

Returns `title`, `created_at`, `participants` (`{ human_id, display_name,
email, role, job_title, organization_name }`, often sparse), `note`,
`summaries`, `action_items`. For a live meeting, `note` and `summaries` are
usually thin or empty. That is expected. They fill in once the meeting ends.
Use this once per session, in Phase 1 Step 2, to capture the pre-meeting brief
inputs.

## `get_meeting_transcript` / `meetings transcript <id>`

MCP: `get_meeting_transcript({ meeting_id, offset, limit })`. CLI:
`anarlog --json meetings transcript <meeting-id> --offset <n> --limit <n>`
(`limit` capped at 500 by both interfaces).

```json
{ "meeting_id": "…", "text": "Yeah, so the overall …",
  "words": [ { "channel": 0, "text": " Yeah,", "start_ms": 0, "end_ms": 400 } ] }
```

`pagination.total` is the running word count. Use it as the next poll's
`offset` so you fetch only the words added since the last read. Page with
`next_offset` when a single poll returns a full page and more remain. Channel
`0` = user, channel `1`+ = guest(s) — a heuristic, not guaranteed.

## The one filesystem exception: liveness detection

Neither interface reports which meeting is currently recording. The only
signal for that lives on disk: the most recently written `audio.mp3` under
`~/Library/Application Support/anarlog/sessions/{uuid}/`, where the directory
name is the meeting ID. This skill touches the filesystem for exactly that one
lookup (Phase 1 Step 1) and nothing else. Every read of meeting *content*
goes through `get_meeting` / `get_meeting_transcript`.
