---
name: sync-teams
description: Sync recent Microsoft Teams chat messages into ~/.cache/fit/outpost/teams_chat/ as markdown files by reading the Teams IndexedDB cache from disk. Use on a schedule or when the user asks to sync their Teams chats. Requires macOS with the Teams desktop app installed.
compatibility: Requires macOS with Microsoft Teams desktop app (com.microsoft.teams2) installed
---

# Sync Teams

Sync recent Microsoft Teams chat messages into
`~/.cache/fit/outpost/teams_chat/` as markdown files. This is an automated data
pipeline skill — it ingests chat data that other skills (like
`extract-entities`) consume downstream.

This skill reads the Teams IndexedDB cache directly from disk — no browser
automation, no API tokens, no network access needed. The Teams desktop app
(which uses Edge WebView2) stores conversations and messages in a LevelDB-backed
IndexedDB at a known location. This skill parses those files, deserializes the
V8-encoded records, and writes markdown.

## Trigger

Run this skill on a schedule (every 15 minutes) or when the user asks to sync
their Teams chats.

## Prerequisites

- macOS with the Microsoft Teams desktop app installed (`com.microsoft.teams2`)
- `snappyjs` npm package installed (`npm install snappyjs`)
- Node.js 20+ (uses `node:v8` built-in for deserialization)

## Inputs

- `~/Library/Containers/com.microsoft.teams2/Data/Library/Application Support/Microsoft/MSTeams/EBWebView/WV2Profile_tfw/IndexedDB/https_teams.microsoft.com_0.indexeddb.leveldb/`
  — Teams IndexedDB (LevelDB on disk)
- `~/.cache/fit/outpost/state/teams_last_sync` — ISO timestamp of last sync
- `~/.cache/fit/outpost/state/teams_chat_index.tsv` — index of known chats

## Outputs

- `~/.cache/fit/outpost/teams_chat/{slug}.md` — one markdown file per chat
  (overwritten each sync with current state)
- `~/.cache/fit/outpost/state/teams_last_sync` — updated with sync timestamp
- `~/.cache/fit/outpost/state/teams_chat_index.tsv` — updated chat index

---

## Implementation

Run the sync as a single Node.js script:

    node scripts/sync.mjs [--days N]

- `--days N` — only include messages from the last N days (default: 30)

The script:

1. Reads all LevelDB `.ldb` (SSTable) and `.log` (write-ahead log) files from
   the Teams IndexedDB directory
2. Decompresses Snappy-compressed blocks and deserializes V8-encoded values
   using Node's built-in `v8.deserialize()`
3. Extracts conversation records (with member lists, topics, chat type) and
   message records (with sender names, HTML content, timestamps)
4. Groups messages by conversation, filters by date window, and converts HTML
   content to plain text
5. Writes one markdown file per chat to `~/.cache/fit/outpost/teams_chat/`
6. Updates sync state (timestamp and chat index)

### Architecture

Three modules, following the same pattern as `sync-apple-mail`:

| Module                       | Purpose                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `scripts/leveldb-reader.mjs` | Parse LevelDB SSTable and WAL files. Handles Snappy decompression. No external dependencies except `snappyjs`.              |
| `scripts/idb-reader.mjs`     | Chromium IndexedDB layer. Strips Blink envelope, calls `v8.deserialize()`, classifies records as conversations or messages. |
| `scripts/sync.mjs`           | Main sync script. Reads data, groups by conversation, normalizes names, writes markdown and state.                          |

### How It Works

The Teams desktop app uses Edge WebView2 internally. WebView2 stores IndexedDB
data in LevelDB (the same way Chrome does). The key databases are:

- **conversation-manager** — stores conversation metadata: ID, type (Chat vs
  Thread), members, topic, last message time
- **replychain-manager** — stores actual messages: sender display name, HTML
  content, timestamps, reactions, edit status

Since LevelDB is an append-only format, files can be read while Teams is
running. Newer `.ldb` files supersede older ones for the same records.

### Name Resolution

Teams conversation records don't store human-readable member names — only orgid
identifiers. Display names are resolved from:

1. **Conversation topic** (for named group chats)
2. **Message sender names** (`imDisplayName` field) — for 1:1 chats, the chat is
   named after the other participant(s)

## Output Format

Each `{slug}.md` file follows the same format as the previous browser-based
implementation:

**1:1 chat:**

```markdown
# Chat with {First Last}

**Platform:** Microsoft Teams
**Last Synced:** {YYYY-MM-DD}

---

### {Sender First Last}
**Date:** {YYYY-MM-DD HH:MM:SS}

{message content}

---
```

**Group chat:**

```markdown
# Chat: {Topic} (group)

**Platform:** Microsoft Teams
**Type:** Group chat
**Participants:** {Name1}, {Name2}, ...
**Last Synced:** {YYYY-MM-DD}

---

### {Sender First Last}
**Date:** {YYYY-MM-DD HH:MM:SS}

{message content}
```

Key conventions:

- Messages in **chronological order** (oldest first)
- **Normalize names** from Teams format ("Last, First") to "First Last"
- **Platform** line distinguishes Teams from email in downstream processing
- **Plain text only** — HTML is stripped, mentions are preserved as plain text
- **Attachments are not extracted** — files/images on a message are dropped from
  the markdown. They are hosted on SharePoint/OneDrive, not in the local cache.
  However, the user has **often manually downloaded** them, so an attachment
  usually exists under `~/Downloads/` with the **same file name** shown in Teams.
  When a message references an attachment and you need its contents, look there
  first.
- Skip system messages (calls, member adds/removes, topic changes)

## Error Handling

- Teams app not installed → report and stop
- IndexedDB directory missing → report and stop
- LevelDB file parse error → skip that file, continue with others
- V8 deserialization failure → skip that record, continue
- Snappy decompression failure → skip that block, continue
- Empty chat (no messages in window) → skip, don't write a file
- Always update sync state, even on partial success

## Constraints

- **Read-only.** Never writes to the Teams IndexedDB or sends messages.
- **Cache-dependent.** Only conversations cached locally by Teams are available.
  This covers recently viewed chats, not full history.
- **Both 1:1 and group chats** are synced (channels are excluded).
- **No message limit per chat** — all cached messages within the `--days` window
  are included.

## Limitations

- The IndexedDB is a **cache, not an archive**. Only conversations the user has
  recently opened in Teams will have cached message data. Older conversations
  that haven't been opened may have conversation metadata but no messages.
- Clearing the Teams cache (a common troubleshooting step) will temporarily
  remove all local data until Teams rebuilds it from the server.
- Some V8-serialized records (~17% in testing) use formats that
  `v8.deserialize()` cannot decode. These are silently skipped — they are
  typically IndexedDB metadata, not conversation or message records.
- **Attachments (files/images) are never synced into the markdown** — only the
  message text is captured. The binaries live on SharePoint/OneDrive, but the
  user frequently downloads them, so the same-named file is usually already in
  `~/Downloads/`. Check there before trying to fetch from SharePoint.
