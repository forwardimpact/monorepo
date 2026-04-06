---
name: sync-teams
description: Sync recent Microsoft Teams chat messages into ~/.cache/fit/basecamp/teams_chat/ as markdown files using browser automation. Use on a schedule or when the user asks to sync their Teams chats. Requires Teams web app authenticated in Chrome.
compatibility:
  requires:
    - browser-automation
---

# Sync Teams

Sync recent Microsoft Teams chat messages into
`~/.cache/fit/basecamp/teams_chat/` as markdown files. This is an automated data
pipeline skill — it ingests chat data that other skills (like
`extract-entities`) consume downstream.

Unlike sync-apple-mail (which reads a local SQLite database), this skill uses
browser automation against the Teams web app. This means Chrome must be open and
Teams must be authenticated.

## Trigger

Run this skill on a schedule (every 15 minutes) or when the user asks to sync
their Teams chats. Skip if Chrome is not available or Teams is not
authenticated.

## Prerequisites

- Microsoft Teams web app authenticated in Chrome
- Browser automation available (Chrome MCP extension)

## Inputs

- `~/.cache/fit/basecamp/state/teams_last_sync` — ISO timestamp of last sync
- `~/.cache/fit/basecamp/state/teams_chat_index.tsv` — index of known chats
  (chat_slug, display_name, last_message_timestamp)

## Outputs

- `~/.cache/fit/basecamp/teams_chat/{person-slug}.md` — one markdown file per
  1:1 chat (overwritten each sync with current state)
- `~/.cache/fit/basecamp/state/teams_last_sync` — updated with sync timestamp
- `~/.cache/fit/basecamp/state/teams_chat_index.tsv` — updated chat index

---

## Implementation

### Step 0: Preflight

1. Check `~/.cache/fit/basecamp/state/teams_last_sync`. If synced less than 10
   minutes ago, report "recently synced" and stop.
2. Create output directory if it doesn't exist:
   `mkdir -p ~/.cache/fit/basecamp/teams_chat`

### Step 1: Open Teams

1. Call `tabs_context_mcp` to get current browser tabs.
2. Look for an existing tab with URL matching `teams.microsoft.com`. Note it but
   **do not reuse it** — the user may be actively working in it.
3. Create a **new tab** with `tabs_create_mcp` and navigate to
   `https://teams.microsoft.com/v2/`.
4. Wait 2–3 seconds for the page to load.
5. Use `read_page` (depth 3) to verify Teams loaded. Look for:
   - Navigation element with "Chat" button → authenticated, ready
   - Login form or SSO redirect → report "Teams not authenticated" and stop

### Step 2: Read Chat List

The Teams sidebar organizes chats into a **tree widget** with custom sections.
The user's chat list is NOT a flat recent-chats list — it has sections like
"Senior leaders", "Recruitment", "Pins", "Chats", "Teams and channels", etc.

1. Navigate to the Chat section (click the Chat button in the left nav, or it
   may already be showing).
2. Use `read_page` at **depth 5** on the sidebar tree to read chat entries. The
   tree structure is:
   ```
   tree [ref_XX]
     treeitem [section]
       generic "{Section Name}" (e.g., "Pins", "Chats")
       group
         treeitem [chat entry]
           img "{status}" (Available, Offline, Away, Out of office)
           generic "{Person Name}" (e.g., "Smith, Jane")
           generic "{date}" (e.g., "03-04", "17-06-2025")
   ```
