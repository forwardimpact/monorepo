---
name: draft-emails
description: Draft email responses using the knowledge base and calendar for full context on every person and conversation. Use when the user asks to draft, reply to, or respond to an email. Looks up people and organizations in the knowledge base before drafting.
---

# Draft Emails

Help the user draft email responses. Uses the knowledge base and calendar for
full context on every person and conversation. This is an interactive skill —
the user triggers it by asking to draft or reply to emails.

## Trigger

Run when the user asks to draft, reply to, or respond to an email.

## Prerequisites

- Knowledge base populated (from `extract-entities` skill)
- Synced email data in `~/.cache/fit/basecamp/apple_mail/` or
  `~/.cache/fit/basecamp/gmail/`

## Inputs

- `knowledge/People/*.md` — person context
- `knowledge/Organizations/*.md` — organization context
- `~/.cache/fit/basecamp/apple_mail/*.md` or `~/.cache/fit/basecamp/gmail/*.md`
  — email threads
- `~/.cache/fit/basecamp/apple_calendar/*.json` — calendar events (for
  scheduling)
- `drafts/last_processed` — timestamp of last processing run
- `drafts/drafted` — list of drafted email IDs (one per line)
- `drafts/ignored` — list of ignored email IDs (one per line)

## Outputs

- `drafts/{email_id}_draft.md` — draft email files
- `drafts/last_processed` — updated timestamp
- `drafts/drafted` — updated with newly drafted IDs
- `drafts/ignored` — updated with newly ignored IDs

---

## Critical: Always Look Up Context First

**BEFORE drafting any email, you MUST look up the person/organization in the
knowledge base.**

When the user says "draft an email to Monica" or mentions ANY person:

1. **STOP** — Do not draft anything yet
2. **SEARCH** — Look them up: `rg -l "Monica" knowledge/`
3. **READ** — Read their note: `cat "knowledge/People/Monica Smith.md"`
4. **UNDERSTAND** — Extract role, organization, relationship history, open items
5. **THEN DRAFT** — Only now draft the email, using this context

## Key Principles

**Ask, don't guess:**

- If intent is unclear, ASK what the email should be about
- If a person has multiple contexts, ASK which one
- **WRONG:** "Here are three variants — pick one"
- **RIGHT:** "I see Akhilesh is involved in Rowboat and banking. Which topic?"

**Be decisive, not generic:**

- Once you know the context, draft ONE email — no multiple versions
- Every draft must be personalized from knowledge base context
- Infer tone and approach from context

## Processing Flow

### Step 1: Scan for New Emails

Find unprocessed emails using the scan script:

    bash scripts/scan-emails.sh

This outputs tab-separated `email_id<TAB>subject` for each email not yet in
`drafts/drafted` or `drafts/ignored`.

### Step 2: Parse Email

Each email file is markdown with headers:

- `# Subject Line`
- `**Thread ID:** <id>`
- `**Message Count:** <count>`
- `### From: Name <email@example.com>`
- `**Date:** <date>`

### Step 3: Classify Email

**IGNORE** (append ID to `drafts/ignored`):

- Newsletters, marketing, automated notifications
- Spam or irrelevant cold outreach
- Outbound emails from user with no reply

**DRAFT response for:**

- Meeting requests or scheduling
- Personal emails from known contacts
- Business inquiries
- Follow-ups on existing conversations
- Emails requesting information or action

### Step 4: Gather Context

**Knowledge Base (REQUIRED for every draft):**

```bash
rg -l "sender_name" knowledge/
cat "knowledge/People/Sender Name.md"
cat "knowledge/Organizations/Company Name.md"
```

**Calendar (for scheduling emails):**

```bash
ls ~/.cache/fit/basecamp/apple_calendar/ ~/.cache/fit/basecamp/google_calendar/ 2>/dev/null
cat "$HOME/.cache/fit/basecamp/apple_calendar/event123.json"
```

### Step 5: Create Draft

Write draft to `drafts/{email_id}_draft.md`:

```markdown
# Draft Response

**Original Email ID:** {id}
**Original Subject:** {subject}
**From:** {sender}
**Date Processed:** {date}

---

## Context Used
- Calendar: {relevant info or N/A}
- Knowledge: {relevant notes or N/A}

---

## Draft Response

Subject: Re: {subject}

{personalized draft body}

---

## Notes
{why this response was crafted this way}
```

**Guidelines:**

- Draft ONE email — no multiple versions
- Reference past interactions naturally
- Match the tone of the incoming email
- For scheduling: propose specific times from calendar
- If unsure about intent, ask a clarifying question

### Step 6: Update State

After each email, update the state files:

```bash
echo "$EMAIL_ID" >> drafts/drafted   # or drafts/ignored
date -u '+%Y-%m-%dT%H:%M:%SZ' > drafts/last_processed
```

### Step 7: Summary

```
## Processing Summary
**Emails Scanned:** X
**Drafts Created:** Y
**Ignored:** Z

### Drafts Created:
- {id}: {subject} — {reason}

### Ignored:
- {id}: {subject} — {reason}
```

## Recruitment & Staffing Emails

**CRITICAL: Candidates must NEVER be copied on internal emails about them.**

When an email involves recruitment, staffing, or hiring:

1. **Identify the candidate** — Determine who the candidate is from the email
   thread and knowledge base (`knowledge/Candidates/`, `knowledge/People/`)
2. **Strip the candidate from recipients** — The draft must ONLY be addressed to
   internal stakeholders (hiring managers, recruiters, interview panel, etc.).
   The candidate’s email address must NOT appear in To, CC, or BCC
3. **Only recruiters email candidates directly** — If the email is a direct
   reply TO a candidate (e.g., scheduling an interview, extending an offer),
   flag it clearly so only the recruiter sends it. Add a note:
   `⚠️ RECRUITER ONLY — This email goes directly to the candidate.`

**Examples of internal recruitment emails (candidate must NOT be copied):**

- Interview feedback or debrief
- Candidate evaluation or comparison
- Hiring decision discussions
- Compensation/offer discussions
- Reference check follow-ups between colleagues

**When in doubt:** If an email thread mentions a candidate by name and involves
multiple internal recipients, treat it as internal and exclude the candidate.

## Constraints

- Never actually send emails — only create drafts
- Be conservative with ignore — when in doubt, create a draft
- For ambiguous emails, create a draft with a note explaining the ambiguity
