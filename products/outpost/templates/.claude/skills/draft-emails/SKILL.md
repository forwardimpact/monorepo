---
name: draft-emails
description: Draft and send email responses with context from the knowledge base and calendar. Use when the user asks to draft, reply to, respond to, or send an email.
---

# Draft Emails

Write tier: `0-Draft`
Frontmatter: none

Draft and send email responses. Use the knowledge base and calendar for full
context on every person and conversation. Every draft needs explicit user
approval before you send it.

## Trigger

The user asks to draft, reply to, respond to, or send an email.

## Prerequisites

- Knowledge base populated (from `extract-entities`).
- Synced email data in `~/.cache/fit/outpost/apple_mail/`.

## Data locations

| Data            | Location                                            |
| --------------- | --------------------------------------------------- |
| People          | `3-Team/People/*.md`                                 |
| Organizations   | `3-Team/Organizations/*.md`                          |
| Email threads   | `~/.cache/fit/outpost/apple_mail/*.md`               |
| Calendar events | `~/.cache/fit/outpost/apple_calendar/*.json`         |
| Handled IDs     | `~/.cache/fit/outpost/drafts/handled` (one ID/line)  |
| Ignored IDs     | `~/.cache/fit/outpost/drafts/ignored` (one ID/line)  |
| Draft files     | `0-Draft/{email_id}_draft.md`                        |

`handled` and `ignored` both exclude threads from `scan-emails.mjs`. Use
`handled` for resolved threads (sent here, replied manually, resolved through a
DM). Use `ignored` for threads that need no response (newsletters, spam,
outbound with no reply). The ledgers are agent state, not knowledge. They live
in the cache `drafts/` directory, never in `state/` (a daemon-owned trust
root).

<do_confirm_checklist goal="Verify a draft is safe and ready before sending">

- [ ] You looked up the sender and the organization in `3-Team/` before you
      drafted.
- [ ] The draft is a single email (not multiple variants). It matches the
      incoming tone.
- [ ] The body has no sign-off, name, or "Best". The Apple Mail signature
      handles it.
- [ ] In a recruitment thread, the candidate is excluded from internal
      recipients. Any direct-to-candidate draft carries `⚠️ RECRUITER ONLY`.
- [ ] The draft includes no sensitive personal data (health, politics, etc.).
- [ ] The user explicitly approved the draft before any send.
- [ ] Send used `--draft <path>` so cleanup and the `handled` ledger happen
      automatically.

</do_confirm_checklist>

## Procedure

### 1. Scan for new emails

```bash
node scripts/scan-emails.mjs
```

The script outputs `email_id<TAB>subject` for unprocessed emails (those not in
the `handled` or `ignored` ledger).

### 2. Classify

**Ignore** (append the ID to `~/.cache/fit/outpost/drafts/ignored`):
newsletters, marketing, automated notifications, spam, outbound with no reply.

**Draft a response**: meeting requests, personal mail from known contacts,
business inquiries or follow-ups, requests for information or action.

Be conservative with ignore. When in doubt, draft.

### 3. Gather context

Before you draft, look up the sender and the organization in the graph:

```bash
rg -l "sender_name" [0-9]-*/
cat "3-Team/People/Sender Name.md"
cat "3-Team/Organizations/Company Name.md"
```

For an email that arranges a meeting time, also read the relevant calendar
event:

```bash
ls ~/.cache/fit/outpost/apple_calendar/ 2>/dev/null
cat "$HOME/.cache/fit/outpost/apple_calendar/event123.json"
```

Extract role, organization, relationship history, and open items. If the intent
is unclear or the person has multiple contexts, **ask** rather than guess.

### 4. Write the draft

Save to `0-Draft/{email_id}_draft.md` with the template in
[references/template.md](references/template.md). Reference past interactions
naturally. To arrange a meeting, propose specific times from the calendar
availability.

### 5. Recruitment & staffing emails

You **must never** copy candidates on internal threads about them.

- Identify the candidate from the thread and `2-Confidential/Candidates/`.
- Strip the candidate from To/CC. Draft to internal stakeholders only.
- Direct-to-candidate emails carry the warning header
  `⚠️ RECRUITER ONLY — This email goes directly to the candidate.`

If a thread mentions a candidate and includes multiple internal recipients,
treat it as internal. Exclude the candidate.

### 6. Present and approve

Show the draft to the user. Wait for explicit approval before you send. Apply
edits. Present the draft again as needed.

### 7. Send

After the user approves, send the email through Apple Mail:

```bash
node scripts/send-email.mjs \
  --to "recipient@example.com" \
  --cc "other@example.com" \
  --subject "Re: Subject" \
  --body "Plain text body" \
  --draft "0-Draft/12345_draft.md"
```

Required: `--to`, `--subject`, `--body` (plain text). Optional: `--cc`, `--bcc`,
`--draft`. With `--draft`, the script deletes the draft file. It also appends
the email ID to the `handled` ledger automatically.

### 8. Mark handled and do not send

When other channels resolve a thread:

```bash
mkdir -p ~/.cache/fit/outpost/drafts
echo "$EMAIL_ID" >> ~/.cache/fit/outpost/drafts/handled
rm -f "0-Draft/${EMAIL_ID}_draft.md"
```
