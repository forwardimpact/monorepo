# Common Workflows

- "What should this engineer be demonstrating at the next level?" →
  `npx fit-landmark readiness --email <email>`
- "How is this team doing?" → `npx fit-landmark health --manager <email>`
- "What are engineers saying is blocking them?" →
  `npx fit-landmark voice --manager <email>`
- "What skills are practiced vs only on paper?" →
  `npx fit-landmark practiced --manager <email>`
- "Where do I stand?" (signed in) → `npx fit-landmark readiness` — the
  subject defaults to your own identity

Manager-scoped views take the team lead's **own** email. If a persona or
roster row carries a `parent_email` field, that is the person's upward
manager — do not pass it to `--manager` when asking about the person's
own team.
