---
name: send-chat
description: Send messages to people through chat platforms (e.g. Microsoft Teams, Slack) with browser automation. Resolves people by name from the knowledge graph, drafts messages for approval, and sends them through the web app. Use when the user asks to message, ping, or chat with someone.
compatibility:
  requires:
    - browser-automation
---

# Send Chat

Send chat messages to people with browser automation against a web-based chat
platform (Microsoft Teams, Slack, or similar). This skill resolves recipients by
name from the knowledge graph. The user can say "message Sarah about the
standup" without an exact display name.

## Trigger

Run when the user asks to:

- Send a message on Teams / Slack / chat
- Ping / chat / DM someone
- Follow up with someone through chat
- Send a message about a topic

## Prerequisites

- The web app for the chat platform, open and authenticated in the browser
- Browser automation available (e.g. Chrome MCP, Playwright)
- Knowledge base populated with people notes

## Critical: Always Look Up Context First

**BEFORE you message anyone, you MUST look up the person in the knowledge
base.**

When the user mentions ANY person:

1. **STOP** — Do not open the chat platform yet
2. **SEARCH** — Look them up: `rg -l "{name}" Knowledge/People/`
3. **READ** — Read their note to understand context, role, recent interactions
4. **UNDERSTAND** — Know who they are and what you work on together
5. **THEN PROCEED** — Only now compose the message and use browser automation

You need this context to:

- Find the right person if the name is ambiguous
- Draft an appropriate message if the user gave a loose prompt
- Know the person's role and relationship for tone

## Resolve People

The user will refer to people by first name, last name, or nickname. Resolve the
reference to a full name with the knowledge graph:

```bash
# Find person by partial name
rg -l -i "{name}" Knowledge/People/

# If ambiguous, read candidates to disambiguate
cat "Knowledge/People/{Candidate}.md"
```

**If ambiguous** (multiple matches), ask the user which person they mean. List
the matches with roles/orgs to help them pick.

**If no match**, tell the user this person is not in the knowledge base. Ask for
their full name as it appears in the chat platform.

## Compose the Message

**You MUST draft every message as a text file first.** This lets the user review
and edit the exact message before you send it.

### Draft Workflow

1. **Compose the message** based on context and user intent.
2. **Write it to a draft file** at `Drafts/chat-{recipient-slug}-{date}.md`
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

The message body is everything below the `---` separator. Paste that body into
the chat.

**Message guidelines:**

- Match the user's usual tone. Use casual tone for peers and professional tone
  for leadership
- Keep it concise. Chat is informal. It is not email
- Reference specific context naturally (project names, recent decisions)
- If the user gives exact words, use them verbatim
- If the user said "ping {name}" without detail, ask what they want to say
- Draft one message based on context. Do not offer multiple options
- **Keep messages on a single line with no formatting.** No line breaks, no
  markdown. Use inline separators (e.g. `•`, `—`) to keep structure. Multi-line
  formatting is unreliable through browser automation.

## Browser Automation Flow

After the user approves the draft, send it as a **single submission**. Paste the
entire message at once. Do not type it line by line.

### Step 1: Identify the Chat Platform

Check which platform is available:

- Look for an open tab that matches the configured chat URL
- If no tab is open, ask the user which platform to use. Then navigate to it

### Step 2: Open a Chat with the Recipient

1. Use the platform's search or "New chat" feature
2. Type the recipient's full name
3. Wait for search results to populate (take a screenshot to verify)
4. Click the correct person from the results

If the person does not appear in search, tell the user. They may not be in the
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
- **Person not found in search:** Report back. They may be external, or they may
  use a different display name. Ask the user for the exact name
- **Chat already open:** If a chat with this person is already visible, use it
  directly
- **UI not as expected:** Take a screenshot and describe what you see. Do not
  click blindly

## Constraints

- **Always confirm before you send.** Never send a message without explicit user
  approval. This is a hard requirement
- **One message at a time.** Do not batch-send to multiple people. Confirm each
  one first
- **No file attachments.** This skill handles text messages only
- **No group chats.** This skill targets 1:1 chats only
- **No message deletion or editing.** After you send a message, you cannot
  delete it or edit it
- **Respect ethics rules.** Never send messages that contain personal judgments,
  gossip, or sensitive information. The ethics policy of the knowledge base
  requires this
