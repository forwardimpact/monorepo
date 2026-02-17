# Apple Mail Database Schema

The Apple Mail SQLite database (`Envelope Index`) stores email metadata. Key
tables and their actual column names (verified on macOS Sequoia / V10).

Typical path: `~/Library/Mail/V10/MailData/Envelope Index`

## messages (email metadata)

| Column                   | Type    | Notes                                                    |
| ------------------------ | ------- | -------------------------------------------------------- |
| `ROWID`                  | INTEGER | Primary key                                              |
| `sender`                 | INTEGER | FK → addresses.ROWID                                     |
| `subject`                | INTEGER | FK → subjects.ROWID                                      |
| `subject_prefix`         | TEXT    | `Re:`, `Fwd:`, etc. (directly on messages, not subjects) |
| `summary`                | INTEGER | FK → summaries.ROWID                                     |
| `date_sent`              | INTEGER | Unix timestamp (seconds since 1970-01-01 UTC)            |
| `date_received`          | INTEGER | Unix timestamp (seconds since 1970-01-01 UTC)            |
| `mailbox`                | INTEGER | FK → mailboxes.ROWID                                     |
| `deleted`                | INTEGER | 1 = deleted                                              |
| `conversation_id`        | INTEGER | Thread grouping ID                                       |
| `list_id_hash`           | INTEGER | Non-zero = mailing list message                          |
| `automated_conversation` | INTEGER | 1 = automated/machine-generated                          |
| `read`                   | INTEGER | 1 = read                                                 |
| `flagged`                | INTEGER | 1 = flagged                                              |

**IMPORTANT:** `date_received` stores **Unix timestamps** (seconds since
1970-01-01 UTC), NOT Core Data timestamps (which use 2001-01-01 epoch). Do NOT
apply Core Data conversion.

## addresses (sender and recipient addresses)

| Column    | Type    | Notes                                |
| --------- | ------- | ------------------------------------ |
| `ROWID`   | INTEGER | Primary key                          |
| `address` | TEXT    | Email address                        |
| `comment` | TEXT    | Display name (e.g., `"Chen, Sarah"`) |

**IMPORTANT:** The display name is in `comment`, not a `name` or `display_name`
column.

## subjects

| Column    | Type    | Notes             |
| --------- | ------- | ----------------- |
| `ROWID`   | INTEGER | Primary key       |
| `subject` | TEXT    | Base subject text |

Note: `subject_prefix` (Re:, Fwd:, etc.) is stored on the `messages` table
directly, not here.

## recipients (To/Cc/Bcc per message)

| Column     | Type    | Notes                       |
| ---------- | ------- | --------------------------- |
| `ROWID`    | INTEGER | Primary key                 |
| `message`  | INTEGER | FK → messages.ROWID         |
| `address`  | INTEGER | FK → addresses.ROWID        |
| `type`     | INTEGER | 0 = To, 1 = Cc, 2 = Bcc     |
| `position` | INTEGER | Order within the type group |

**IMPORTANT:** Column names are `message` and `address` (not `message_id` or
`address_id`).

## summaries (Apple Intelligence email summaries)

| Column    | Type    | Notes        |
| --------- | ------- | ------------ |
| `ROWID`   | INTEGER | Primary key  |
| `summary` | TEXT    | Summary text |

## mailboxes

| Column  | Type    | Notes                            |
| ------- | ------- | -------------------------------- |
| `ROWID` | INTEGER | Primary key                      |
| `url`   | TEXT    | Mailbox URL (IMAP or EWS format) |

### Mailbox URL patterns

Standard IMAP: `imap://user@host/INBOX`, `imap://user@host/Sent Messages` EWS
(Exchange): `ews://UUID/Inbox`, `ews://UUID/Sent%20Items`

Use case-insensitive `LIKE` patterns to match both:

- `%/Inbox%` (catches IMAP `/INBOX` and EWS `/Inbox`)
- `%/INBOX%` (explicit uppercase match)
- `%/Sent%` (catches `Sent Messages`, `Sent Items`, `Sent%20Items`)

## attachments (email attachments)

| Column          | Type    | Notes                                   |
| --------------- | ------- | --------------------------------------- |
| `ROWID`         | INTEGER | Primary key                             |
| `message`       | INTEGER | FK → messages.ROWID (ON DELETE CASCADE) |
| `attachment_id` | TEXT    | Used as subdirectory name on disk       |
| `name`          | TEXT    | Original filename (e.g., `report.pdf`)  |

**Constraints:** `UNIQUE(message, attachment_id)` — each attachment within a
message has a unique identifier.

**IMPORTANT:** Column is `message` (not `message_id`), matching the convention
used by the `recipients` table.

### Filesystem mapping

Attachment files on disk follow this path structure:

```
~/Library/Mail/V10/.../Attachments/{message_ROWID}/{attachment_id}/{filename}
```

- `{message_ROWID}` — the `messages.ROWID` value (same as `attachments.message`)
- `{attachment_id}` — the `attachments.attachment_id` value
- `{filename}` — the actual file on disk (may differ from `attachments.name`)
