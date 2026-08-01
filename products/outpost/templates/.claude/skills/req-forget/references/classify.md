# Reference Classification

Reference for `req-forget` Step 2. For every match in the inventory, pick the
action below.

| Reference Type                     | Action                                         | Example                                         |
| ---------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| **Dedicated note** (sole subject)  | Delete the entire file                         | `Knowledge/People/{Name}.md`                    |
| **Dedicated directory**            | Delete the entire directory                    | `Knowledge/Candidates/{Name}/`                  |
| **Mention in another note**        | Redact: remove the lines that name the person  | Backlink in `Knowledge/Organizations/Agency.md` |
| **Email thread** (sole subject)    | Delete the file                                | `~/.cache/fit/outpost/apple_mail/thread.md`     |
| **Email thread** (multiple people) | Redact: remove the paragraphs about the person | A thread about multiple candidates              |
| **Attachment** (their CV, etc.)    | Delete the file                                | `attachments/{thread}/CV.pdf`                   |
| **Triage/state file**              | Redact: remove the lines that mention them     | `recruiter_triage.md`                           |
| **Insights file**                  | Redact: remove the bullets that mention them   | `Knowledge/Candidates/Insights.md`              |

## Redaction rules

- Remove entire bullet points that mention the person by name.
- Remove the table rows that contain the person's name.
- Remove the `## Connected to` entries that link to deleted notes.
- If a section becomes empty after redaction, remove its header too.
- Do **not** remove nearby context that does not identify the person.
