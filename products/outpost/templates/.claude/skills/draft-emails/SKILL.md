---
name: draft-emails
description: Draft and send email responses using the knowledge base and calendar for context. Use when the user asks to draft, reply to, respond to, or send an email.
---

# Draft Emails

Draft and send email responses using the knowledge base and calendar for full
context on every person and conversation. Every draft requires explicit user
approval before sending.

## Trigger

The user asks to draft, reply to, respond to, or send an email.

## Prerequisites

- Knowledge base populated (from `extract-entities`).
- Synced email data in `~/.cache/fit/outpost/apple_mail/`.

## Data locations

| Data            | Location                                     |
| --------------- | -------------------------------------------- |
| People          | `Knowledge/People/*.md`                      |
| Organizations   | `Knowledge/Organizations/*.md`               |
| Email threads   | `~/.cache/fit/outpost/apple_mail/*.md`       |
| Calendar events | `~/.cache/fit/outpost/apple_calendar/*.json` |
| Handled IDs     | `Drafts/handled` (one ID per line)           |
| Ignored IDs     | `Drafts/ignored` (one ID per line)           |
| Draft files     | `Drafts/{email_id}_draft.md`                 |

`handled` and `ignored` both exclude threads from `scan-emails.mjs`. Use
`handled` for resolved threads (sent here, replied manually, resolved via DM);
`ignored` for threads that need no response (newsletters, spam, outbound with no
reply).

<do_confirm_checklist goal="Verify a draft is safe and ready before sending">

- [ ] Sender and organization were looked up in `Knowledge/` before drafting.
- [ ] Draft is a single email (not multiple variants) and matches the incoming
      tone.
- [ ] Body has no sign-off / name / "Best" — Apple Mail signature handles it.
- [ ] Recruitment thread: candidate excluded from internal recipients; any
      direct-to-candidate draft is flagged `⚠️ RECRUITER ONLY`.
- [ ] No sensitive personal data (health, politics, etc.) was included.
- [ ] User has explicitly approved the draft before any send.
- [ ] Send used `--draft <path>` so cleanup and `Drafts/handled` happen
      automatically.

</do_confirm_checklist>

## Procedure

### 1. Scan for new emails

```bash
node scripts/scan-emails.mjs
```

Outputs `email_id<TAB>subject` for unprocessed emails (those not in
`Drafts/handled` or `Drafts/ignored`).

### 2. Classify

**Ignore** (append ID to `Drafts/ignored`): newsletters, marketing, automated
notifications, spam, outbound with no reply.

**Draft a response**: meeting requests, personal mail from known contacts,
business inquiries or follow-ups, requests for information or action.

Be conservative with ignore — when in doubt, draft.

### 3. Gather context

Before drafting, look up the sender and organization in `Knowledge/`:

```bash
rg -l "sender_name" Knowledge/
cat "Knowledge/People/Sender Name.md"
cat "Knowledge/Organizations/Company Name.md"
```

For scheduling emails, also read the relevant calendar event:

```bash
ls ~/.cache/fit/outpost/apple_calendar/ 2>/dev/null
cat "$HOME/.cache/fit/outpost/apple_calendar/event123.json"
```

Extract role, organization, relationship history, and open items. If intent is
unclear or the person has multiple contexts, **ask** rather than guess.

### 4. Write the draft

Save to `Drafts/{email_id}_draft.md` using the template in
[references/template.md](references/template.md). Reference past interactions
naturally; for scheduling, propose specific times from calendar availability.

### 5. Recruitment & staffing emails

Candidates **must never** be copied on internal threads about them.

- Identify the candidate from the thread and `Knowledge/Candidates/`.
- Strip the candidate from To/CC; draft to internal stakeholders only.
- Direct-to-candidate emails carry the warning header
  `⚠️ RECRUITER ONLY — This email goes directly to the candidate.`

If a thread mentions a candidate and includes multiple internal recipients,
treat it as internal and exclude the candidate.

### 6. Present and approve

Show the draft to the user. Wait for explicit approval before sending. Apply
edits and present again as needed.

### 7. Send

After approval, send via Apple Mail:

```bash
node scripts/send-email.mjs \
  --to "recipient@example.com" \
  --cc "other@example.com" \
  --subject "Re: Subject" \
  --body "Plain text body" \
  --draft "Drafts/12345_draft.md"
```

Required: `--to`, `--subject`, `--body` (plain text). Optional: `--cc`, `--bcc`,
`--draft`. With `--draft`, the draft file is deleted and the email ID is
appended to `Drafts/handled` automatically.

### 8. Mark handled without sending

When a thread is resolved through other channels:

```bash
echo "$EMAIL_ID" >> Drafts/handled
rm -f "Drafts/${EMAIL_ID}_draft.md"
```