3. Identify **1:1 chats** by their structure:
   - **1:1 chat:** Single person name + status icon (Available/Offline/Away/OOO)
   - **Group chat:** Multiple names or "+N" suffix (e.g., "Hook, Jamie, +4")
   - **Meeting chat:** Descriptive title (e.g., "Weekly standup", "Accord tech
     review")
   - **Bot chat:** Button element with "Bot" in text (e.g., "DX Bot Available")
   - Skip group chats, meeting chats, and bots.
4. Collect the top 15 most recent 1:1 chats across all sections ("Pins" and
   "Chats" are the primary sources).

### Step 3: Read Messages from Each Chat

For each chat to sync (up to 10 per run to keep runtime reasonable):

1. **Click** the chat treeitem to open it. Wait 1–2 seconds for messages to
   load.
2. **Read the accessibility tree** for timestamps and sender attribution:
   - Use `read_page` with `ref_id` targeting the message pane, **depth 10**.
   - Message structure in the accessibility tree:
     ```
     group [message]
       generic "{Sender, Name}"         ← sender (Last, First format)
       generic "{Full timestamp}."      ← e.g., "Tuesday, March 24, 2026 5:41 PM."
       generic "Edited {timestamp}"     ← optional edit indicator
       button "More message options"
       generic "{message text}"         ← truncated to ~100 chars
     ```
   - Timestamps appear in several formats:
     - Full: `"Tuesday, March 24, 2026 5:41 PM."`
     - Relative: `"Yesterday at 2:22 PM."`, `"Thursday, April 2, 2026 1:39 PM."`
   - Convert all relative timestamps to absolute dates using today's date.
3. **Read the full message text** using JavaScript:

   ```javascript
   const pane = document.querySelector('[data-tid="message-pane-layout"]');
   pane.innerText;
   ```

   - **IMPORTANT:** The `innerText` response truncates around 2000–2500 chars.
     Read in chunks: `text.substring(0, 2500)`, `text.substring(2500, 5000)`,
     etc., until you've captured the full content.
   - The total text length is available via `pane.innerText.length`.

4. **Parse the innerText.** Messages appear in this pattern:

   ```
   {heading preview}... by {Sender, Name}   ← STRIP this line (navigation heading)
   {Sender, Name}                           ← sender
   {timestamp}                              ← time or date
   [Edited]                                 ← optional

   {message body}                           ← actual content (may span multiple lines)
   ```

   - Day markers appear as standalone lines: `"Thursday"`, `"Yesterday"`,
     `"Wednesday, March 18"`, `"Last read"`.
   - Strip: heading preview lines (`"... by {Name}"`), reaction counts
     (`"1 Laugh reaction."`), `"has context menu"`, `"Last read"`.

5. **Correlate** the accessibility tree (reliable timestamps) with innerText
   (full message bodies) by matching sender names and message order.
6. **Normalize sender names** from "Last, First" to "First Last" to match the
   knowledge graph convention.

**IMPORTANT:** `get_page_text` does NOT work for Teams — it returns an error
because Teams is a web app, not an article. Always use `read_page` +
`javascript_tool` with `[data-tid="message-pane-layout"]`.

### Step 4: Write Output

For each chat with messages, write a markdown file.

**Filename:** `{person-slug}.md` where `person-slug` is the lowercase,
hyphenated first-last name (e.g., `jane-smith.md`, not `smith-jane.md`).

**Format:**

```markdown
# Chat with {First Last}

**Platform:** Microsoft Teams
**Last Synced:** {YYYY-MM-DD}

---

### {Sender First Last}
**Date:** {YYYY-MM-DD HH:MM}

{message content}

---

### {Sender First Last}
**Date:** {YYYY-MM-DD HH:MM}

{message content}
```

Key conventions:

- Messages in **chronological order** (oldest first), matching the email thread
  format so `extract-entities` processes them consistently.
- **Normalize names** from Teams format ("Last, First") to knowledge graph
  format ("First Last").
- **Platform** line distinguishes Teams from email in downstream processing.
- **Plain text only** — strip formatting, emoji reactions, read receipts, and
  system messages (e.g., "{Name} added {Name} to the chat").
- Skip messages that are purely system-generated (joins, leaves, calls).

### Step 5: Update State

1. Update `~/.cache/fit/basecamp/state/teams_last_sync` with current ISO
   timestamp.
2. Update `~/.cache/fit/basecamp/state/teams_chat_index.tsv` with one row per
   synced chat:
   ```
   {person-slug}\t{Display Name}\t{last_message_iso_timestamp}
   ```
3. Navigate the tab to `about:blank` or close it (note: `window.close()` may not
   work from content scripts — navigating to `about:blank` is a reliable
   alternative).

### Step 6: Report

```
Decision: {what was observed — N recent chats, M with new messages}
Action: Synced {M} chats to ~/.cache/fit/basecamp/teams_chat/
```

## Error Handling

- Chrome not available → report and stop
- Teams not authenticated → report "sign in manually" and stop
- `get_page_text` returns error → expected; use `read_page` + `javascript_tool`
- `[data-tid="message-pane-layout"]` not found → messages haven't loaded; wait
  and retry once
- JavaScript `innerText` returns empty → chat has no messages; skip
- Tab closed unexpectedly → report and stop (don't retry)
- Chat fails to load → skip that chat, continue with others
- Empty chat (no messages) → skip, don't write a file
- After 3 consecutive failures reading chats → stop the run, report partial
  results
- Always update sync state, even on partial success

## Constraints

- **Read-only.** Never send messages, react, or modify anything in Teams.
- **New tab only.** Always open a fresh tab — never take over a tab the user
  might be working in.
- **1:1 chats only** (group chats and channels are future work).
- **Maximum 10 chats per run** to keep runtime under 5 minutes.
- **Maximum 50 messages per chat** (visible + one scroll-up).
- **No screenshots saved** unless debugging — respect chat privacy.

## Future: Graph API Upgrade Path

The browser automation approach works but is inherently slow and fragile. When
Graph API access becomes available (requires Azure AD app registration or
delegated token), the implementation section can be replaced with:

```
GET https://graph.microsoft.com/v1.0/me/chats?$top=20&$orderby=lastMessagePreview/createdDateTime desc
GET https://graph.microsoft.com/v1.0/me/chats/{chat-id}/messages?$top=50
```

The output format and state tracking stay the same — only the data source
changes. This swap should be transparent to downstream skills.
