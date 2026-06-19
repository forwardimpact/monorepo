# Bidirectional Links

Reference for `extract-entities` Step 10 and Step 7c (Priorities).

## Bidirectional link rules

After writing, verify each link goes both ways.

| If you add...          | Then also add...                             |
| ---------------------- | -------------------------------------------- |
| Person → Organization  | Organization → Person (in People section)    |
| Person → Project       | Project → Person (in People section)         |
| Project → Organization | Organization → Project (in Projects section) |
| Project → Priority     | Priority → Project (in Projects section)     |
| Condition → Project    | Project → Condition (in Related section)     |
| Condition → Role       | Role → Condition (notes or status field)     |

Use absolute paths everywhere: `[[People/Sarah Chen]]`,
`[[Organizations/Acme Corp]]`, `[[Projects/Acme Integration]]`,
`[[Priorities/Priority Name]]`, `[[Conditions/Condition Name]]`.

## Priorities (Step 7c)

Match source themes against priority names and descriptions.

- Add `[[Priorities/{Priority}]]` to a Project or Topic `## Related` section if
  not already present.
- Update the Priority's `## Projects` section when a new project emerges that
  serves it.

**Never auto-create Priorities.** Don't over-link — a project that already links
to a Priority through a related Topic doesn't need a redundant direct Priority
link.
