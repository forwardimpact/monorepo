---
applyTo: "apps/schema/**"
---

# Schema Tasks

## Add Skill

1. Add skill to capability file
   `apps/schema/examples/capabilities/{capability_id}.yaml`
2. Add skill object with `id`, `name`, and `human:` section
3. Include level descriptions for all five levels
4. Reference skill in disciplines (coreSkills/supportingSkills/broadSkills)
5. Add questions to `apps/schema/examples/questions/skills/{skill_id}.yaml`
6. Optionally add `agent:` section for AI coding agent support
7. Run `npx fit-schema validate`

## Add Interview Questions

Location:

- Skills: `apps/schema/examples/questions/skills/{skill_id}.yaml`
- Behaviours: `apps/schema/examples/questions/behaviours/{behaviour_id}.yaml`

Required properties:

| Property     | Description                                    |
| ------------ | ---------------------------------------------- |
| `id`         | Format: `{abbrev}_{level_abbrev}_{number}`     |
| `text`       | Question text (second person, under 150 chars) |
| `lookingFor` | 2-4 bullet points of good answer indicators    |

## Add Agent Skill Section

1. Add `agent:` section to skill in capability file
2. Include: `name`, `description`, `useWhen`, `stages`
3. Define stage guidance: `focus`, `activities[]`, `ready[]`
4. Run `npx fit-schema validate`

```yaml
agent:
  name: skill-name-kebab-case
  description: Brief description
  useWhen: When agents should apply this skill
  stages:
    plan:
      focus: Planning objectives
      activities: [...]
      ready: [...]
    code:
      focus: Implementation objectives
      activities: [...]
      ready: [...]
```

## Add Tool Reference

Add `toolReferences:` to skill in capability file:

```yaml
toolReferences:
  - name: Langfuse
    url: https://langfuse.com/docs
    description: LLM observability platform
    useWhen: Instrumenting AI applications
```

## Schema CLI

```sh
npx fit-schema validate          # Validate all data
npx fit-schema generate-index    # Generate browser indexes
npx fit-schema validate --shacl  # Validate RDF/SHACL
```
