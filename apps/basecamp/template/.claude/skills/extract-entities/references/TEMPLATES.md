# Note Templates

Templates for creating new knowledge base notes.

## People

```markdown
# {Full Name}

## Info
**Role:** {role or inferred role with qualifier}
**Organization:** [[Organizations/{organization}]]
**Reports to:** [[People/{{Person}}]]
**Email:** {email}
**Aliases:** {comma-separated variants}
**First met:** {YYYY-MM-DD}
**Last seen:** {YYYY-MM-DD}

## Summary
{2-3 sentences: who they are, why you know them, what you're working on}

## Connected to
- [[Organizations/{Org}]] — works at
- [[People/{Person}]] — {relationship}
- [[Projects/{Project}]] — {role}

## Activity
- **{YYYY-MM-DD}** ({meeting|email|voice memo}): {Summary with [[Folder/Name]] links}

## Key facts
{substantive facts only — leave empty if none}

## Open items
{commitments and next steps only — leave empty if none}
```

## Organizations

```markdown
# {Organization Name}

## Info
**Type:** {company|team|institution}
**Industry:** {industry}
**Relationship:** {customer|prospect|partner|vendor}
**Domain:** {primary email domain}
**Aliases:** {comma-separated}
**First met:** {YYYY-MM-DD}
**Last seen:** {YYYY-MM-DD}

## Summary
{2-3 sentences}

## People
- [[People/{Person}]] — {role}

## Contacts
{for transactional contacts who don't get their own notes}

## Projects
- [[Projects/{Project}]] — {relationship}

## Activity
- **{YYYY-MM-DD}** ({type}): {Summary}

## Key facts

## Open items
```

## Projects

```markdown
# {Project Name}

## Info
**Type:** {deal|product|initiative|hiring}
**Status:** {active|planning|on hold|completed|cancelled}
**Started:** {YYYY-MM-DD}
**Last activity:** {YYYY-MM-DD}

## Summary
{2-3 sentences}

## People
- [[People/{Person}]] — {role}

## Organizations
- [[Organizations/{Org}]] — {relationship}

## Related
- [[Topics/{Topic}]] — {relationship}

## Timeline
**{YYYY-MM-DD}** ({type})
{What happened with [[links]]}

## Decisions
- **{YYYY-MM-DD}**: {Decision}. {Rationale}.

## Open items

## Key facts
```

## Topics

```markdown
# {Topic Name}

## About
{1-2 sentences}

**Keywords:** {comma-separated}
**Aliases:** {other references}
**First mentioned:** {YYYY-MM-DD}
**Last mentioned:** {YYYY-MM-DD}

## Related
- [[People/{Person}]] — {relationship}
- [[Organizations/{Org}]] — {relationship}

## Log
**{YYYY-MM-DD}** ({type}: {title})
{Summary with [[links]]}

## Decisions

## Open items

## Key facts
```
