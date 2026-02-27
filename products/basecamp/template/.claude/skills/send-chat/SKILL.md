---
name: send-chat
description: Send messages to people via chat platforms (e.g. Microsoft Teams, Slack) using browser automation. Resolves people by name using the knowledge graph, drafts messages for approval, and sends via the web app. Use when the user asks to message, ping, or chat with someone.
compatibility:
  requires:
    - browser-automation
---

# Send Chat

Send chat messages to people using browser automation against a web-based chat
platform (Microsoft Teams, Slack, or similar). Resolves recipients by name from
the knowledge graph so the user can say "message Sarah about the standup"
without needing exact display names.

## Trigger

Run when the user asks to:

- Send a message on Teams / Slack / chat
- Ping / chat / DM someone
- Follow up with someone via chat
- Send a message about a topic

## Prerequisites

- Chat platform web app open and authenticated in the browser
- Browser automation available (e.g. Chrome MCP, Playwright)
- Knowledge base populated with people notes

## Critical: Always Look Up Context First

**BEFORE messaging anyone, you MUST look up the person in the knowledge base.**

When the user mentions ANY person:

1. **STOP** — Do not open the chat platform yet
2. **SEARCH** — Look them up: `rg -l "{name}" knowledge/People/`
3. **READ** — Read their note to understand context, role, recent interactions
4. **UNDERSTAND** — Know who they are, what you've been working on together
5. **THEN PROCEED** — Only now compose the message and use browser automation

This context is essential for:

- Finding the right person if the name is ambiguous
- Drafting an appropriate message if the user gave a loose prompt
- Knowing the person's role and relationship for tone

## Resolving People

The user will refer to people by first name, last name, or nickname. Resolve to
a full name using the knowledge graph:

```bash
# Find person by partial name
rg -l -i "{name}" knowledge/People/

# If ambiguous, read candidates to disambiguate
cat "knowledge/People/{Candidate}.md"
```

**If ambiguous** (multiple matches), ask the user which person they mean — list
the matches with roles/orgs to help them pick.

**If no match**, tell the user you don't have this person in the knowledge base
and ask for their full name as it appears in the chat platform.

## Composing the Message

**Every message MUST be drafted as a text file first.** This ensures the user
can review and edit the exact message before it's sent.

### Draft Workflow

1. **Compose the message** based on context and user intent.
2. **Write it to a draft file** at `drafts/chat-{recipient-slug}-{date}.md`
   - `{recipient-slug}` = lowercase, hyphenated full name (e.g. `sarah-chen`)
   - `{date}` = ISO date (e.g. `2026-02-19`)
3. **Show the user the draft** — display the file path and contents.
4. **Wait for approval** — the user may edit the file or ask for changes.
5. **Only after approval**, proceed to send.

**Draft file format:**

```markdown
To: {Full Name}
Via: {Platform name}
Date: {YYYY-MM-DD}

---

{message body}
```

The message body (everything below the `---` separator) is what gets pasted into
the chat.

**Message guidelines:**

- Match the user's usual tone — casual for peers, professional for leadership
- Keep it concise — chat is informal, not email
- Reference specific context naturally (project names, recent decisions)
- If the user provides exact wording, use it verbatim
- If the user said "ping {name}" without detail, ask what they want to say
- Draft one message based on context — don't offer multiple options
- **Keep messages on a single line with no formatting.** No line breaks, no
  markdown. Use inline separators (e.g. `•`, `—`) to keep structure. Multi-line
  formatting is unreliable via browser automation.

## Browser Automation Flow

Once the user has approved the draft, send it as a **single submission** — paste
the entire message at once rather than typing line by line.

### Step 1: Identify the Chat Platform

Check which platform is available:

- Look for an open tab matching the configured chat URL
- If no tab is open, ask the user which platform to use and navigate to it

### Step 2: Open a Chat with the Recipient

1. Use the platform's search or "New chat" feature
2. Type the recipient's full name
3. Wait for search results to populate (take a screenshot to verify)
4. Click the correct person from the results

If the person doesn't appear in search, inform the user — they may not be in the
same organization.

### Step 3: Send the Approved Message

1. Read the approved draft file to get the message body (below the `---`)
2. Click the message compose box
3. Paste the entire message as a single submission
4. Press Enter or click Send
5. Take a screenshot to confirm the message was sent

### Step 4: Update Knowledge Graph (Optional)

If the message is substantive (not just "hey" or "thanks"), note the interaction
on the person's knowledge note:

```markdown
- {YYYY-MM-DD}: Messaged on {Platform} re: {topic}
```

## Error Handling

- **Platform not loaded / auth required:** Tell the user to sign in first, then
  retry
- **Person not found in search:** Report back — they may be external or using a
  different display name. Ask the user for the exact name
- **Chat already open:** If a chat with this person is already visible, use it
  directly
- **UI not as expected:** Take a screenshot and describe what you see. Don't
  click blindly

## Constraints

- **Always confirm before sending.** Never send a message without explicit user
  approval — this is a hard requirement
- **One message at a time.** Don't batch-send to multiple people without
  confirming each one
- **No file attachments.** This skill handles text messages only
- **No group chats.** Targets 1:1 chats only
- **No message deletion or editing.** Once sent, it's sent
- **Respect ethics rules.** Never send messages that contain personal judgments,
  gossip, or sensitive information per the knowledge base ethics policy
