---
name: draft-emails
description: Draft and send email responses using the knowledge base and calendar for context. Use when the user asks to draft, reply to, respond to, or send an email.
---

# Draft Emails

Draft and send email responses. Uses the knowledge base and calendar for full
context on every person and conversation. All drafts require explicit user
approval before sending.

## Trigger

Run when the user asks to draft, reply to, respond to, or send an email.

## Prerequisites

- Knowledge base populated (from `extract-entities` skill)
- Synced email data in `~/.cache/fit/basecamp/apple_mail/`

## Data Locations

| Data            | Location                                      |
| --------------- | --------------------------------------------- |
| People          | `knowledge/People/*.md`                       |
| Organizations   | `knowledge/Organizations/*.md`                |
| Email threads   | `~/.cache/fit/basecamp/apple_mail/*.md`       |
| Calendar events | `~/.cache/fit/basecamp/apple_calendar/*.json` |
| Drafted IDs     | `drafts/drafted` (one ID per line)            |
| Ignored IDs     | `drafts/ignored` (one ID per line)            |
| Draft files     | `drafts/{email_id}_draft.md`                  |

---

## Always Look Up Context First

**BEFORE drafting any email, look up the person/organization in the knowledge
base.**

1. **Search** — `rg -l "Name" knowledge/`
2. **Read** — `cat "knowledge/People/Name.md"`
3. **Understand** — Extract role, organization, relationship history, open items
4. **Draft** — Only now draft the email, using this context

## Key Principles

**Ask, don't guess:**

- If intent is unclear, ASK what the email should be about
- If a person has multiple contexts, ASK which one

**Be decisive:**

- Draft ONE email — no multiple versions
- Personalize from knowledge base context
- Match the tone of the incoming email

**User approves before sending:**

- Always present the draft for review before sending
- Never send without explicit approval

## Workflow

### 1. Scan for New Emails

```bash
node scripts/scan-emails.mjs
```

Outputs tab-separated `email_id<TAB>subject` for unprocessed emails.

### 2. Classify

**Ignore** (append ID to `drafts/ignored`):

- Newsletters, marketing, automated notifications
- Spam or irrelevant cold outreach
- Outbound emails from user with no reply

**Draft response for:**

- Meeting requests or scheduling
- Personal emails from known contacts
- Business inquiries or follow-ups
- Emails requesting information or action

### 3. Gather Context

**Knowledge base** (required for every draft):

```bash
rg -l "sender_name" knowledge/
cat "knowledge/People/Sender Name.md"
cat "knowledge/Organizations/Company Name.md"
```

**Calendar** (for scheduling emails):

```bash
ls ~/.cache/fit/basecamp/apple_calendar/ 2>/dev/null
cat "$HOME/.cache/fit/basecamp/apple_calendar/event123.json"
```

### 4. Write Draft

Save to `drafts/{email_id}_draft.md`:

```markdown
# Draft Response

**To:** recipient@example.com
**CC:** other@example.com
**Subject:** Re: {subject}

---

{personalized draft body}

---

## Notes
- **Original Email ID:** {id}
- **From:** {sender}
- **Context:** {knowledge base notes used}
```

Guidelines:

- Draft ONE email — reference past interactions naturally
- For scheduling: propose specific times from calendar availability
- If unsure about intent, ask a clarifying question instead of drafting

### 5. Present for Review

Show the draft to the user. Wait for explicit approval before sending. The user
may request edits — apply them and present again.

### 6. Send

After the user approves, send via Apple Mail:

```bash
node scripts/send-email.mjs \
  --to "recipient@example.com" \
  --cc "other@example.com" \
  --subject "Re: Subject" \
  --body "Plain text body"
```

Options: `--to` (required), `--cc` (optional), `--bcc` (optional), `--subject`
(required), `--body` (required, plain text only).

Do NOT include an email signature — Apple Mail appends the configured signature
automatically.

### 7. Update State

```bash
echo "$EMAIL_ID" >> drafts/drafted   # or drafts/ignored
```

## Recruitment & Staffing Emails

**Candidates must NEVER be copied on internal emails about them.**

1. **Identify the candidate** from the thread and knowledge base
2. **Strip the candidate from recipients** — draft to internal stakeholders only
3. **Direct-to-candidate emails** — flag with:
   `⚠️ RECRUITER ONLY — This email goes directly to the candidate.`

Internal recruitment emails (candidate excluded): interview feedback, candidate
evaluation, hiring decisions, compensation discussions, reference checks.

**When in doubt:** If an email thread mentions a candidate and involves multiple
internal recipients, treat it as internal and exclude the candidate.

## Constraints

- Never send without explicit user approval
- Be conservative with ignore — when in doubt, create a draft
- For ambiguous emails, draft with a note explaining the ambiguity
