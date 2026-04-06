# Note Templates

Templates for creating new knowledge base notes.

## Priorities

Priorities are **not auto-created** by extract-entities. They are set
deliberately by the user. This template is for manual creation only.

```markdown
# {Priority Name}

## About
{2-3 sentences: what this strategic direction means and why it matters}

**Status:** {active|paused|retired}
**Owner:** [[People/{Person}]]
**Set:** {YYYY-MM-DD}

## What this means
{Bullet list of concrete implications — what does pursuing this priority look like?}

## Goals
{Time-bound targets that ladder to this priority — backlinks to knowledge/Goals/}

## Projects
- [[Projects/{Project}]] — {relationship}

## Key facts
{substantive facts only — leave empty if none}
```

## Goals

Goals are **not auto-created** by extract-entities. They are set deliberately
by the user. This template is for manual creation only.

```markdown
# {Goal Name}

## Info
**Priority:** [[Priorities/{Priority}]]
**Status:** {on track|at risk|off track|achieved|abandoned}
**Owner:** [[People/{Person}]]
**Target date:** {YYYY-MM-DD}
**Set:** {YYYY-MM-DD}

## Outcome
{1-2 sentences: what measurable success looks like}

## Blockers
{Active Conditions that impede this goal — link to knowledge/Conditions/}
- [[Conditions/{Condition}]] — {impact on this goal}

## Projects
- [[Projects/{Project}]] — {how it contributes}

## Progress
- **{YYYY-MM-DD}**: {Update on progress toward the outcome}

## Key facts
{substantive facts only — leave empty if none}

## Risks
{known risks to achieving this goal — leave empty if none}
```

## Conditions

Conditions are time-bound organizational states that affect multiple entities.
They can be **auto-created** by the librarian agent when cross-cutting patterns
are detected, or manually created by the user. They have a clear lifecycle:
active → resolved.

```markdown
# {Condition Name}

## Info
**Status:** {active|resolved}
**Since:** {YYYY-MM-DD}
**Resolved:** {YYYY-MM-DD or —}
**Trigger:** {What caused this condition}
**Blocker:** {Who/what must act for this to resolve}
**Resolution signal:** {What would indicate this condition has ended}

## Affects
{Goals, Projects, Roles, and People impacted by this condition}
- [[Goals/{Goal}]] — {how it's affected}
- [[Projects/{Project}]] — {how it's affected}
- [[Roles/{Role}]] — {how it's affected}

## Agent implications
{How agents should modify their behavior while this condition is active}
- **recruiter:** {e.g. "Hold offers. Continue interviews. Contractor route viable."}
- **postman:** {e.g. "Don't flag recruitment emails as urgent."}
- **chief-of-staff:** {e.g. "Surface in every briefing until resolved."}
- **head-hunter:** {e.g. "Continue scouting but note freeze in prospect notes."}

## Activity
- **{YYYY-MM-DD}** ({source}): {Update — new information, escalation, progress toward resolution}

## Key facts
{substantive facts only — leave empty if none}
```

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

## Goals
- [[Goals/{Goal}]] — {how this project contributes}

## People
- [[People/{Person}]] — {role}

## Organizations
- [[Organizations/{Org}]] — {relationship}

## Related
- [[Priorities/{Priority}]] — {relationship}
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
