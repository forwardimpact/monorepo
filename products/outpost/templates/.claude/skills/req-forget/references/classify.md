# Reference Classification

Reference for `req-forget` Step 2. For every match in the inventory, pick the
action below.

| Reference Type                     | Action                                      | Example                                         |
| ---------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| **Dedicated note** (sole subject)  | Delete entire file                          | `Knowledge/People/{Name}.md`                    |
| **Dedicated directory**            | Delete entire directory                     | `Knowledge/Candidates/{Name}/`                  |
| **Mention in another note**        | Redact: remove lines referencing the person | Backlink in `Knowledge/Organizations/Agency.md` |
| **Email thread** (sole subject)    | Delete file                                 | `~/.cache/fit/outpost/apple_mail/thread.md`     |
| **Email thread** (multiple people) | Redact: remove paragraphs about the person  | Thread discussing multiple candidates           |
| **Attachment** (their CV, etc.)    | Delete file                                 | `attachments/{thread}/CV.pdf`                   |
| **Triage/state file**              | Redact: remove lines mentioning them        | `recruiter_triage.md`                           |
| **Insights file**                  | Redact: remove bullets mentioning them      | `Knowledge/Candidates/Insights.md`              |

## Redaction rules

- Remove entire bullet points that mention the person by name.
- Remove table rows containing the person's name.
- Remove `## Connected to` entries linking to deleted notes.
- If a section becomes empty after redaction, remove its header too.
- Do **not** remove surrounding context that doesn't identify the person.
