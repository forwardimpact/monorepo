# People and Organization Templates

Every template opens with the YAML frontmatter block: the core keys (`type`,
`created`, `updated`) plus the type's conditional keys from `registry.yaml`.
A key lifted into frontmatter (`aliases` here) leaves the body; unmatched
bold keys stay body prose.

## People

```markdown
---
type: person
created: {YYYY-MM-DD}
updated: {YYYY-MM-DD}
aliases:
  - "{name variant}"
---

# {Full Name}

## Info
**Role:** {role or inferred role with qualifier}
**Organization:** [[3-Team/Organizations/{organization}]]
**Reports to:** [[3-Team/People/{{Person}}]]
**Email:** {email}
**First met:** {YYYY-MM-DD}
**Last seen:** {YYYY-MM-DD}

## Summary
{2-3 sentences: who they are, why you know them, what you're working on}

## Connected to
- [[3-Team/Organizations/{Org}]] — works at
- [[3-Team/People/{Person}]] — {relationship}
- [[3-Team/Projects/{Project}]] — {role}

## Activity
- **{YYYY-MM-DD}** ({meeting|email|voice memo}): {Summary with [[3-Team/Folder/Name]] links}

## Key facts
{substantive facts only — leave empty if none}

## Open items
{commitments and next steps only — leave empty if none}
```

## Organizations

```markdown
---
type: organization
created: {YYYY-MM-DD}
updated: {YYYY-MM-DD}
aliases:
  - "{name variant}"
---

# {Organization Name}

## Info
**Type:** {company|team|institution}
**Industry:** {industry}
**Relationship:** {customer|prospect|partner|vendor}
**Domain:** {primary email domain}
**First met:** {YYYY-MM-DD}
**Last seen:** {YYYY-MM-DD}

## Summary
{2-3 sentences}

## People
- [[3-Team/People/{Person}]] — {role}

## Contacts
{for transactional contacts who don't get their own notes}

## Projects
- [[3-Team/Projects/{Project}]] — {relationship}

## Activity
- **{YYYY-MM-DD}** ({type}): {Summary}

## Key facts

## Open items
```
