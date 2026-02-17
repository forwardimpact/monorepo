---
name: sync-apple-mail
description: Sync email threads from the macOS Mail app's local SQLite database into ~/.cache/fit/basecamp/apple_mail/ as markdown files. Use on a schedule or when the user asks to sync their email. Requires macOS with Mail app configured and Full Disk Access granted.
compatibility: Requires macOS with Apple Mail configured and Full Disk Access granted to the terminal
---

# Sync Apple Mail

Sync email threads from the macOS Mail app's local SQLite database into
`~/.cache/fit/basecamp/apple_mail/` as markdown files. This is an automated data
pipeline skill — it ingests raw email data that other skills (like
`extract-entities`) consume downstream.

## Trigger

Run this skill on a schedule (every 5 minutes) or when the user asks to sync
their email.

## Prerequisites

- macOS with the built-in Mail app configured
- Full Disk Access granted to the terminal (System Settings → Privacy & Security
  → Full Disk Access)

## Inputs

- `~/.cache/fit/basecamp/state/apple_mail_last_sync` — last sync timestamp
  (single-line text file)
- `~/Library/Mail/V*/MailData/Envelope Index` — Apple Mail SQLite database

## Outputs

- `~/.cache/fit/basecamp/apple_mail/{thread_id}.md` — one markdown file per
  email thread
- `~/.cache/fit/basecamp/apple_mail/attachments/{thread_id}/` — copied
  attachment files for each thread (PDFs, images, documents, etc.)
- `~/.cache/fit/basecamp/state/apple_mail_last_sync` — updated with new sync
  timestamp

---

## Implementation

Run the sync as a single Python script. This avoids N+1 shell invocations and
handles all data transformation in one pass:

    python3 scripts/sync.py [--days N]

- `--days N` — how many days back to look on first sync (default: 30)

The script:

1. Finds the Mail database (`~/Library/Mail/V*/MailData/Envelope Index`)
2. Loads last sync timestamp (or defaults to `--days` days ago for first sync)
3. Discovers the thread grouping column (`conversation_id` or `thread_id`)
4. Finds threads with new messages since last sync (up to 500)
5. For each thread: fetches messages, batch-fetches recipients and attachment
   metadata, parses `.emlx` files for full email bodies (falling back to
   database summaries), copies attachment files to the output directory
6. Writes one markdown file per thread to `~/.cache/fit/basecamp/apple_mail/`
7. Updates sync state timestamp
8. Reports summary (threads processed, files written)

The script calls `scripts/parse-emlx.py` to extract plain text bodies from
`.emlx` / `.partial.emlx` files (handles HTML-only emails by stripping tags).

## Database Schema

See [references/SCHEMA.md](references/SCHEMA.md) for the complete Apple Mail
SQLite schema including table structures, column names, and important caveats
(e.g., `date_received` is Unix timestamps not Core Data, `addresses.comment`
holds display names, `recipients` columns are `message`/`address` not
`message_id`/`address_id`).

## Output Format

Each `{thread_id}.md` file:

```markdown
# {Base Subject}

**Thread ID:** {thread_id}
**Message Count:** {count}
**Flags:** mailing-list, automated

---

### From: {sender_name} <{sender_email}>
**Date:** {YYYY-MM-DD HH:MM:SS UTC}
**To:** {name} <{email}>, {name2} <{email2}>
**Cc:** {name} <{email}>

{email_body_or_summary}

---

### From: {next_sender_name} <{next_sender_email}>
**Date:** {next_date}
**To:** ...
**Cc:** ...

{next_body}

**Attachments:**
- [report.pdf](attachments/{thread_id}/report.pdf)
- image001.png *(not available)*
```

Rules:

- Use the **base subject** (from `subject` column, without `subject_prefix`) as
  the `# heading`.
- **Flags line** — only include when at least one flag is set:
  - `mailing-list` if any message in the thread has `list_id_hash != 0`
  - `automated` if any message has `automated_conversation = 1`
  - Omit the `**Flags:**` line entirely if neither flag applies.
- **Sender** — format as `{sender_name} <{sender_email}>` when display name is
  present, otherwise just `{sender_email}`.
- **To/Cc** — include per-message. Format each recipient as `{name} <{email}>`
  when name exists, otherwise just `{email}`. Omit the line if that field has no
  recipients.

## Error Handling

- Database not found → Mail not configured, report and stop
- Permission denied → Full Disk Access not granted, report and stop
- Database locked → wait 2 seconds, retry once
- `.emlx` / `.partial.emlx` not found → fall back to database summary field
- `.emlx` parse error → fall back to database summary field
- HTML-only email → strip tags and use as plain text body (handled by
  parse-emlx.py)
- `find` timeout → skip that message's body, use summary; attachment index empty
- Attachment file not found on disk → listed as `*(not available)*` in markdown
- Attachment copy fails (permissions, disk full) → listed as `*(not available)*`
- Filename collision across messages → prefixed with `{message_id}_`
- Always update sync state, even on partial success

## Constraints

- Open database read-only (`-readonly`)
- Only sync Inbox and Sent folders
- Limit to 500 threads per run
- Incremental: only threads with new messages since last sync
