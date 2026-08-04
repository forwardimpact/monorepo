# Anarlog Meeting Data

Reference for `anarlog-process` Step 2. Anarlog stores meetings in a local
SQLite database (`~/Library/Application Support/anarlog/app.db`). Read them
through Anarlog's typed, read-only interfaces — its own `AGENTS.md` is
explicit:

> Use Anarlog's typed, read-only interfaces for meeting data. Do not use `find`,
> `grep`, `rg`, filesystem crawling, or direct SQLite queries.

**Prefer the MCP tools** (`get_meeting`, `get_meeting_transcript`,
`list_meetings`, `get_recurring_meeting_history`) when the `anarlog` MCP server
is connected — call them directly, no shell needed. **Fall back to the CLI**
(`anarlog --json ...`) otherwise; `scan.mjs`'s bulk scan (Step 0) always uses
the CLI regardless, since enumerating and hashing every meeting has no MCP
equivalent. Resolve the CLI binary once (`scan.mjs` finds it via `ANARLOG_CLI`,
the app bundle, or `PATH`):

```bash
CLI="$(node .claude/skills/anarlog-process/scripts/scan.mjs cli-path)"
```

Every CLI command takes a global `--json` flag and returns a stable envelope;
MCP tools return the same `data`/`pagination` shape directly as the tool
result:

```json
{ "schema_version": "1", "command": "meetings.get", "data": { … },
  "pagination": { "offset": 0, "limit": 20, "returned": 20, "next_offset": 20 } }
```

Read the payload from `.data` (CLI) or the tool result directly (MCP). Never
guess a meeting ID — get it from the scan output or `meetings list` /
`list_meetings`.

## `list_meetings` / `meetings list`

MCP: `list_meetings({ limit, offset, query, series_id })`. CLI:
`"$CLI" --json meetings list --limit 200 --offset 0` (also `--query`,
`--series-id`). `data` is an array of meeting summaries:

```json
{ "id": "a104a542-…", "title": "1-1 with Sarah Chen", "kind": "meeting",
  "status": "active", "created_at": "2026-07-22T08:27:42.499Z",
  "updated_at": "…", "started_at": "", "ended_at": "", "series_id": "" }
```

Page with `pagination.next_offset` until a short page. `scan.mjs` does this for
you via the CLI; call `list`/`list_meetings` directly only for ad-hoc lookups
(e.g. resolving an ID by title).

## `get_meeting` / `meetings get <id>` — the main source

MCP: `get_meeting({ meeting_id: id })`. CLI: `"$CLI" --json meetings get {id}`.
`data` carries everything you extract from:

- **`note`** — the user's own notes (object, or `null`). `note.markdown` is
  high-signal: every name and observation is intentional. May be just a title.
- **`summaries`** — array of AI-generated summaries; `summaries[].markdown` is
  usually the richest source. Often one entry; can be empty.
- **`participants`** — array of `{ human_id, display_name, email, role,
  job_title, organization_name }`. Frequently sparse/empty — a hint, not a
  source of truth; still confirm people from the note/summary text.
- **`action_items`** — array of `{ text, status, assignee_human_id, due_at }`.
  Useful as open items / commitments when populated.

Prefer the summary when both note and summary exist; combine them for full
coverage.

## `get_meeting_transcript` / `meetings transcript <id>` — disambiguation only

MCP: `get_meeting_transcript({ meeting_id: id, offset: 0, limit: 200 })`. CLI:
`"$CLI" --json meetings transcript {id} --limit 200 --offset 0` (`limit`
capped at 500 by both):

```json
{ "meeting_id": "a104a542-…", "text": "Yeah, so the overall …",
  "words": [ { "channel": 0, "text": " Yeah,", "start_ms": 0, "end_ms": 400 } ] }
```

`data.text` is the joined page; `pagination.total` is the word count (page with
`next_offset`). **Do not extract entities from the full transcript** — too
noisy. Use it only to disambiguate a name, confirm who said what (channel `0` =
user, channel `1` = other speaker — a heuristic), or find context around a
decision.

**Exception — interview sessions:** page through the full transcript (not just
enough to disambiguate) and persist it verbatim to
`Knowledge/Candidates/{Name}/transcript-{date}.md`. This doesn't relax the
no-entity-extraction rule above — the persisted file is a `req-assess` input,
not a source `anarlog-process` itself mines.

## Skip rules

Skip a meeting when it has **neither** a substantive note **nor** any summary
(empty / onboarding / test sessions — e.g. a note that is only its title, or a
generic title like "Hello" / "Welcome to Anarlog" with no content). Process a
meeting if it has **either** a substantive note **or** a summary. `scan.mjs`
already applies this, so a meeting in the scan output is worth processing.

## Legacy flat files (fallback only)

Older Anarlog versions exported each session to
`~/Library/Application Support/anarlog/sessions/{uuid}/`. `scan.mjs` falls back
to these only when `anarlog-cli` is unavailable; already-processed flat-file
sessions are frozen and never reprocessed. Shapes:

- **`_meta.json`** — `{ created_at, id, title, participants }` (participants
  often empty). Session date from `created_at`.
- **`_memo.md`** — YAML frontmatter (`id`, `session_id`) + the user's markdown
  notes. Equivalent to the CLI's `note.markdown`.
- **`_summary.md`** — YAML frontmatter (`id`, `session_id`, `title`) + an
  AI-generated summary. Equivalent to a `summaries[]` entry.
- **`transcript.json`** — `{ transcripts: [{ words: [{ channel, text, start_ms,
  end_ms }] }] }`. Same channel convention as above.
